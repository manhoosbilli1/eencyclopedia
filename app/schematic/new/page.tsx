/**
 * /schematic/new
 *
 * Full-screen scratch schematic editor. Users start with an empty canvas,
 * draw a circuit, then click "Share" to publish it and get a shareable link.
 *
 * Auth is not required to edit — but Share will prompt the user to sign in
 * if they're not authenticated.
 */

import type { Metadata } from 'next';
import { ScratchEditor } from './scratch-editor';

export const metadata: Metadata = {
  title: 'New Schematic — eencyclopedia',
  description: 'Create a schematic from scratch and share it.',
};

export default function NewSchematicPage() {
  return (
    <main className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
        <div>
          <h1 className="text-sm font-semibold leading-tight tracking-tight">New Schematic</h1>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Draw, then share via link
          </p>
        </div>
      </div>

      {/* ScratchEditor handles the Share button + toast internally */}
      <ScratchEditor />
    </main>
  );
}
