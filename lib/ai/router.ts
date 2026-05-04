import { z } from 'zod';
import { calc, type CalcResult } from '@/lib/calc';
import type { ExplanationMode, Units, SystemPromptCtx } from '@/lib/ai/system-prompts';
import type { RetrievalChunk } from '@/lib/ai/rag';

export type RouteCategory =
  | 'trivial_calc'
  | 'parts_lookup'
  | 'schematic_explain'
  | 'deep_analysis'
  | 'off_topic'
  | 'opus_required';

export type ModelOverride = 'haiku' | 'sonnet' | 'opus' | null;

export interface RouteDecision {
  category: RouteCategory;
  confidence: number;
  reasoning: string;
  toolHint: string | null;
  shouldUseRag: boolean;
  estimatedComplexity: 'low' | 'medium' | 'high';
}

export type CircuitPromptContext = NonNullable<SystemPromptCtx['circuitSummary']>;

export interface CalculatorInvocation {
  tool: CalculatorTool;
  args: Record<string, number | string | null>;
}

type CalculatorTool =
  | 'calc.ohm'
  | 'calc.voltageDivider'
  | 'calc.currentDivider'
  | 'calc.rcTau'
  | 'calc.rlTau'
  | 'calc.ledResistor'
  | 'calc.opampGain.inverting'
  | 'calc.opampGain.nonInverting'
  | 'calc.reactance.Xc'
  | 'calc.reactance.Xl'
  | 'calc.resonance'
  | 'calc.cutoffFreq';

const RouteDecisionSchema = z.object({
  category: z.enum([
    'trivial_calc',
    'parts_lookup',
    'schematic_explain',
    'deep_analysis',
    'off_topic',
    'opus_required',
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  tool_hint: z.string().nullable(),
  should_use_rag: z.boolean(),
  estimated_complexity: z.enum(['low', 'medium', 'high']),
});

const CalculatorInvocationSchema = z.object({
  tool: z.enum([
    'calc.ohm',
    'calc.voltageDivider',
    'calc.currentDivider',
    'calc.rcTau',
    'calc.rlTau',
    'calc.ledResistor',
    'calc.opampGain.inverting',
    'calc.opampGain.nonInverting',
    'calc.reactance.Xc',
    'calc.reactance.Xl',
    'calc.resonance',
    'calc.cutoffFreq',
  ]),
  args: z.record(z.union([z.number(), z.string(), z.null()])),
});

const CALC_INTUITION: Record<CalculatorTool, string> = {
  'calc.ohm':
    "Ohm's law is the basic trade between voltage, current, and resistance: if two are fixed, the third is forced.",
  'calc.voltageDivider':
    'A divider is just resistance ratio turning one rail into a smaller rail, as long as the load does not drag the midpoint around.',
  'calc.currentDivider':
    'Parallel branches split current inversely with resistance, so the lower-resistance branch carries more current.',
  'calc.rcTau':
    'The RC time constant sets how fast the capacitor can charge or discharge through the resistor.',
  'calc.rlTau':
    'The RL time constant sets how fast inductor current can rise or fall against the resistor.',
  'calc.ledResistor':
    'The resistor burns the excess supply voltage so the LED current stays near the target instead of running away.',
  'calc.opampGain.inverting':
    'In the ideal inverting stage, the resistor ratio alone sets closed-loop gain and flips the signal polarity.',
  'calc.opampGain.nonInverting':
    'In the ideal non-inverting stage, the feedback ratio boosts gain while keeping the output in phase with the input.',
  'calc.reactance.Xc':
    'A capacitor looks like a larger impedance at low frequency and a smaller impedance at high frequency.',
  'calc.reactance.Xl':
    'An inductor looks like a smaller impedance at low frequency and a larger impedance at high frequency.',
  'calc.resonance':
    'At resonance, the inductor and capacitor exchange energy at the natural frequency set by L and C.',
  'calc.cutoffFreq':
    'The cutoff frequency is where a first-order RC filter is down 3 dB and starts rolling off hard.',
};

export function stripModelOverride(input: string): {
  cleaned: string;
  modelOverride: ModelOverride;
} {
  const trimmed = input.trimStart();
  const match = trimmed.match(/^\/(haiku|sonnet|opus)\b/i);
  if (!match) return { cleaned: input.trim(), modelOverride: null };

  const modelOverride = (match[1] ?? 'sonnet').toLowerCase() as Exclude<ModelOverride, null>;
  return {
    cleaned: trimmed.slice(match[0].length).trim(),
    modelOverride,
  };
}

export async function classifyChatRequest(args: {
  message: string;
  hasCircuitContext: boolean;
  modelOverride: ModelOverride;
}): Promise<RouteDecision> {
  const { ROUTER_SYSTEM_PROMPT } = await import('@/lib/ai/system-prompts');
  // Provider-agnostic dispatch: messages() and resolveModelSlug() pick
  // Anthropic vs Gemini based on AI_PROVIDER. The router classifier always
  // uses 'haiku-class' (cheapest fast model — Anthropic Haiku or Gemini
  // 2.0 Flash-Lite).
  const { messages, resolveModelSlug } = await import('@/lib/ai/llm');

  if (args.modelOverride === 'opus') {
    return {
      category: 'opus_required',
      confidence: 1,
      reasoning: 'User explicitly requested Opus.',
      toolHint: null,
      shouldUseRag: true,
      estimatedComplexity: 'high',
    };
  }

  const contextNote = args.hasCircuitContext
    ? '\nThe user is on a circuit page with active circuit context.'
    : '\nThere is no active circuit context.';

  const response = await messages({
    endpoint: 'router',
    model: resolveModelSlug('haiku'),
    system: ROUTER_SYSTEM_PROMPT,
    user: `${args.message.trim()}${contextNote}\nReturn JSON only.`,
    maxTokens: 300,
    timeoutMs: 8_000,
    cacheable: false,
  });

  const parsed = parseJsonObject(response.text, RouteDecisionSchema);
  if (!parsed) {
    return {
      category: args.hasCircuitContext ? 'schematic_explain' : 'deep_analysis',
      confidence: 0.25,
      reasoning: 'Router returned invalid JSON; falling back to analysis mode.',
      toolHint: null,
      shouldUseRag: true,
      estimatedComplexity: 'medium',
    };
  }

  return {
    category: parsed.category,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    toolHint: parsed.tool_hint,
    shouldUseRag: parsed.should_use_rag,
    estimatedComplexity: parsed.estimated_complexity,
  };
}

export async function extractCalculatorInvocation(args: {
  question: string;
  toolHint: string;
}): Promise<CalculatorInvocation | null> {
  const { messages, resolveModelSlug } = await import('@/lib/ai/llm');

  const response = await messages({
    endpoint: 'tool_call',
    model: resolveModelSlug('haiku'),
    system: buildCalculatorExtractionPrompt(args.toolHint),
    user: `${args.question.trim()}\nReturn JSON only.`,
    maxTokens: 300,
    timeoutMs: 8_000,
    cacheable: false,
  });

  return parseJsonObject(response.text, CalculatorInvocationSchema);
}

export function runCalculatorInvocation(invocation: CalculatorInvocation): CalcResult {
  switch (invocation.tool) {
    case 'calc.ohm':
      return calc.ohm({
        V: numberOrUndefined(invocation.args['V']),
        I: numberOrUndefined(invocation.args['I']),
        R: numberOrUndefined(invocation.args['R']),
      });
    case 'calc.voltageDivider':
      return calc.voltageDivider({
        Vin: numberOrThrow(invocation.args['Vin'], 'Vin'),
        R1: numberOrThrow(invocation.args['R1'], 'R1'),
        R2: numberOrThrow(invocation.args['R2'], 'R2'),
      });
    case 'calc.currentDivider':
      return calc.currentDivider({
        Itotal: numberOrThrow(invocation.args['Itotal'], 'Itotal'),
        R1: numberOrThrow(invocation.args['R1'], 'R1'),
        R2: numberOrThrow(invocation.args['R2'], 'R2'),
      });
    case 'calc.rcTau':
      return calc.rcTau({
        R: numberOrThrow(invocation.args['R'], 'R'),
        C: numberOrThrow(invocation.args['C'], 'C'),
      });
    case 'calc.rlTau':
      return calc.rlTau({
        R: numberOrThrow(invocation.args['R'], 'R'),
        L: numberOrThrow(invocation.args['L'], 'L'),
      });
    case 'calc.ledResistor':
      return calc.ledResistor({
        Vsupply: numberOrThrow(invocation.args['Vsupply'], 'Vsupply'),
        Vf: numberOrThrow(invocation.args['Vf'], 'Vf'),
        If: numberOrThrow(invocation.args['If'], 'If'),
      });
    case 'calc.opampGain.inverting':
      return calc.opampGain.inverting(
        numberOrThrow(invocation.args['Rf'], 'Rf'),
        numberOrThrow(invocation.args['Rin'], 'Rin'),
      );
    case 'calc.opampGain.nonInverting':
      return calc.opampGain.nonInverting(
        numberOrThrow(invocation.args['Rf'], 'Rf'),
        numberOrThrow(invocation.args['Rg'], 'Rg'),
      );
    case 'calc.reactance.Xc':
      return calc.reactance.Xc(
        numberOrThrow(invocation.args['f'], 'f'),
        numberOrThrow(invocation.args['C'], 'C'),
      );
    case 'calc.reactance.Xl':
      return calc.reactance.Xl(
        numberOrThrow(invocation.args['f'], 'f'),
        numberOrThrow(invocation.args['L'], 'L'),
      );
    case 'calc.resonance':
      return calc.resonance({
        L: numberOrThrow(invocation.args['L'], 'L'),
        C: numberOrThrow(invocation.args['C'], 'C'),
      });
    case 'calc.cutoffFreq':
      return calc.cutoffFreq({
        R: numberOrThrow(invocation.args['R'], 'R'),
        C: numberOrThrow(invocation.args['C'], 'C'),
      });
  }
}

export function formatCalculatorReply(args: {
  invocation: CalculatorInvocation;
  result: CalcResult;
  mode: ExplanationMode;
}): string {
  const directAnswer = formatDirectAnswer(args.invocation.tool, args.result);
  const derivation = args.result.steps
    .map((step) => (step.math ? `${step.text}\n$$${step.math}$$` : step.text))
    .join('\n\n');
  const citations = args.result.citation ? `[1] ${args.result.citation}` : '[1] Deterministic calculator result';
  const caveats =
    args.result.caveats && args.result.caveats.length > 0
      ? args.result.caveats.map((c) => `- ${c}`).join('\n')
      : '- Idealized calculation with the provided inputs.';

  const parts = [
    `**Direct answer**\n${directAnswer}`,
    `**Derivation**\n${derivation}`,
  ];

  if (args.mode !== 'math_only') {
    parts.push(`**Intuition**\n${CALC_INTUITION[args.invocation.tool]}`);
  }

  parts.push(`**Citations**\n${citations}`);
  parts.push(`**Caveats**\n${caveats}`);
  parts.push('> _Generated by eencyclopedia AI · Verify before use in production._');

  return parts.join('\n\n');
}

export function formatOffTopicReply(): string {
  return [
    "**Direct answer**\nThat's outside eencyclopedia's scope. I only handle electronics.",
    '**Derivation**\nNo engineering derivation applies because the request is off-topic.',
    '**Intuition**\nAsk me the electronics version of the problem, or about a circuit you are working on.',
    '**Citations**\n[1] Scope restriction defined by the eencyclopedia system rules.',
    '**Caveats**\n- Non-electronics requests are intentionally refused.',
    '> _Generated by eencyclopedia AI · Verify before use in production._',
  ].join('\n\n');
}

export function buildChatUserPrompt(args: {
  latestMessage: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}): string {
  const history = args.history
    .slice(-6)
    .map((message, index) => `Turn ${index + 1} ${message.role}: ${message.content.trim()}`)
    .join('\n');

  if (history.length === 0) return args.latestMessage.trim();

  return [
    'Conversation so far:',
    history,
    '',
    'Latest user message:',
    args.latestMessage.trim(),
  ].join('\n');
}

export function pickChatModel(args: {
  category: RouteCategory;
  modelOverride: ModelOverride;
}): 'haiku' | 'sonnet' | 'opus' {
  if (args.modelOverride) return args.modelOverride;
  if (args.category === 'opus_required') return 'opus';
  return 'sonnet';
}

export function materializeCircuitPromptContext(args: {
  circuitId: string;
  title: string;
  aiSummaryStruct: Record<string, unknown> | null;
  aiSummary: string | null;
}): CircuitPromptContext | null {
  const struct = args.aiSummaryStruct ?? {};
  const topology = stringField(struct['topology']) ?? 'unknown topology';
  const intent = stringField(struct['intent']) ?? stringField(args.aiSummary) ?? args.title;
  const designNotes = stringField(struct['design_notes']) ?? '';
  const rails = Array.isArray(struct['rails'])
    ? struct['rails'].filter((entry): entry is string => typeof entry === 'string')
    : [];
  const keyComponents = Array.isArray(struct['key_components'])
    ? struct['key_components']
        .filter(
          (entry): entry is Record<string, unknown> =>
            typeof entry === 'object' && entry !== null,
        )
        .map((entry) => ({
          designator: stringField(entry['designator']) ?? '?',
          mpn: stringField(entry['mpn']) ?? undefined,
          value: stringField(entry['value']) ?? undefined,
          role: stringField(entry['role']) ?? 'component',
        }))
    : [];

  return {
    id: args.circuitId,
    title: args.title,
    topology,
    rails,
    intent,
    key_components: keyComponents,
    design_notes: designNotes,
  };
}

export function defaultUnitsFromSettings(settings: Record<string, unknown>): Units {
  const units = settings['preferred_units'];
  return units === 'imperial' || units === 'mixed' ? units : 'SI';
}

export function defaultModeFromSettings(
  settings: Record<string, unknown>,
): ExplanationMode {
  const mode = settings['explanation_mode'];
  return mode === 'math_only' || mode === 'both' ? mode : 'intuitive';
}

export function serializeRetrievalPreview(chunks: RetrievalChunk[]): Array<{
  source_type: string;
  source_id: string;
}> {
  return chunks.map((chunk) => ({
    source_type: chunk.source_type,
    source_id: chunk.source_id,
  }));
}

function buildCalculatorExtractionPrompt(toolHint: string): string {
  return `You are eencyclopedia's calculator argument extractor.
You do not solve the problem. You only map the user's request into one calculator call.

Target tool: ${toolHint}

Rules:
  - Return JSON only.
  - Convert all quantities into SI base units.
  - For current in mA, convert to A.
  - For capacitance in uF/nF/pF, convert to F.
  - For inductance in mH/uH, convert to H.
  - For resistance in k/M, convert to ohms.
  - For frequencies in kHz/MHz, convert to Hz.
  - If the user did not provide a required value, set it to null.
  - Do not invent values.

Schema:
{
  "tool": "${toolHint}",
  "args": { "<arg>": <number|null> }
}`;
}

function parseJsonObject<T extends z.ZodTypeAny>(
  raw: string,
  schema: T,
): z.infer<T> | null {
  let trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/m);
  if (match && match[1]) trimmed = match[1].trim();

  try {
    const value = JSON.parse(trimmed) as unknown;
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function numberOrUndefined(value: number | string | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function numberOrThrow(value: number | string | null | undefined, label: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error(`Calculator argument ${label} is missing or invalid.`);
}

function formatDirectAnswer(tool: CalculatorTool, result: CalcResult): string {
  return `For ${humanToolName(tool)}, the computed result is ${formatValue(result.value)} ${result.unit}.`;
}

function humanToolName(tool: CalculatorTool): string {
  return tool.replace(/^calc\./, '').replace(/\./g, ' ');
}

function formatValue(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  if (Math.abs(value) >= 1_000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
    return value.toExponential(4);
  }
  return value.toPrecision(6).replace(/\.?0+$/, '');
}

function stringField(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
