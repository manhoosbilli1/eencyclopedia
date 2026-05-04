'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { updateProfileSettings } from '@/lib/auth/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  displayName: string;
  bio: string;
  explanationMode: 'intuitive' | 'math_only' | 'both';
  username: string;
  karma: number;
  tier: string;
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save changes'}
    </Button>
  );
}

export function SettingsForm({ displayName, bio, explanationMode, username, karma, tier }: Props) {
  const [state, action] = useFormState(updateProfileSettings, undefined);

  return (
    <form action={action} className="flex flex-col gap-8">
      {/* Read-only info */}
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Account
        </h2>
        <dl className="grid grid-cols-2 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Username</dt>
          <dd className="font-mono">@{username}</dd>
          <dt className="text-muted-foreground">Karma</dt>
          <dd className="font-mono">{karma}</dd>
          <dt className="text-muted-foreground">Tier</dt>
          <dd className="font-mono capitalize">{tier}</dd>
        </dl>
      </section>

      {/* Editable fields */}
      <section className="flex flex-col gap-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Profile
        </h2>

        <div className="flex flex-col gap-2">
          <Label htmlFor="display_name">Display name</Label>
          <Input
            id="display_name"
            name="display_name"
            defaultValue={displayName}
            placeholder="Your full name or handle"
            maxLength={64}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="bio">Bio</Label>
          <textarea
            id="bio"
            name="bio"
            defaultValue={bio}
            placeholder="A short note about yourself or your work…"
            maxLength={500}
            rows={3}
            className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </section>

      {/* AI preferences */}
      <section className="flex flex-col gap-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          AI preferences
        </h2>

        <div className="flex flex-col gap-2">
          <Label htmlFor="explanation_mode">Explanation mode</Label>
          <select
            id="explanation_mode"
            name="explanation_mode"
            defaultValue={explanationMode}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="intuitive">Intuitive — plain-English explanations</option>
            <option value="math_only">Math-first — equations and derivations</option>
            <option value="both">Both — intuition + full math</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Controls how the AI explains circuits and design tradeoffs in chat.
          </p>
        </div>
      </section>

      {state && !state.ok ? (
        <p className="text-sm text-destructive">{(state as { ok: false; error: string }).error}</p>
      ) : state?.ok ? (
        <p className="text-sm text-green-600 dark:text-green-400">Settings saved.</p>
      ) : null}

      <SaveButton />
    </form>
  );
}
