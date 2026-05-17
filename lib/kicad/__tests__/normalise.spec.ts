import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseKiCadSchematic } from '../parse';
import { normalise } from '../normalise';

function readCircuit(...parts: string[]): string {
  return readFileSync(path.resolve(process.cwd(), ...parts), 'utf8');
}

function pinNet(
  components: ReturnType<typeof normalise>['components'],
  designator: string,
  pinNumber: string,
): string | undefined {
  const component = components.find((c) => c.designator === designator);
  return component?.pins.find((p) => p.number === pinNumber)?.net;
}

describe('normalise', () => {
  // After commit f9a3169+ we apply the .kicad_sym +Y-up → +Y-down flip when
  // extracting lib_symbol pin/shape coords. That means pin numbering of
  // vertical components (R, L, C, Battery) now matches KiCad's actual
  // labeling: pin 1 sits at the *top* of the rendered symbol. Earlier the
  // labelling was inverted from KiCad's, and these tests were calibrated
  // against the inverted behaviour. Both assertions below have been swapped
  // accordingly.
  it('infers power-symbol nets from the KiCad 9 sample circuit', () => {
    const src = readCircuit('Circuits', 'Circuits.kicad_sch');
    const canonical = normalise(parseKiCadSchematic(src));

    expect(canonical.nets).toEqual(expect.arrayContaining(['GND', 'VBUS', 'D1_ANODE']));
    expect(pinNet(canonical.components, '#PWR01', '1')).toBe('VBUS');
    // R1 is vertical with pin 1 at the TOP, pin 2 at the BOTTOM (KiCad
    // convention). VBUS wire enters the BOTTOM → pin 2. D1 anode is
    // directly below R1's TOP pin → pin 1.
    expect(pinNet(canonical.components, 'R1', '1')).toBe('D1_ANODE');
    expect(pinNet(canonical.components, 'R1', '2')).toBe('VBUS');
    expect(pinNet(canonical.components, 'D1', '1')).toBe('GND');
    expect(pinNet(canonical.components, 'D1', '2')).toBe('D1_ANODE');
  });

  it('falls back to semantic names for unlabeled battery rails in the KiCad 6 sample', () => {
    const src = readCircuit('Circuits', 'kicad6', 'circuit.kicad_sch');
    const canonical = normalise(parseKiCadSchematic(src));

    // Battery pin 1 is "+" (top of symbol after KiCad-correct labelling),
    // pin 2 is "-" (bottom). The "+" rail picks up the BT1_POS semantic
    // alias from the "+" pin name; the "-" rail connects to the GND power
    // symbol so it's named GND.
    expect(canonical.nets).toEqual(
      expect.arrayContaining(['GND', 'BT1_POS', 'D1_ANODE']),
    );
    expect(pinNet(canonical.components, '#PWR?', '1')).toBe('GND');
    expect(pinNet(canonical.components, 'BT1', '1')).toBe('BT1_POS');
    expect(pinNet(canonical.components, 'BT1', '2')).toBe('GND');
    expect(pinNet(canonical.components, 'R1', '1')).toBe('D1_ANODE');
    expect(pinNet(canonical.components, 'R1', '2')).toBe('BT1_POS');
    expect(pinNet(canonical.components, 'D1', '2')).toBe('D1_ANODE');
    expect(
      canonical.components.flatMap((component) => component.pins).some((pin) => pin.net === 'unknown'),
    ).toBe(false);
  });
});
