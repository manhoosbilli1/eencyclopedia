// /lib/symbols/registry.ts
import fs from 'fs';
import path from 'path';

const cache = new Map<string, any>();

let symbols: any[] = [];

function loadSymbols() {
  if (symbols.length === 0) {
    const cachePath = path.join(process.cwd(), 'symbol-cache.json');
    if (fs.existsSync(cachePath)) {
      symbols = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    }
  }
}

export async function getSymbol(libId: string) {
  if (cache.has(libId)) return cache.get(libId);

  loadSymbols();
  const symbol = symbols.find(s => s.id === libId);
  if (symbol) {
    cache.set(libId, symbol);
    return symbol;
  }

  throw new Error('Symbol not found');
}