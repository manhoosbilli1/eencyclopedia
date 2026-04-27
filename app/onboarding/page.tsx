/**
 * /onboarding — first-time setup. Pick username, default explanation mode,
 * accept beta-tester terms.
 *
 * Reached:
 *   - automatically from /auth/callback when the placeholder username is detected
 *   - manually if a user signs in but never completed setup (header link)
 */

import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPlaceholderUsername } from '@/lib/auth/username';
import { OnboardingForm } from './onboarding-form';

export const metadata: Metadata = {
  title: 'Welcome',
  description: 'Pick a username and set your default explanation mode.',
};

export default async function OnboardingPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/onboarding');

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, settings')
    .eq('id', user.id)
    .single();

  // If they already picked a real username, skip onboarding.
  if (
    profile &&
    typeof profile.username === 'string' &&
    !isPlaceholderUsername(profile.username)
  ) {
    redirect(`/profile/${profile.username}`);
  }

  const settings =
    profile && typeof profile.settings === 'object' && profile.settings !== null
      ? (profile.settings as Record<string, unknown>)
      : {};
  const defaultMode =
    typeof settings['explanation_mode'] === 'string'
      ? (settings['explanation_mode'] as string)
      : 'intuitive';

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome.</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Two questions and you&rsquo;re in.
      </p>

      <div className="mt-8">
        <OnboardingForm defaultMode={defaultMode} />
      </div>
    </main>
  );
}
