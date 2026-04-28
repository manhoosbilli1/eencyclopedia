// scripts/buildSymbolCache.ts
import fs from 'fs';
import path from 'path';
import { parseFile } from '../lib/kicad/symParser.ts';
import { extractSymbols } from '../lib/kicad/symExtract.ts';

const LIB_PATH = './kicad-symbols/4xxx.kicad_symdir';

const output: any[] = [];

function walk(dir: string) {
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (file.endsWith('.kicad_sym')) {
      console.log(`Processing ${full}`);
      try {
        const text = fs.readFileSync(full, 'utf-8');
        const ast = parseFile(text);
        const symbols = extractSymbols(ast);
        output.push(...symbols);
      } catch (e) {
        console.error(`Error processing ${full}: ${e}`);
      }
    }
  }
}

walk(LIB_PATH);

fs.writeFileSync('./symbol-cache.json', JSON.stringify(output, null, 2));
console.log(`Extracted ${output.length} symbols`);