import { describe, it, expect } from 'vitest';
import {
  KiCadParseError,
  looksLikeKiCadSchematic,
  parseKiCadSchematic,
  transformLocalToWorld,
  MAX_COMPONENTS_V0,
} from '../parse';

// Minimal fixture that mirrors what KiCad 8 (`generator_version 8.0`)
// writes for a 3-component voltage divider. Whitespace and indentation are
// freed up; the parser is whitespace-insensitive.
const DIVIDER = `
(kicad_sch
  (version 20231120)
  (generator "eeschema")
  (uuid "00000000-0000-0000-0000-000000000001")
  (paper "A4")

  (symbol (lib_id "Device:R") (at 50 50 0)
    (uuid "00000000-0000-0000-0000-000000000002")
    (property "Reference" "R1" (at 0 0 0))
    (property "Value" "10k" (at 0 0 0))
    (property "Footprint" "Resistor_SMD:R_0603" (at 0 0 0))
  )

  (symbol (lib_id "Device:R") (at 50 80 0) (mirror y)
    (uuid "00000000-0000-0000-0000-000000000003")
    (property "Reference" "R2" (at 0 0 0))
    (property "Value" "10k" (at 0 0 0))
    (property "MPN" "RC0603FR-0710KL" (at 0 0 0))
  )

  (symbol (lib_id "power:GND") (at 50 110 180)
    (uuid "00000000-0000-0000-0000-000000000004")
    (property "Reference" "#PWR01" (at 0 0 0))
    (property "Value" "GND" (at 0 0 0))
  )

  (wire (pts (xy 50 30) (xy 50 50)) (stroke (width 0)) (uuid "w1"))
  (wire (pts (xy 50 65) (xy 50 80)) (stroke (width 0)) (uuid "w2"))
  (wire (pts (xy 50 95) (xy 50 110)) (stroke (width 0)) (uuid "w3"))

  (junction (at 50 80) (uuid "j1"))

  (label "VIN"  (at 50 30 90))
  (global_label "VOUT" (at 50 65 0))
)
`;

describe('parseKiCadSchematic', () => {
  it('parses meta', () => {
    const sch = parseKiCadSchematic(DIVIDER);
    expect(sch.meta.version).toBe(20231120);
    expect(sch.meta.generator).toBe('eeschema');
  });

  it('extracts 3 symbols with designators and values', () => {
    const sch = parseKiCadSchematic(DIVIDER);
    expect(sch.symbols).toHaveLength(3);
    expect(sch.symbols.map((s) => s.designator)).toEqual(['R1', 'R2', '#PWR01']);
    expect(sch.symbols.map((s) => s.value)).toEqual(['10k', '10k', 'GND']);
    expect(sch.symbols[1]?.mpn).toBe('RC0603FR-0710KL');
    expect(sch.symbols[1]?.mirror).toBe('y');
  });

  it('extracts wires', () => {
    const sch = parseKiCadSchematic(DIVIDER);
    expect(sch.wires).toHaveLength(3);
    expect(sch.wires[0]).toEqual({ x1: 50, y1: 30, x2: 50, y2: 50 });
  });

  it('extracts junctions', () => {
    const sch = parseKiCadSchematic(DIVIDER);
    expect(sch.junctions).toEqual([{ x: 50, y: 80 }]);
  });

  it('extracts labels (local + global)', () => {
    const sch = parseKiCadSchematic(DIVIDER);
    const kinds = sch.labels.map((l) => `${l.kind}:${l.text}`);
    expect(kinds).toContain('local:VIN');
    expect(kinds).toContain('global:VOUT');
  });

  it('rejects non-kicad_sch root', () => {
    expect(() => parseKiCadSchematic('(kicad_pcb (version 20231120))')).toThrow(
      /WRONG_ROOT/,
    );
  });

  it('rejects missing version', () => {
    expect(() => parseKiCadSchematic('(kicad_sch (generator x))')).toThrow(/NO_VERSION/);
  });

  it('parses files above the component cap (cap is enforced post-crop, not in parse)', () => {
    // The MAX_COMPONENTS_V0 cap is intentionally NOT enforced inside the
    // parser so the bounding-box ingest can crop large project schematics
    // down to a sharable sub-circuit. The parser must succeed; callers
    // check the cap after applyBoundingBoxIngest.
    const tooMany =
      '(kicad_sch (version 20231120) (generator x) ' +
      Array.from({ length: MAX_COMPONENTS_V0 + 1 }, (_, i) =>
        `(symbol (lib_id "Device:R") (at ${i * 10} 0 0) (property "Reference" "R${i}" "") (property "Value" "1k" ""))`,
      ).join(' ') +
      ')';
    const sch = parseKiCadSchematic(tooMany);
    expect(sch.symbols.length).toBe(MAX_COMPONENTS_V0 + 1);
  });

  it('rejects symbol missing Reference', () => {
    const bad =
      '(kicad_sch (version 20231120) (generator x) ' +
      '(symbol (lib_id "Device:R") (at 0 0 0) (property "Value" "1k" "")))';
    expect(() => parseKiCadSchematic(bad)).toThrow(KiCadParseError);
  });

  it('warns on out-of-range version but still parses', () => {
    const stale =
      '(kicad_sch (version 19990101) (generator x) ' +
      '(symbol (lib_id "Device:R") (at 0 0 0) ' +
      '(property "Reference" "R1" "") (property "Value" "1k" "")))';
    const sch = parseKiCadSchematic(stale);
    expect(sch.warnings.some((w) => w.includes('version'))).toBe(true);
    expect(sch.symbols).toHaveLength(1);
  });

  it('extracts lib_symbols pin geometry (with Y-flip from .kicad_sym frame)', () => {
    // Fixture mirrors the structure in a real KiCad 9 file: lib_symbols
    // wraps each used type, which has a nested unit symbol holding the
    // (pin … (at x y rot) … (number "n")) entries.
    //
    // parse.ts Y-flips lib_symbol coords on extraction (KiCad .kicad_sym
    // is +Y-up; the schematic frame is +Y-down). We use y=1.27 in the
    // fixture so the flip is observable.
    const src = `
      (kicad_sch (version 20231120) (generator "eeschema")
        (lib_symbols
          (symbol "Device:LED"
            (symbol "LED_1_1"
              (pin passive line (at -3.81 1.27 0) (length 2.54)
                (name "K") (number "1"))
              (pin passive line (at 3.81 1.27 180) (length 2.54)
                (name "A") (number "2")))))
        (symbol (lib_id "Device:LED") (at 100 100 0)
          (property "Reference" "D1" "")
          (property "Value" "LED" "")))`;
    const sch = parseKiCadSchematic(src);
    const led = sch.libSymbols.get('Device:LED');
    expect(led).toBeDefined();
    expect(led!.pins).toHaveLength(2);
    const k = led!.pins.find((p) => p.number === '1');
    // y=1.27 in lib (+Y-up) → −1.27 in +Y-down. rot=0 stays 0.
    expect(k).toMatchObject({ name: 'K', x: -3.81, y: -1.27, rot: 0 });
    const a = led!.pins.find((p) => p.number === '2');
    // rot=180 is invariant under Y-flip.
    expect(a).toMatchObject({ name: 'A', x: 3.81, y: -1.27, rot: 180 });
  });
});

describe('transformLocalToWorld', () => {
  it('applies rotation 0 as identity', () => {
    expect(transformLocalToWorld({ x: 5, y: -2 }, { x: 100, y: 50, rot: 0 })).toEqual({
      x: 105,
      y: 48,
    });
  });

  it('rotates 270° correctly (matches KiCad eeschema convention)', () => {
    // Real-data calibration from Circuits.kicad_sch: an LED at (142.24, 63.5,
    // rot=270) has pin K at local (-3.81, 0). KiCad's wire (xy 142.24 54.61)
    // → (xy 142.24 59.69) connects GND to K, so K's world position is
    // (142.24, 59.69) — i.e., world delta (0, -3.81) for local (-3.81, 0).
    const out = transformLocalToWorld(
      { x: -3.81, y: 0 },
      { x: 142.24, y: 63.5, rot: 270 },
    );
    expect(out.x).toBeCloseTo(142.24, 5);
    expect(out.y).toBeCloseTo(59.69, 5);

    // Pin A at local (3.81, 0) → world (142.24, 67.31), connecting to
    // R1.pin2 (R_Small at 142.24, 69.85, rot=0, pin2 at local (0, -2.54)).
    const a = transformLocalToWorld(
      { x: 3.81, y: 0 },
      { x: 142.24, y: 63.5, rot: 270 },
    );
    expect(a.x).toBeCloseTo(142.24, 5);
    expect(a.y).toBeCloseTo(67.31, 5);
  });

  it('rotates 90° correctly', () => {
    // VBUS pin local (0, 0) at (142.24, 73.66, 90) → (142.24, 73.66).
    const out = transformLocalToWorld(
      { x: 0, y: 0 },
      { x: 142.24, y: 73.66, rot: 90 },
    );
    expect(out.x).toBeCloseTo(142.24, 5);
    expect(out.y).toBeCloseTo(73.66, 5);
  });

  it('rotates 90° CCW with non-trivial offset', () => {
    // For a point local (1.27, -1.27) at instance (0,0,90):
    //   rx = y = -1.27, ry = -x = -1.27 → world (-1.27, -1.27).
    // (Calibrated against the GND triangle corner from KiCad's own lib.)
    const out = transformLocalToWorld(
      { x: 1.27, y: -1.27 },
      { x: 0, y: 0, rot: 90 },
    );
    expect(out.x).toBeCloseTo(-1.27, 5);
    expect(out.y).toBeCloseTo(-1.27, 5);
  });
});

describe('looksLikeKiCadSchematic', () => {
  it('accepts a valid header', () => {
    expect(looksLikeKiCadSchematic('(kicad_sch (version 20231120) ...')).toBe(true);
    expect(looksLikeKiCadSchematic('  \n  (kicad_sch (version 1))')).toBe(true);
  });

  it('rejects garbage', () => {
    expect(looksLikeKiCadSchematic('hello world')).toBe(false);
    expect(looksLikeKiCadSchematic('(kicad_pcb (...))')).toBe(false);
    expect(looksLikeKiCadSchematic('')).toBe(false);
  });
});
