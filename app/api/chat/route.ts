import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildSystemPrompt } from '@/lib/ai/system-prompts';
import { retrieveRelevantChunks } from '@/lib/ai/rag';
import {
  buildChatUserPrompt,
  classifyChatRequest,
  defaultModeFromSettings,
  defaultUnitsFromSettings,
  extractCalculatorInvocation,
  formatCalculatorReply,
  formatOffTopicReply,
  materializeCircuitPromptContext,
  pickChatModel,
  runCalculatorInvocation,
  serializeRetrievalPreview,
  stripModelOverride,
  type ModelOverride,
} from '@/lib/ai/router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4_000),
});

const ChatRequestSchema = z.object({
  message: z.string().trim().min(1, 'Message is required.').max(4_000),
  history: z.array(ChatMessageSchema).max(12).default([]),
  circuitId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in to use chat.' }, { status: 401 });
  }

  const body = await safeJson(request);
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 },
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, tier, settings')
    .eq('id', user.id)
    .single();
  const profileRow = (profile ?? null) as
    | {
        username?: string | null;
        tier?: string | null;
        settings?: Record<string, unknown> | null;
      }
    | null;
  const settings =
    profileRow?.settings && typeof profileRow.settings === 'object'
      ? profileRow.settings
      : {};

  const capError = await checkDailySpendCap(supabase, user.id, profileRow?.tier ?? 'free');
  if (capError) {
    return NextResponse.json({ error: capError }, { status: 429 });
  }

  const stripped = stripModelOverride(parsed.data.message);
  const latestMessage = stripped.cleaned;
  const modelOverride = stripped.modelOverride;

  let activeCircuit:
    | {
        id: string;
        title: string;
        ai_summary: string | null;
        ai_summary_struct: Record<string, unknown> | null;
      }
    | undefined;
  if (parsed.data.circuitId) {
    const { data: circuit } = await supabase
      .from('schematics')
      .select('id, title, ai_summary, ai_summary_struct')
      .eq('id', parsed.data.circuitId)
      .maybeSingle();

    if (circuit) {
      activeCircuit = {
        id: String((circuit as { id: string }).id),
        title: String((circuit as { title: string }).title),
        ai_summary:
          typeof (circuit as { ai_summary?: string | null }).ai_summary === 'string'
            ? ((circuit as { ai_summary?: string }).ai_summary ?? null)
            : null,
        ai_summary_struct:
          (circuit as { ai_summary_struct?: Record<string, unknown> | null }).ai_summary_struct ??
          null,
      };
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      void (async () => {
        try {
          const route = await classifyChatRequest({
            message: latestMessage,
            hasCircuitContext: !!activeCircuit,
            modelOverride,
          });

          send('meta', {
            category: route.category,
            reasoning: route.reasoning,
            circuit: activeCircuit ? { id: activeCircuit.id, title: activeCircuit.title } : null,
          });

          if (route.category === 'off_topic') {
            await emitReply(send, formatOffTopicReply(), {
              category: route.category,
              model: 'policy',
              retrieval: [],
            });
            controller.close();
            return;
          }

          if (route.category === 'trivial_calc' && route.toolHint) {
            const invocation = await extractCalculatorInvocation({
              question: latestMessage,
              toolHint: route.toolHint,
            });

            if (invocation) {
              const result = runCalculatorInvocation(invocation);
              const reply = formatCalculatorReply({
                invocation,
                result,
                mode: defaultModeFromSettings(settings),
              });
              await emitReply(send, reply, {
                category: route.category,
                model: 'deterministic-calc',
                retrieval: [],
              });
              controller.close();
              return;
            }
          }

          const retrieval =
            route.shouldUseRag || route.category === 'parts_lookup'
              ? await retrieveRelevantChunks({ query: latestMessage, limit: 6 })
              : [];

          const circuitSummary = activeCircuit
            ? materializeCircuitPromptContext({
                circuitId: activeCircuit.id,
                title: activeCircuit.title,
                aiSummary: activeCircuit.ai_summary,
                aiSummaryStruct: activeCircuit.ai_summary_struct,
              })
            : null;

          const system = buildSystemPrompt({
            username:
              typeof profileRow?.username === 'string' && profileRow.username.length > 0
                ? profileRow.username
                : 'engineer',
            mode: defaultModeFromSettings(settings),
            units: defaultUnitsFromSettings(settings),
            circuitSummary: circuitSummary ?? undefined,
            retrieval,
          });

          const userPrompt = buildChatUserPrompt({
            latestMessage,
            history: parsed.data.history,
          });
          const chatCategory =
            route.category === 'trivial_calc' ? 'deep_analysis' : route.category;

          const response = await runChatCompletion({
            category: chatCategory,
            circuitId: activeCircuit?.id,
            modelOverride,
            system,
            userPrompt,
          });

          await emitReply(send, response.text, {
            category: route.category,
            model: response.modelLabel,
            retrieval: serializeRetrievalPreview(retrieval),
          });
          controller.close();
        } catch (error: unknown) {
          send('error', { message: errorMessage(error) });
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

async function runChatCompletion(args: {
  category: 'parts_lookup' | 'schematic_explain' | 'deep_analysis' | 'opus_required';
  circuitId?: string;
  modelOverride: ModelOverride;
  system: string;
  userPrompt: string;
}) {
  const { messages, resolveModelSlug } = await import('@/lib/ai/llm');

  const modelClass = pickChatModel({
    category: args.category,
    modelOverride: args.modelOverride,
  });

  // Provider-agnostic slug resolution: returns the right model name for
  // whichever AI_PROVIDER the env is configured for.
  const model = resolveModelSlug(modelClass);

  const response = await messages({
    endpoint: 'chat',
    model,
    system: args.system,
    user: args.userPrompt,
    schematicId: args.circuitId,
    maxTokens: modelClass === 'haiku' ? 1_200 : 1_800,
    timeoutMs: 20_000,
    cacheable: false,
  });

  return {
    text: response.text,
    modelLabel: modelClass,
  };
}

async function emitReply(
  send: (event: string, data: Record<string, unknown>) => void,
  reply: string,
  doneMeta: Record<string, unknown>,
) {
  for (const chunk of chunkReply(reply)) {
    send('delta', { text: chunk });
    await Promise.resolve();
  }
  send('done', doneMeta);
}

function chunkReply(reply: string): string[] {
  const chunks: string[] = [];
  const pieces = reply.split(/(\s+)/);
  let current = '';

  for (const piece of pieces) {
    if ((current + piece).length > 160 && current.length > 0) {
      chunks.push(current);
      current = piece;
    } else {
      current += piece;
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [''];
}

async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function checkDailySpendCap(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  userId: string,
  tier: string,
): Promise<string | null> {
  const { serverEnv } = await import('@/lib/env');
  const { data } = await supabase.rpc('ai_spend_today' as never, {
    p_user_id: userId,
  } as never);
  const spendToday = typeof data === 'number' ? data : 0;

  const cap =
    tier === 'pro_plus'
      ? serverEnv.AI_DAILY_CAP_PRO_PLUS
      : tier === 'pro'
        ? serverEnv.AI_DAILY_CAP_PRO
        : serverEnv.AI_DAILY_CAP_FREE;

  return spendToday >= cap
    ? `You have reached today's AI spend cap ($${cap.toFixed(2)}). Try again tomorrow.`
    : null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Chat failed.';
}
