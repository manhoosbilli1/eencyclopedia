/**
 * Pure-TS S-expression tokenizer + parser, narrowed to the KiCad grammar.
 *
 * Why hand-rolled and not `sexpr-plus`/`s-expression`/etc:
 *   - The KiCad on-disk grammar is a tight subset: no comments, no character
 *     literals, no quoted symbols, no datums (#t / nil / etc), no improper
 *     dotted pairs. We don't need a general Lisp reader.
 *   - Bespoke = fewer deps, deterministic on bounded input, full control over
 *     error messages (line/col), zero supply-chain risk for a 7-day sprint.
 *   - Reference for the grammar: eeschema/sch_io/kicad_sexpr/* in the upstream
 *     KiCad source tree (https://gitlab.com/kicad/code/kicad/-/tree/master/eeschema/sch_io/kicad_sexpr).
 *     Key rules used here:
 *       - tokens: '(' ')' bareword "quoted-string"
 *       - bareword: any non-whitespace, non-paren char run
 *       - quoted-string: " ... " with backslash escapes for \" \\ \n \t \r
 *       - whitespace: \s as in /[\s]/
 *
 * This module exposes a typed `SExp` discriminated union plus `parse()` and
 * `tokenize()` for testability. We do NOT auto-coerce numbers — KiCad files
 * mix free-floating integers and floats inside the same form, and downstream
 * code (parse.ts) decides what numeric coercion is appropriate per element.
 */
//
// References:
//   https://gitlab.com/kicad/code/kicad  (official source — grammar of truth)
//   IEEE Scheme R7RS §7.1.1 for general S-exp lexical structure (informational)
//

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

/**
 * `string` and `quoted` are both string-typed; we distinguish them so that
 * round-tripping (and printing) preserves quoting fidelity. KiCad relies on
 * this for fields like `(value "10k")` vs `(at 10 20 0)` where `0` is a bare
 * integer-looking token but always surfaces as a string atom.
 */
export type Atom = { type: 'atom'; value: string; quoted: boolean; line: number; col: number };
export type List = { type: 'list'; items: SExp[]; line: number; col: number };
export type SExp = Atom | List;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SexpError extends Error {
  readonly line: number;
  readonly col: number;
  readonly code: string;
  constructor(code: string, message: string, line: number, col: number) {
    super(`[sexp:${code}] ${message} (line ${line}, col ${col})`);
    this.name = 'SexpError';
    this.code = code;
    this.line = line;
    this.col = col;
  }
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

export type Token =
  | { kind: 'lparen'; line: number; col: number }
  | { kind: 'rparen'; line: number; col: number }
  | { kind: 'atom'; value: string; quoted: boolean; line: number; col: number };

/**
 * Stream the source into tokens. Linear scan, single pass, no regex.
 * Bounded memory: we read char-by-char. Throws SexpError for unterminated
 * strings, bad escapes, or stray control characters.
 */
export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  const len = src.length;
  let i = 0;
  let line = 1;
  let col = 1;

  const advance = (n = 1): void => {
    for (let k = 0; k < n; k++) {
      if (src.charCodeAt(i) === 10 /* \n */) {
        line += 1;
        col = 1;
      } else {
        col += 1;
      }
      i += 1;
    }
  };

  while (i < len) {
    const c = src[i] as string;

    // Whitespace
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      advance();
      continue;
    }

    // Parens
    if (c === '(') {
      tokens.push({ kind: 'lparen', line, col });
      advance();
      continue;
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen', line, col });
      advance();
      continue;
    }

    // Quoted string
    if (c === '"') {
      const startLine = line;
      const startCol = col;
      advance(); // consume opening "
      let buf = '';
      let closed = false;
      while (i < len) {
        const ch = src[i] as string;
        if (ch === '"') {
          advance(); // consume closing "
          closed = true;
          break;
        }
        if (ch === '\\') {
          if (i + 1 >= len) {
            throw new SexpError('UNTERMINATED_ESCAPE', 'String ended after backslash', line, col);
          }
          const next = src[i + 1] as string;
          // KiCad emits these escapes (and only these). Reject the rest so
          // a malicious upload can't smuggle hex bytes through.
          if (next === '"') buf += '"';
          else if (next === '\\') buf += '\\';
          else if (next === 'n') buf += '\n';
          else if (next === 't') buf += '\t';
          else if (next === 'r') buf += '\r';
          else {
            throw new SexpError(
              'BAD_ESCAPE',
              `Unsupported escape sequence \\${next}`,
              line,
              col,
            );
          }
          advance(2);
          continue;
        }
        // Stray control chars (other than the escape forms above) get rejected
        // — KiCad never writes raw \n inside a string atom, it always escapes.
        const code = ch.charCodeAt(0);
        if (code < 0x20 && code !== 0x09 /* allow tab inside string just in case */) {
          throw new SexpError(
            'CONTROL_CHAR',
            `Stray control character U+${code.toString(16).padStart(4, '0')} inside string`,
            line,
            col,
          );
        }
        buf += ch;
        advance();
      }
      if (!closed) {
        throw new SexpError(
          'UNTERMINATED_STRING',
          'String not terminated before EOF',
          startLine,
          startCol,
        );
      }
      tokens.push({ kind: 'atom', value: buf, quoted: true, line: startLine, col: startCol });
      continue;
    }

    // Bareword: run of non-whitespace, non-paren, non-quote chars
    const startLine = line;
    const startCol = col;
    let buf = '';
    while (i < len) {
      const ch = src[i] as string;
      if (
        ch === ' ' ||
        ch === '\t' ||
        ch === '\r' ||
        ch === '\n' ||
        ch === '(' ||
        ch === ')' ||
        ch === '"'
      ) {
        break;
      }
      buf += ch;
      advance();
    }
    if (buf.length === 0) {
      // Defensive: shouldn't happen because outer loop already filtered the
      // chars we explicitly handle.
      throw new SexpError('EMPTY_TOKEN', 'Empty token', line, col);
    }
    tokens.push({ kind: 'atom', value: buf, quoted: false, line: startLine, col: startCol });
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a KiCad-style S-expression source into a single SExp tree.
 *
 * KiCad files always wrap everything in a single top-level form
 * (`(kicad_sch ...)`) so we expect exactly one root. If the caller has a
 * concatenated stream they should slice and call us per-form.
 */
export function parse(src: string): SExp {
  const tokens = tokenize(src);
  if (tokens.length === 0) {
    throw new SexpError('EMPTY_INPUT', 'Empty input', 1, 1);
  }
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const consume = (): Token => {
    const t = tokens[pos++];
    if (!t) throw new SexpError('UNEXPECTED_EOF', 'Unexpected end of input', 0, 0);
    return t;
  };

  function readForm(): SExp {
    const t = consume();
    if (t.kind === 'lparen') {
      const items: SExp[] = [];
      while (true) {
        const next = peek();
        if (!next) {
          throw new SexpError('UNTERMINATED_LIST', 'List not closed before EOF', t.line, t.col);
        }
        if (next.kind === 'rparen') {
          consume();
          return { type: 'list', items, line: t.line, col: t.col };
        }
        items.push(readForm());
      }
    }
    if (t.kind === 'rparen') {
      throw new SexpError('STRAY_RPAREN', 'Unmatched closing paren', t.line, t.col);
    }
    return { type: 'atom', value: t.value, quoted: t.quoted, line: t.line, col: t.col };
  }

  const root = readForm();
  if (pos < tokens.length) {
    const extra = tokens[pos] as Token;
    throw new SexpError(
      'TRAILING_DATA',
      'Extra tokens after top-level form',
      extra.line,
      extra.col,
    );
  }
  return root;
}

// ---------------------------------------------------------------------------
// Tiny query helpers — used heavily by parse.ts
// ---------------------------------------------------------------------------

/** Type-narrowing predicate. */
export function isList(s: SExp): s is List {
  return s.type === 'list';
}
/** Type-narrowing predicate. */
export function isAtom(s: SExp): s is Atom {
  return s.type === 'atom';
}

/**
 * Read the head atom of a list (the "tag"). Returns undefined if the list is
 * empty or if its first element isn't an atom.
 */
export function head(s: SExp): string | undefined {
  if (!isList(s) || s.items.length === 0) return undefined;
  const first = s.items[0];
  return first && isAtom(first) ? first.value : undefined;
}

/**
 * Get all child lists whose head atom matches `tag`. Non-recursive — only
 * direct children of `parent`. Use `findAll` for deep walks.
 */
export function children(parent: SExp, tag: string): List[] {
  if (!isList(parent)) return [];
  const out: List[] = [];
  for (const c of parent.items) {
    if (isList(c) && head(c) === tag) out.push(c);
  }
  return out;
}

/** First child of `parent` whose head atom is `tag`, or undefined. */
export function firstChild(parent: SExp, tag: string): List | undefined {
  if (!isList(parent)) return undefined;
  for (const c of parent.items) {
    if (isList(c) && head(c) === tag) return c;
  }
  return undefined;
}

/**
 * Read the i-th argument (after the head) of a list as a string. Returns
 * undefined if the list isn't long enough or that slot isn't an atom.
 */
export function arg(list: SExp, index: number): string | undefined {
  if (!isList(list)) return undefined;
  const item = list.items[1 + index];
  return item && isAtom(item) ? item.value : undefined;
}

/**
 * Read the i-th argument (after the head) as a number. Returns undefined if
 * absent or non-numeric. Accepts the KiCad numeric grammar: optional sign,
 * decimal point, no exponent (KiCad doesn't write 1e-3 for coordinates).
 */
export function argNum(list: SExp, index: number): number | undefined {
  const v = arg(list, index);
  if (v === undefined) return undefined;
  // Tighter than parseFloat — rejects "10k", "NaN", "Infinity", trailing junk.
  if (!/^-?(?:\d+\.\d*|\.\d+|\d+)$/.test(v)) return undefined;
  return Number(v);
}

/**
 * Walk all descendant lists matching `tag`. Useful for finding every
 * `(symbol …)` regardless of nesting depth. O(n) in tree size.
 */
export function findAll(root: SExp, tag: string): List[] {
  const out: List[] = [];
  const stack: SExp[] = [root];
  while (stack.length > 0) {
    const node = stack.pop() as SExp;
    if (!isList(node)) continue;
    if (head(node) === tag) out.push(node);
    for (const c of node.items) stack.push(c);
  }
  return out;
}
