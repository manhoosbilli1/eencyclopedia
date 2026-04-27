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
  it('infers power-symbol nets from the KiCad 9 sample circuit', () => {
    const src = readCircuit('Circuits', 'Circuits.kicad_sch');
    const canonical = normalise(parseKiCadSchematic(src));

    expect(canonical.nets).toEqual(expect.arrayContaining(['GND', 'VBUS', 'D1_ANODE']));
    expect(pinNet(canonical.components, '#PWR01', '1')).toBe('VBUS');
    expect(pinNet(canonical.components, 'R1', '1')).toBe('VBUS');
    expect(pinNet(canonical.components, 'R1', '2')).toBe('D1_ANODE');
    expect(pinNet(canonical.components, 'D1', '1')).toBe('GND');
    expect(pinNet(canonical.components, 'D1', '2')).toBe('D1_ANODE');
  });

  it('falls back to semantic names for unlabeled battery rails in the KiCad 6 sample', () => {
    const src = readCircuit('Circuits', 'kicad6', 'circuit.kicad_sch');
    const canonical = normalise(parseKiCadSchematic(src));

    expect(canonical.nets).toEqual(
      expect.arrayContaining(['GND', 'BT1_NEG', 'D1_ANODE']),
    );
    expect(pinNet(canonical.components, '#PWR?', '1')).toBe('GND');
    expect(pinNet(canonical.components, 'BT1', '1')).toBe('GND');
    expect(pinNet(canonical.components, 'BT1', '2')).toBe('BT1_NEG');
    expect(pinNet(canonical.components, 'R1', '1')).toBe('BT1_NEG');
    expect(pinNet(canonical.components, 'D1', '2')).toBe('D1_ANODE');
    expect(
      canonical.components.flatMap((component) => component.pins).some((pin) => pin.net === 'unknown'),
    ).toBe(false);
  });
});
