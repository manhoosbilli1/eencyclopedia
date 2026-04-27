'use client';

/**
 * Onboarding form — pick username, explanation mode, accept terms.
 *
 * Client-side validation is best-effort: the server action re-validates with
 * the same `validateUsername` helper, so any bypass here still fails server-side.
 */

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { completeOnboarding, type ActionResult } from '@/lib/auth/actions';
import { validateUsername } from '@/lib/auth/username';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending} className="w-full">
      {pending ? 'Saving…' : 'Save and continue'}
    </Button>
  );
}

const MODE_OPTIONS: Array<{
  value: 'intuitive' | 'math_only' | 'both';
  label: string;
  hint: string;
}> = [
  {
    value: 'intuitive',
    label: 'Intuitive first',
    hint: 'Plain-English summary, then math if I ask.',
  },
  {
    value: 'math_only',
    label: 'Math only',
    hint: 'Skip the intuition. Show derivations and numbers.',
  },
  {
    value: 'both',
    label: 'Both',
    hint: 'Always show intuition + math.',
  },
];

export function OnboardingForm({ defaultMode }: { defaultMode: string }) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    completeOnboarding,
    null,
  );
  const [username, setUsername] = useState('');
  const [accepted, setAccepted] = useState(false);

  const localValidation = username.length === 0 ? null : validateUsername(username);
  const usernameOk = localValidation === null ? false : localValidation.ok;

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          minLength={3}
          maxLength={32}
          pattern="[a-z0-9_-]{3,32}"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          placeholder="e.g. krish_42"
        />
        <p className="text-xs text-muted-foreground">
          3–32 chars. Lowercase letters, digits, hyphen and underscore only.
        </p>
        {localValidation && !localValidation.ok ? (
          <p className="text-xs text-destructive">{localValidation.message}</p>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Default explanation mode</legend>
        <p className="text-xs text-muted-foreground">
          You can change this anytime in settings.
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {MODE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-card p-3 hover:bg-muted"
            >
              <input
                type="radio"
                name="explanation_mode"
                value={opt.value}
                defaultChecked={defaultMode === opt.value}
                className="mt-0.5"
                required
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium">{opt.label}</span>
                <span className="text-xs text-muted-foreground">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-card p-3 hover:bg-muted">
        <input
          type="checkbox"
          name="beta_terms"
          className="mt-1"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        <span className="text-sm">
          I&rsquo;m signing up as a closed-beta tester. I understand the
          product is in active development, may break, and that AI output
          must be verified against datasheets and standards before
          fabrication.
        </span>
      </label>

      <SubmitButton disabled={!accepted || (username.length > 0 && !usernameOk)} />

      {state && !state.ok ? (
        <p
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
