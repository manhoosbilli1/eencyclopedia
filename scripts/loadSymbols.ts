// scripts/loadSymbols.ts
import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const PINNED_COMMIT = '75f9189dfaf9600ebc990f80286a3f4e24325f43';

async function main() {
  // Insert version
  const { error: versionError } = await supabase
    .from('symbol_library_versions')
    .insert({ version: PINNED_COMMIT });

  if (versionError && !versionError.message.includes('duplicate key')) {
    console.error('Error inserting version:', versionError);
    return;
  }

  // Read cache
  const cache = JSON.parse(fs.readFileSync('./symbol-cache.json', 'utf-8'));

  // Insert symbols
  for (const symbol of cache) {
    const { error } = await supabase
      .from('symbol_templates')
      .insert({
        id: symbol.id,
        data: symbol,
        bounds: symbol.bounds,
        version: PINNED_COMMIT
      });

    if (error) {
      console.error('Error inserting symbol:', symbol.id, error);
    } else {
      console.log('Inserted', symbol.id);
    }
  }

  console.log('Done');
}

main();