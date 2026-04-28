// /lib/kicad/symParser.ts
type Sexp = string | Sexp[];

export function tokenize(input: string): string[] {
  return input
    .replace(/\(/g, ' ( ')
    .replace(/\)/g, ' ) ')
    .trim()
    .split(/\s+/);
}

export function parseSexp(tokens: string[]): Sexp {
  const t = tokens.shift();
  if (t === '(') {
    const list: Sexp[] = [];
    while (tokens[0] !== ')') list.push(parseSexp(tokens));
    tokens.shift();
    return list;
  }
  if (t === ')') throw new Error('Unexpected )');
  return t!;
}

export function parseFile(input: string): Sexp {
  const tokens = tokenize(input);
  return parseSexp(tokens);
}