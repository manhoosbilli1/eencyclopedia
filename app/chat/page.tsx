import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPlaceholderUsername } from '@/lib/auth/username';
import { ChatClient } from './chat-client';

export const metadata: Metadata = {
  title: 'Chat',
  description: 'Ask eencyclopedia about a circuit, part, or design tradeoff.',
};

export default async function ChatPage({
  searchParams,
}: {
  searchParams: { circuit?: string; q?: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/chat');

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single();
  const username =
    profile && typeof (profile as { username?: string }).username === 'string'
      ? (profile as { username: string }).username
      : null;
  if (username && isPlaceholderUsername(username)) {
    redirect('/onboarding');
  }

  let activeCircuit:
    | {
        id: string;
        title: string;
      }
    | null = null;

  if (searchParams.circuit) {
    const { data: circuit } = await supabase
      .from('schematics')
      .select('id, title')
      .eq('id', searchParams.circuit)
      .maybeSingle();

    if (circuit) {
      activeCircuit = {
        id: String((circuit as { id: string }).id),
        title: String((circuit as { title: string }).title),
      };
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-5xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Ask about a schematic, design review concern, rail behavior, or a quick
            component-level tradeoff. The AI answers in electronics mode only.
          </p>
        </div>
        {activeCircuit ? (
          <Link
            href={`/circuit/${activeCircuit.id}`}
            className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground underline hover:text-foreground"
          >
            Back to {activeCircuit.title}
          </Link>
        ) : null}
      </header>

      {activeCircuit ? (
        <section className="mt-6 border-y border-border py-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Active circuit
          </p>
          <p className="mt-1 text-sm text-foreground">{activeCircuit.title}</p>
        </section>
      ) : null}

      <div className="mt-6 flex-1">
        <ChatClient
          activeCircuit={activeCircuit}
          initialQuestion={typeof searchParams.q === 'string' ? searchParams.q : ''}
        />
      </div>
    </main>
  );
}
