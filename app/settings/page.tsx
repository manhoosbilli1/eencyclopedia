import type { Metadata } from 'next';
import { requireAuthedProfile } from '@/lib/auth/actions';
import { SettingsForm } from './settings-form';

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const { profile } = await requireAuthedProfile();

  const settings =
    typeof profile.settings === 'object' && profile.settings !== null
      ? (profile.settings as Record<string, unknown>)
      : {};

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-2xl flex-col px-6 py-12">
      <header className="mb-10">
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          /settings
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Profile settings</h1>
      </header>

      <SettingsForm
        displayName={(profile.display_name as string | null) ?? ''}
        bio={(profile.bio as string | null) ?? ''}
        explanationMode={
          typeof settings.explanation_mode === 'string'
            ? (settings.explanation_mode as 'intuitive' | 'math_only' | 'both')
            : 'intuitive'
        }
        username={profile.username as string}
        karma={typeof profile.karma === 'number' ? profile.karma : 0}
        tier={typeof profile.tier === 'string' ? profile.tier : 'free'}
      />
    </main>
  );
}
