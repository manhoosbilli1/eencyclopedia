/**
 * Vitest spec for the username validator.
 *
 * Mirrors the DB CHECK constraint:
 *   length between 3 and 32 AND ~ '^[a-z0-9_-]+$'
 *
 * Every case here also asserts the RESERVED_USERNAMES set and the placeholder
 * pattern emitted by the public.handle_new_user() trigger.
 */

import { describe, expect, it } from 'vitest';
import {
  isPlaceholderUsername,
  USERNAME_REGEX,
  validateUsername,
} from '../username';

describe('USERNAME_REGEX', () => {
  it.each([
    ['abc', true],
    ['user1', true],
    ['krish_42', true],
    ['k-rish', true],
    ['a'.repeat(32), true],
    ['ab', false], // too short
    ['a'.repeat(33), false], // too long
    ['Krish', false], // uppercase
    ['krish.shoaib', false], // dot
    ['krish space', false], // space
    ['krish!', false], // punctuation
    ['krish/admin', false], // slash
    ['', false], // empty
  ])('regex(%j) => %s', (input, expected) => {
    expect(USERNAME_REGEX.test(input)).toBe(expected);
  });
});

describe('validateUsername', () => {
  it('accepts a normal username', () => {
    expect(validateUsername('krish_42')).toEqual({ ok: true });
  });

  it('lowercases input before checking', () => {
    // Frontend should display lowercased value; validator agrees.
    expect(validateUsername('Krish')).toEqual({ ok: true });
  });

  it('trims whitespace', () => {
    expect(validateUsername('  krish  ')).toEqual({ ok: true });
  });

  it('rejects empty after trim', () => {
    const r = validateUsername('   ');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('too_short');
  });

  it('rejects invalid characters', () => {
    const r = validateUsername('krish.shoaib');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid_chars');
  });

  it('rejects too short', () => {
    expect(validateUsername('ab').error).toBe('too_short');
  });

  it('rejects too long', () => {
    expect(validateUsername('a'.repeat(33)).error).toBe('too_long');
  });

  it('rejects reserved usernames', () => {
    for (const name of ['admin', 'login', 'api', 'eencyclopedia', 'claude']) {
      expect(validateUsername(name).error).toBe('reserved');
    }
  });

  it('rejects the trigger-generated placeholder pattern', () => {
    expect(validateUsername('user_a1b2c3d4').error).toBe('placeholder');
  });

  it('accepts user_ as a manual prefix when followed by non-hex content', () => {
    // user_xyz is fine — only the 8-hex placeholder pattern is blocked.
    expect(validateUsername('user_xyz').ok).toBe(true);
  });
});

describe('isPlaceholderUsername', () => {
  it('matches handle_new_user() output', () => {
    expect(isPlaceholderUsername('user_00000000')).toBe(true);
    expect(isPlaceholderUsername('user_a1b2c3d4')).toBe(true);
    expect(isPlaceholderUsername('user_ffffffff')).toBe(true);
  });

  it('rejects user-chosen usernames that share the prefix', () => {
    expect(isPlaceholderUsername('user_xyz')).toBe(false);
    expect(isPlaceholderUsername('user_a1b2c3d4_extra')).toBe(false);
    expect(isPlaceholderUsername('USER_a1b2c3d4')).toBe(false); // case-sensitive intentionally
  });

  it('handles null/undefined', () => {
    expect(isPlaceholderUsername(null)).toBe(false);
    expect(isPlaceholderUsername(undefined)).toBe(false);
    expect(isPlaceholderUsername('')).toBe(false);
  });
});
