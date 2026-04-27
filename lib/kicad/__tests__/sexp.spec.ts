import { describe, it, expect } from 'vitest';
import {
  arg,
  argNum,
  children,
  findAll,
  firstChild,
  head,
  parse,
  SexpError,
  tokenize,
} from '../sexp';

describe('tokenize', () => {
  it('splits parens and barewords', () => {
    const t = tokenize('(a b 1.5)');
    expect(t.map((x) => x.kind)).toEqual(['lparen', 'atom', 'atom', 'atom', 'rparen']);
    expect(t[1]).toMatchObject({ value: 'a', quoted: false });
    expect(t[2]).toMatchObject({ value: 'b', quoted: false });
    expect(t[3]).toMatchObject({ value: '1.5', quoted: false });
  });

  it('handles quoted strings with escapes', () => {
    const t = tokenize('(value "10\\"k\\\\\\n")');
    const atom = t[2];
    expect(atom?.kind).toBe('atom');
    expect(atom).toMatchObject({ value: '10"k\\\n', quoted: true });
  });

  it('rejects unterminated strings', () => {
    expect(() => tokenize('(a "oops')).toThrow(SexpError);
  });

  it('rejects unsupported escapes', () => {
    expect(() => tokenize('(a "bad\\xff")')).toThrow(/BAD_ESCAPE/);
  });

  it('tracks line and column across newlines', () => {
    const t = tokenize('(\n  foo\n)');
    const foo = t.find((tok) => tok.kind === 'atom');
    expect(foo).toBeDefined();
    expect(foo).toMatchObject({ line: 2, col: 3 });
  });

  it('rejects stray control char inside string', () => {
    // Inject an actual U+0001 byte inside the string. KiCad never emits raw
    // control chars; if we see one the file is corrupt or hostile.
    const src = '(a "bad' + String.fromCharCode(0x01) + 'end")';
    expect(() => tokenize(src)).toThrow(/CONTROL_CHAR/);
  });
});

describe('parse', () => {
  it('parses a flat list', () => {
    const ast = parse('(a b c)');
    expect(ast.type).toBe('list');
    expect(head(ast)).toBe('a');
    expect(arg(ast, 0)).toBe('b');
    expect(arg(ast, 1)).toBe('c');
  });

  it('parses nested lists', () => {
    const ast = parse('(at 10 20 0)');
    expect(head(ast)).toBe('at');
    expect(argNum(ast, 0)).toBe(10);
    expect(argNum(ast, 1)).toBe(20);
    expect(argNum(ast, 2)).toBe(0);
  });

  it('rejects extra tokens after top-level', () => {
    expect(() => parse('(a) (b)')).toThrow(/TRAILING_DATA/);
  });

  it('rejects unmatched parens', () => {
    expect(() => parse('(a (b)')).toThrow(/UNTERMINATED_LIST/);
    expect(() => parse('(a))')).toThrow(/TRAILING_DATA|STRAY_RPAREN/);
  });

  it('rejects empty input', () => {
    expect(() => parse('')).toThrow(/EMPTY_INPUT/);
    expect(() => parse('   \n  ')).toThrow(/EMPTY_INPUT/);
  });
});

describe('query helpers', () => {
  const ast = parse(`
    (kicad_sch
      (version 20231120)
      (generator eeschema)
      (symbol (lib_id "Device:R") (at 50 50 0)
        (property "Reference" "R1" (at 0 0 0))
        (property "Value" "10k" (at 0 0 0))
      )
      (symbol (lib_id "Device:C") (at 80 50 90)
        (property "Reference" "C1" (at 0 0 0))
        (property "Value" "100n" (at 0 0 0))
      )
    )
  `);

  it('children() returns only direct matches', () => {
    const symbols = children(ast, 'symbol');
    expect(symbols).toHaveLength(2);
    expect(head(symbols[0]!)).toBe('symbol');
  });

  it('firstChild() returns the first match', () => {
    const v = firstChild(ast, 'version');
    expect(v).toBeDefined();
    expect(argNum(v as never, 0)).toBe(20231120);
  });

  it('findAll() walks deeply', () => {
    const props = findAll(ast, 'property');
    expect(props).toHaveLength(4);
  });

  it('argNum returns undefined for non-numeric atoms', () => {
    const sym = children(ast, 'symbol')[0] as never;
    const libId = firstChild(sym, 'lib_id');
    expect(arg(libId as never, 0)).toBe('Device:R');
    expect(argNum(libId as never, 0)).toBeUndefined();
  });
});
