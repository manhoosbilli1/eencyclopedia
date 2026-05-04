/**
 * Symbol registry — reads from the `symbol-cache.json` file produced by
 * `scripts/buildSymbolCache.ts`. This is an OFFLINE / build-time cache used
 * only by the admin seed scripts and the legacy `scripts/loadSymbols.ts`
 * uploader. It is NOT used by the main parse→normalise→render pipeline
 * (which uses glyph-based symbols from `lib/kicad/symbols.ts`).
 *
 * This file is Node-only (uses `fs`). Do NOT import it from client components
 * or from `app/` pages — use `lib/kicad/symbols.ts` instead.
 */

import fs from 'fs';
import path from 'path';
import type { SymbolTemplate } from '@/lib/kicad/symExtract';

const cache = new Map<string, SymbolTemplate>();

let symbols: SymbolTemplate[] = [];
let loaded = false;

function loadSymbols(): void {
  if (loaded) return;
  loaded = true;
  const cachePath = path.join(process.cwd(), 'symbol-cache.json');
  if (fs.existsSync(cachePath)) {
    try {
      symbols = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as SymbolTemplate[];
    } catch {
      // Malformed cache — leave symbols empty; getSymbol will throw.
    }
  }
}

/**
 * Look up a symbol by KiCad lib_id (e.g. "Device:R").
 * Throws if the symbol-cache.json is absent or the symbol isn't present.
 *
 * For runtime rendering use `drawSymbol()` from `lib/kicad/symbols.ts`.
 */
export function getSymbol(libId: string): SymbolTemplate {
  if (cache.has(libId)) return cache.get(libId)!;

  loadSymbols();
  const symbol = symbols.find((s) => s.id === libId);
  if (symbol) {
    cache.set(libId, symbol);
    return symbol;
  }

  throw new Error(
    `Symbol "${libId}" not found in symbol-cache.json. ` +
      `Run scripts/buildSymbolCache.ts to regenerate the cache.`,
  );
}
