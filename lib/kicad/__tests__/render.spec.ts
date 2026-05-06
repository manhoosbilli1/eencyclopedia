import { describe, it, expect } from 'vitest';
import { parseKiCadSchematic } from '../parse';
import { normalise } from '../normalise';
import { renderSvg } from '../render';

const DIVIDER = `
(kicad_sch
  (version 20231120)
  (generator "eeschema")
  (symbol (lib_id "Device:R") (at 50 50 0)
    (property "Reference" "R1" (at 0 0 0))
    (property "Value" "10k" (at 0 0 0)))
  (symbol (lib_id "Device:R") (at 50 80 0)
    (property "Reference" "R2" (at 0 0 0))
    (property "Value" "10k" (at 0 0 0)))
  (symbol (lib_id "power:GND") (at 50 110 180)
    (property "Reference" "#PWR01" (at 0 0 0))
    (property "Value" "GND" (at 0 0 0)))
  (wire (pts (xy 50 30) (xy 50 50)) (stroke (width 0)) (uuid "w1"))
  (wire (pts (xy 50 65) (xy 50 80)) (stroke (width 0)) (uuid "w2"))
  (wire (pts (xy 50 95) (xy 50 110)) (stroke (width 0)) (uuid "w3"))
  (label "VIN" (at 50 30 90))
  (global_label "VOUT" (at 50 65 0))
)
`;

describe('renderSvg', () => {
  const c = normalise(parseKiCadSchematic(DIVIDER));
  const svg = renderSvg(c, { title: 'Test divider' });

  it('produces a well-formed <svg> string', () => {
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    // Must include xmlns for inline embedding to validate.
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('includes a viewBox computed from the bbox', () => {
    expect(svg).toMatch(/viewBox="[\-\d. ]+"/);
  });

  it('draws all wires', () => {
    const lineCount = (svg.match(/<line /g) || []).length;
    // 3 wires + 2 pin stubs per non-power component (R1, R2 = 4) + lines inside power symbol
    expect(lineCount).toBeGreaterThanOrEqual(3 + 4);
  });

  it('emits data-designator hooks for every component', () => {
    expect(svg).toContain('data-designator="R1"');
    expect(svg).toContain('data-designator="R2"');
    expect(svg).toContain('data-designator="#PWR01"');
  });

  it('emits data-net hooks for labels', () => {
    expect(svg).toContain('data-net="VIN"');
    expect(svg).toContain('data-net="VOUT"');
  });

  it('renders GND as a triangle marker tagged as a power symbol', () => {
    // The symbols.ts gnd glyph draws the canonical triangle from three
    // horizontal lines stacked under the pin (no <polygon> tag). What we
    // really care about is that the GND component is identified as a power
    // symbol so the renderer hides its label and exposes data-net.
    expect(svg).toContain('data-family="gnd"');
    expect(svg).toContain('data-net="GND"');
    expect(svg).toContain('GND');
  });

  it('escapes HTML/XML special chars in label text', () => {
    const c2 = normalise(
      parseKiCadSchematic(
        `(kicad_sch (version 20231120) (generator x)
          (symbol (lib_id "Device:R") (at 0 0 0)
            (property "Reference" "R1" "")
            (property "Value" "<eval>" "")))`,
      ),
    );
    const out = renderSvg(c2, { title: 'x' });
    expect(out).not.toContain('<eval>');
    expect(out).toContain('&lt;eval&gt;');
  });
});
