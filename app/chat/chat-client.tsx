'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

interface ChatClientProps {
  activeCircuit: { id: string; title: string } | null;
  initialQuestion: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  meta?: {
    category?: string;
    model?: string;
    retrievalCount?: number;
  };
}

export function ChatClient({ activeCircuit, initialQuestion }: ChatClientProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(initialQuestion);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const historyForRequest = useMemo(
    () =>
      messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    [messages],
  );

  async function sendMessage() {
    const question = input.trim();
    if (!question || pending) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: question },
      { role: 'assistant', content: '' },
    ];
    setMessages(nextMessages);
    setInput('');
    setError(null);
    setPending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: question,
          history: historyForRequest,
          circuitId: activeCircuit?.id,
        }),
      });

      if (!response.ok) {
        const payload = await safeErrorPayload(response);
        throw new Error(payload);
      }
      if (!response.body) throw new Error('Chat response body was empty.');

      await readEventStream(response.body, {
        onDelta(text) {
          setMessages((current) => {
            const updated = [...current];
            const last = updated[updated.length - 1];
            if (!last || last.role !== 'assistant') return current;
            updated[updated.length - 1] = {
              ...last,
              content: last.content + text,
            };
            return updated;
          });
        },
        onDone(meta) {
          setMessages((current) => {
            const updated = [...current];
            const last = updated[updated.length - 1];
            if (!last || last.role !== 'assistant') return current;
            updated[updated.length - 1] = {
              ...last,
              meta: {
                category: typeof meta.category === 'string' ? meta.category : undefined,
                model: typeof meta.model === 'string' ? meta.model : undefined,
                retrievalCount: Array.isArray(meta.retrieval) ? meta.retrieval.length : undefined,
              },
            };
            return updated;
          });
        },
        onError(message) {
          throw new Error(message);
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Chat failed.';
      setError(message);
      setMessages((current) => current.slice(0, Math.max(0, current.length - 1)));
      setInput(question);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid h-full min-h-[60dvh] grid-rows-[1fr_auto] gap-4">
      <section className="overflow-y-auto border border-border bg-card">
        <div className="space-y-6 p-4">
          {messages.length === 0 ? (
            <div className="max-w-2xl">
              <p className="text-sm text-muted-foreground">
                Try a circuit-level question like &quot;why is this LED node called D1_ANODE&quot;,
                &quot;review this regulator path&quot;, or &quot;what happens to cutoff if I double C&quot;.
              </p>
            </div>
          ) : null}

          {messages.map((message, index) => (
            <article
              key={index}
              className={message.role === 'user' ? 'ml-auto max-w-2xl' : 'max-w-3xl'}
            >
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {message.role === 'user' ? 'You' : 'eencyclopedia AI'}
              </div>
              <div
                className={
                  message.role === 'user'
                    ? 'rounded-md bg-primary px-4 py-3 text-sm text-primary-foreground'
                    : 'whitespace-pre-wrap text-sm leading-relaxed text-foreground'
                }
              >
                {message.content || (pending && index === messages.length - 1 ? 'Thinking...' : '')}
              </div>
              {message.role === 'assistant' && message.meta ? (
                <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {message.meta.model ?? 'model'}
                  {message.meta.category ? ` · ${message.meta.category}` : ''}
                  {typeof message.meta.retrievalCount === 'number'
                    ? ` · ${message.meta.retrievalCount} retrieval hit${message.meta.retrievalCount === 1 ? '' : 's'}`
                    : ''}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="border border-border bg-background p-4">
        <label htmlFor="chat-input" className="sr-only">
          Ask eencyclopedia
        </label>
        <textarea
          id="chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          rows={4}
          placeholder={
            activeCircuit
              ? `Ask about ${activeCircuit.title}`
              : 'Ask about a circuit, part, or design tradeoff'
          }
          className="w-full resize-none bg-background text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Ctrl/Cmd + Enter to send
          </p>
          <Button onClick={() => void sendMessage()} disabled={pending || input.trim().length === 0}>
            {pending ? 'Sending...' : 'Send'}
          </Button>
        </div>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </section>
    </div>
  );
}

async function readEventStream(
  stream: ReadableStream<Uint8Array>,
  handlers: {
    onDelta: (text: string) => void;
    onDone: (meta: Record<string, unknown>) => void;
    onError: (message: string) => void;
  },
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      consumeEvent(rawEvent, handlers);
      boundary = buffer.indexOf('\n\n');
    }
  }
}

function consumeEvent(
  rawEvent: string,
  handlers: {
    onDelta: (text: string) => void;
    onDone: (meta: Record<string, unknown>) => void;
    onError: (message: string) => void;
  },
) {
  const lines = rawEvent.split('\n');
  const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
  const dataLine = lines.find((line) => line.startsWith('data:'))?.slice(5).trim();
  if (!event || !dataLine) return;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(dataLine) as Record<string, unknown>;
  } catch {
    return;
  }

  if (event === 'delta' && typeof payload.text === 'string') {
    handlers.onDelta(payload.text);
  } else if (event === 'done') {
    handlers.onDone(payload);
  } else if (event === 'error') {
    handlers.onError(typeof payload.message === 'string' ? payload.message : 'Chat failed.');
  }
}

async function safeErrorPayload(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return typeof payload.error === 'string' ? payload.error : 'Chat failed.';
  } catch {
    return 'Chat failed.';
  }
}
