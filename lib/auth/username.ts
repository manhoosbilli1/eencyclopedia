/**
 * Username validation. Pure functions only — no DB calls — so they're trivially
 * unit-testable and reusable on both client and server.
 *
 * Rules (must match the DB CHECK constraint exactly):
 *   - 3..32 chars
 *   - lowercase a-z, 0-9, underscore, hyphen
 *   - unique (enforced at DB level, not here)
 *   - reserved words rejected client-side to avoid round-trip on obvious losers
 *
 * The DB constraint is the source of truth; this regex is a mirror.
 *   Schema: profiles.username citext unique not null
 *           check (length(username) between 3 and 32 and username ~ '^[a-z0-9_-]+$')
 */

export const USERNAME_REGEX = /^[a-z0-9_-]{3,32}$/;

/**
 * Reserved usernames that would shadow product routes or look like staff.
 * These are not in the DB (RLS doesn't enforce them) — checked here so a user
 * doesn't waste a round-trip and discover at submit time.
 *
 * Keep this list short. Rejecting too aggressively annoys users; the only
 * non-negotiable ones are route shadows ("login", "onboarding") and obvious
 * impersonation ("admin", "support", "anthropic", "eencyclopedia").
 */
export const RESERVED_USERNAMES = new Set<string>([
  // route shadows — anything that exists as a top-level route on the site
  'admin',
  'api',
  'auth',
  'calc',
  'chat',
  'circuit',
  'favorites',
  'library',
  'login',
  'logout',
  'onboarding',
  'profile',
  'settings',
  'signup',
  'signin',
  'upload',
  // impersonation
  'anthropic',
  'claude',
  'eencyclopedia',
  'eencyc',
  'support',
  'help',
  'staff',
  'team',
  'mod',
  'moderator',
  'official',
  'system',
  'root',
  'null',
  'undefined',
]);

export type UsernameValidationError =
  | 'too_short'
  | 'too_long'
  | 'invalid_chars'
  | 'reserved'
  | 'placeholder';

export interface UsernameValidationResult {
  ok: boolean;
  error?: UsernameValidationError;
  message?: string;
}

/**
 * Validate a candidate username. Returns a structured result so the caller
 * can map errors to UI messages.
 */
export function validateUsername(raw: string): UsernameValidationResult {
  const u = raw.trim().toLowerCase();

  if (u.length < 3) {
    return { ok: false, error: 'too_short', message: 'Must be at least 3 characters.' };
  }
  if (u.length > 32) {
    return { ok: false, error: 'too_long', message: 'Must be 32 characters or fewer.' };
  }
  if (!USERNAME_REGEX.test(u)) {
    return {
      ok: false,
      error: 'invalid_chars',
      message: 'Only lowercase letters, digits, hyphen and underscore.',
    };
  }
  if (RESERVED_USERNAMES.has(u)) {
    return { ok: false, error: 'reserved', message: 'That name is reserved.' };
  }
  // Block the trigger-generated placeholder pattern so users can't keep it.
  if (/^user_[a-f0-9]{8}$/.test(u)) {
    return {
      ok: false,
      error: 'placeholder',
      message: 'Pick something other than the temporary placeholder.',
    };
  }
  return { ok: true };
}

/**
 * Detects the trigger-generated placeholder username so we know to redirect
 * the user to /onboarding. Source: handle_new_user() in 0001_init.sql:
 *   'user_' || substr(new.id::text, 1, 8)
 * which always yields 13 chars: prefix `user_` + 8 hex chars.
 */
export function isPlaceholderUsername(u: string | null | undefined): boolean {
  if (!u) return false;
  return /^user_[a-f0-9]{8}$/.test(u);
}
