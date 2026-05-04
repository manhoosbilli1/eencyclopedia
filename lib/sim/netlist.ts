/**
 * Convert a CanonicalSchematic into MNA elements for DC simulation.
 *
 * Power symbols (GND, +3V3, VCC etc.) become ideal voltage sources
 * referenced to ground. Resistors/capacitors/inductors are extracted
 * from component value strings. Unknown components are ignored.
 */

import type { CanonicalSchematic } from '@/lib/kicad/normalise';
import type { MnaElement } from './mna';

/** Parse a value string like "10k", "4.7M", "100n", "22u" into SI unit. */
function parseValue(raw: string, unit: 'R' | 'F' | 'H'): number | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return null;

  // Strip unit suffix R/Ω/F/H/OHM
  const stripped = s.replace(/OHM$/, '').replace(/[RΩFH]$/, '');
  const prefixes: Record<string, number> = {
    'F': 1e-15, 'P': 1e-12, 'N': 1e-9, 'U': 1e-6, 'Μ': 1e-6,
    'M': 1e-3, 'K': 1e3, 'MEG': 1e6, 'G': 1e9, 'T': 1e12,
  };

  // Match number + optional prefix
  const m = stripped.match(/^(-?[\d.]+)\s*([A-ZΜ]*)$/);
  if (!m) return null;
  const val = parseFloat(m[1]!);
  const prefix = m[2] ?? '';

  if (prefix in prefixes) return val * prefixes[prefix]!;
  if (prefix === '' || prefix === 'R' || prefix === 'Ω') return val;

  return null;
}

const POWER_VOLTAGES: Record<string, number> = {
  VCC: 5, VDD: 3.3, VBAT: 3.7, VIN: 5, VSYS: 3.3,
  '+3V3': 3.3, '+3.3V': 3.3, '+5V': 5, '+12V': 12,
  '+15V': 15, '-15V': -15, '+9V': 9, '+24V': 24,
  '+1V8': 1.8, '+1.8V': 1.8, '+2V5': 2.5, '+3V': 3,
  '+3.3': 3.3, '+5': 5, '+12': 12,
};

function inferVoltage(value: string): number | null {
  const v = value.trim().toUpperCase();
  if (v in POWER_VOLTAGES) return POWER_VOLTAGES[v]!;
  // Parse "+5V" style
  const m = v.match(/^[+]?([\d.]+)V?$/);
  if (m) return parseFloat(m[1]!);
  return null;
}

export function schematicToNetlist(schema: CanonicalSchematic): MnaElement[] {
  const elements: MnaElement[] = [];
  let vCount = 0;

  for (const comp of schema.components) {
    const lib = comp.libId.toLowerCase();
    const pins = comp.pins;
    const val = comp.value;

    // Power symbols (GND, +3V3 etc.) ----------------------------------------
    if (lib.startsWith('power:') || comp.designator.startsWith('#PWR')) {
      const v = val.toLowerCase();
      const isGnd = ['0', 'gnd', 'gnda', 'gndd', 'agnd', 'pgnd', 'dgnd', 'sgnd', 'earth'].includes(v);
      const pinNet = pins[0]?.world ? null : null; // we need net from pin
      const netName = pins[0]?.net ?? comp.value;

      if (isGnd) {
        // GND pin net is reference — nothing to add (MNA treats GND as node 0)
      } else {
        const volts = inferVoltage(val);
        if (volts !== null && netName) {
          vCount++;
          elements.push({
            type: 'V', id: `V_PWR${vCount}`, n1: netName, n2: '0',
            value: volts,
          });
        }
      }
      continue;
    }

    // Need exactly 2 pins for passive elements
    if (pins.length < 2) continue;
    const n1 = pins[0]!.net ?? `net_${comp.designator}_1`;
    const n2 = pins[1]!.net ?? `net_${comp.designator}_2`;

    // Resistor ----------------------------------------------------------------
    if (/^device:r/.test(lib)) {
      const r = parseValue(val, 'R');
      if (r !== null && r > 0) {
        elements.push({ type: 'R', id: comp.designator, n1, n2, value: r });
      }
      continue;
    }

    // Capacitor ---------------------------------------------------------------
    if (/^device:c/.test(lib)) {
      const c = parseValue(val, 'F');
      if (c !== null) {
        elements.push({ type: 'C', id: comp.designator, n1, n2, value: c });
      }
      continue;
    }

    // Inductor ----------------------------------------------------------------
    if (/^device:l/.test(lib)) {
      const l = parseValue(val, 'H');
      if (l !== null) {
        elements.push({ type: 'L', id: comp.designator, n1, n2, value: l });
      }
      continue;
    }
  }

  return elements;
}
