/**
 * symParser.ts — minimal S-expression parser for KiCad .kicad_sym files.
 *
 * IMPORTANT: This is a SIMPLIFIED parser used ONLY by
 * `scripts/buildSymbolCache.ts` to build the offline symbol cache.
 * It is NOT used by the main parse→normalise→render pipeline — that uses
 * the robust `lib/kicad/sexp.ts` parser which handles all KiCad grammar
 * edge-cases (quoted strings with special chars, escape sequences, etc.).
 *
 * Limitations (acceptable for build-time library extraction only):
 *   - Quoted strings that contain literal parentheses will be mis-parsed.
 *     KiCad symbol library files don't have parens inside string values.
 *   - No line/col error reporting.
 *   - No comment stripping (KiCad files have no comments, so fine).
 */

type Sexp = string | Sexp[];

/**
 * Tokenize a KiCad S-expression string into a flat token array.
 * Properly handles quoted strings (including escaped quotes inside them)
 * by scanning character-by-character for quoted regions.
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i]!;

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i++;
      continue;
    }

    // Parens
    if (ch === '(') { tokens.push('('); i++; continue; }
    if (ch === ')') { tokens.push(')'); i++; continue; }

    // Quoted string — scan until closing unescaped quote
    if (ch === '"') {
      let buf = '"';
      i++;
      while (i < len) {
        const c = input[i]!;
        if (c === '\\' && i + 1 < len) {
          buf += c + input[i + 1]!;
          i += 2;
          continue;
        }
        buf += c;
        i++;
        if (c === '"') break;
      }
      tokens.push(buf);
      continue;
    }

    // Bareword: run until whitespace or paren
    let buf = '';
    while (i < len) {
      const c = input[i]!;
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '(' || c === ')' || c === '"') break;
      buf += c;
      i++;
    }
    if (buf.length > 0) tokens.push(buf);
  }

  return tokens;
}

export function parseSexp(tokens: string[]): Sexp {
  const t = tokens.shift();
  if (t === '(') {
    const list: Sexp[] = [];
    while (tokens[0] !== ')') {
      if (tokens.length === 0) throw new Error('Unexpected end of input inside list');
      list.push(parseSexp(tokens));
    }
    tokens.shift(); // consume ')'
    return list;
  }
  if (t === ')') throw new Error('Unexpected )');
  if (t === undefined) throw new Error('Unexpected end of input');
  // Strip surrounding quotes from quoted string tokens
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return t;
}

export function parseFile(input: string): Sexp {
  const tokens = tokenize(input);
  return parseSexp(tokens);
}
