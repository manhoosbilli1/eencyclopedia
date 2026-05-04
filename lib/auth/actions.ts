'use server';

/**
 * Server actions for auth + profile.
 *
 * Why server actions instead of /api routes:
 *   - Next 14 form actions work without client JS (progressive enhancement).
 *   - `redirect()` works inside server actions (post-success navigation).
 *   - `cookies()` is request-scoped here, which is exactly what @supabase/ssr
 *     needs for PKCE round-trip on magic-link.
 *
 * Each action validates input with Zod, performs the Supabase call, then
 * either redirects or returns a typed `ActionResult` for the form to render
 * inline errors. We never throw user-visible strings.
 *
 * Refs:
 *   https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations
 *   https://supabase.com/docs/guides/auth/passwords  (PKCE w/ @supabase/ssr)
 *   https://supabase.com/docs/reference/javascript/auth-signinwithotp
 */

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { publicEnv } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPlaceholderUsername, validateUsername } from '@/lib/auth/username';
import type { TablesUpdate } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Magic-link request
// ---------------------------------------------------------------------------

const MagicLinkSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email.'),
  next: z.string().optional(),
});

export async function requestMagicLink(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = MagicLinkSchema.safeParse({
    email: formData.get('email'),
    next: formData.get('next') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const supabase = createSupabaseServerClient();
  // The redirect target must be allow-listed in
  // Supabase dashboard → Authentication → URL Configuration → Redirect URLs.
  // We pass `next` through to the callback so we can land the user where they
  // were trying to go.
  const callback = new URL('/auth/callback', publicEnv.NEXT_PUBLIC_SITE_URL);
  if (parsed.data.next) callback.searchParams.set('next', parsed.data.next);

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: callback.toString(),
      // Supabase auto-creates the user on first OTP; the on_auth_user_created
      // trigger then materialises a profiles row with a placeholder username.
      shouldCreateUser: true,
    },
  });

  if (error) {
    // Avoid leaking which addresses are registered. Generic message.
    // Real errors (rate limit, mailer down) end up in server logs.
    // eslint-disable-next-line no-console
    console.error('[auth] signInWithOtp failed:', error.message);
    return { ok: false, error: 'Could not send magic link. Try again in a minute.' };
  }

  return {
    ok: true,
    message: `Magic link sent to ${parsed.data.email}. Check your inbox (and spam).`,
  };
}

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------

export async function signOut(): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}

// ---------------------------------------------------------------------------
// Onboarding — set username + explanation_mode
// ---------------------------------------------------------------------------

const ExplanationMode = z.enum(['intuitive', 'math_only', 'both']);

const OnboardingSchema = z.object({
  username: z.string(),
  explanation_mode: ExplanationMode,
  beta_terms: z
    .string()
    .optional()
    .transform((v) => v === 'on' || v === 'true'),
});

export async function completeOnboarding(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Session expired. Please sign in again.' };

  const parsed = OnboardingSchema.safeParse({
    username: formData.get('username'),
    explanation_mode: formData.get('explanation_mode'),
    beta_terms: formData.get('beta_terms'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  if (!parsed.data.beta_terms) {
    return { ok: false, error: 'You must accept the beta-tester terms to continue.' };
  }

  const v = validateUsername(parsed.data.username);
  if (!v.ok) {
    return { ok: false, error: v.message ?? 'Invalid username.' };
  }
  const newUsername = parsed.data.username.trim().toLowerCase();

  // Read current settings so we can merge instead of overwrite.
  // RLS allows users to read their own profile (read all is permitted).
  const { data: existing, error: readErr } = await supabase
    .from('profiles')
    .select('settings')
    .eq('id', user.id)
    .single();

  if (readErr) {
    // eslint-disable-next-line no-console
    console.error('[onboarding] read profile failed:', readErr.message);
    return { ok: false, error: 'Could not load your profile. Try again.' };
  }

  const currentSettings =
    existing && typeof existing.settings === 'object' && existing.settings !== null
      ? (existing.settings as Record<string, unknown>)
      : {};

  const { error: writeErr } = await supabase
    .from('profiles')
    .update({
      username: newUsername,
      settings: { ...currentSettings, explanation_mode: parsed.data.explanation_mode },
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (writeErr) {
    // 23505 = unique_violation. citext index makes this case-insensitive.
    if (writeErr.code === '23505') {
      return { ok: false, error: 'That username is taken.' };
    }
    // 23514 = check_violation (DB regex/length).
    if (writeErr.code === '23514') {
      return { ok: false, error: 'Invalid username (database rejected).' };
    }
    // eslint-disable-next-line no-console
    console.error('[onboarding] update profile failed:', writeErr.message, writeErr.code);
    return { ok: false, error: 'Could not save profile. Try again.' };
  }

  // Bust the layout cache so the header re-renders with the new username.
  revalidatePath('/', 'layout');
  redirect(`/profile/${newUsername}`);
}

// ---------------------------------------------------------------------------
// Helper for protected pages — redirect logic that pages share.
// ---------------------------------------------------------------------------

/**
 * Returns the current user + profile, or redirects.
 *
 * Use in a server component:
 *
 *   const { user, profile } = await requireAuthedProfile();
 *
 * - Not signed in → redirects to /login
 * - Placeholder username → redirects to /onboarding (unless we're already there)
 */
export async function requireAuthedProfile(opts?: { allowPlaceholder?: boolean }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, karma, tier, settings, avatar_url, bio, created_at')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    // Edge case: the trigger should have made the row, but if Supabase Auth
    // session is mid-creation we may not see it yet. Force-sign-out and start
    // over so the user isn't stuck.
    // eslint-disable-next-line no-console
    console.error('[auth] missing profile for user', user.id, error?.message);
    await supabase.auth.signOut();
    redirect('/login');
  }

  if (
    !opts?.allowPlaceholder &&
    typeof profile.username === 'string' &&
    isPlaceholderUsername(profile.username)
  ) {
    redirect('/onboarding');
  }

  return { user, profile };
}

// ---------------------------------------------------------------------------
// Profile settings update
// ---------------------------------------------------------------------------

const UpdateProfileSchema = z.object({
  display_name: z.string().max(64).optional(),
  bio: z.string().max(500).optional(),
  explanation_mode: z.enum(['intuitive', 'math_only', 'both']).optional(),
});

export type UpdateProfileResult = { ok: true } | { ok: false; error: string };

export async function updateProfileSettings(
  _prevState: UpdateProfileResult | undefined,
  formData: FormData,
): Promise<UpdateProfileResult> {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const parsed = UpdateProfileSchema.safeParse({
    display_name: formData.get('display_name') ?? undefined,
    bio: formData.get('bio') ?? undefined,
    explanation_mode: formData.get('explanation_mode') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const { display_name, bio, explanation_mode } = parsed.data;

  const { data: existing } = await supabase
    .from('profiles')
    .select('settings')
    .eq('id', user.id)
    .single();

  const currentSettings =
    existing && typeof existing.settings === 'object' && existing.settings !== null
      ? (existing.settings as Record<string, unknown>)
      : {};

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (display_name !== undefined) updates.display_name = display_name.trim() || null;
  if (bio !== undefined) updates.bio = bio.trim() || null;
  if (explanation_mode !== undefined) {
    updates.settings = { ...currentSettings, explanation_mode };
  }

  const { error } = await supabase
    .from('profiles')
    .update(updates as TablesUpdate<'profiles'>)
    .eq('id', user.id);

  if (error) return { ok: false, error: 'Could not save settings.' };

  revalidatePath('/settings');
  revalidatePath('/', 'layout');
  return { ok: true };
}
