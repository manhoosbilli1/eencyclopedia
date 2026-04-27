/**
 * /circuit/new — upload a .kicad_sch and create a circuit.
 *
 * Auth-gated. If a user lands here without a finalised profile (placeholder
 * username), bounce them to /onboarding so we don't end up with an upload
 * authored by a "user_xxxxxxxx" handle in the public listing.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPlaceholderUsername } from '@/lib/auth/username';
import { UploadForm } from './upload-form';
import { MAX_COMPONENTS_V0 } from '@/lib/kicad/parse';

export const metadata: Metadata = {
  title: 'Upload circuit',
  description: 'Upload a .kicad_sch file. We parse, render, and explain it.',
};

export default async function CircuitNewPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/circuit/new');

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single();
  if (
    profile &&
    typeof profile.username === 'string' &&
    isPlaceholderUsername(profile.username)
  ) {
    redirect('/onboarding');
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-2xl flex-col px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Upload a circuit</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Drop a <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.kicad_sch</code>{' '}
        file or paste its contents. We parse the S-expression, render a
        low-fidelity SVG, store the original, and ask an EE-tuned model to
        write a structured summary.
      </p>

      <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>
          V0 cap: at most {MAX_COMPONENTS_V0} components per circuit. Bigger
          schematics get rejected.
        </li>
        <li>File size: 256 KiB max.</li>
        <li>
          KiCad 7 and 8 file formats are tested; older/newer versions parse on
          a best-effort basis.
        </li>
        <li>
          Render is intentionally low-fidelity — boxes-and-wires, not KiCad
          geometry. The original .kicad_sch is preserved verbatim.
        </li>
      </ul>

      <div className="mt-8">
        <UploadForm />
      </div>
    </main>
  );
}
