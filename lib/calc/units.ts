/**
 * Engineering-prefix string parsing.
 *
 * Engineers type "10k", "4.7n", "1.5M" — not "10000", "4.7e-9", "1500000".
 * This module accepts the SI-prefixed shorthand (and the "u" / "µ" alias for
 * micro) and returns SI base-unit numbers.
 *
 * Recognised prefixes:
 *   p  pico   1e-12
 *   n  nano   1e-9
 *   u  micro  1e-6   (also accepts µ or 'm' is *not* an alias for micro)
 *   µ  micro  1e-6
 *   m  milli  1e-3
 *   K  kilo   1e3    (also accepts lowercase 'k')
 *   M  mega   1e6
 *   G  giga   1e9
 *   T  tera   1e12
 *
 * Notes:
 *   - 'm' (lowercase) is milli, NOT mega. Engineering convention.
 *   - 'M' (uppercase) is mega.
 *   - 'k' (lowercase) is kilo. We accept 'K' too as a convenience.
 *   - Anything after the prefix (e.g. unit suffix "Ω", "F", "Hz") is allowed
 *     and ignored. So "10kΩ" → 10000, "100nF" → 100e-9.
 *   - Plain numbers without a prefix go through unchanged: "5" → 5,
 *     "3.3" → 3.3, "1e-9" → 1e-9.
 *   - Reject input that isn't either a valid number or a number-prefix combo.
 */

export class UnitParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnitParseError';
  }
}

const PREFIXES: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  m: 1e-3,
  K: 1e3,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
};

/**
 * Parse an engineering-prefix string to its SI value. Returns NaN if the
 * input is empty (so caller can decide what "missing input" means without
 * a separate undefined check).
 *
 * Throws UnitParseError on malformed input.
 */
export function parseEng(raw: string | undefined | null): number {
  if (raw === undefined || raw === null) return NaN;
  const trimmed = String(raw).trim();
  if (trimmed.length === 0) return NaN;

  // Plain number first — handles "1.5", "1e-9", "-3.3"
  const asNum = Number(trimmed);
  if (Number.isFinite(asNum)) return asNum;

  // Number + single-character prefix + optional unit suffix.
  // Match: optional sign, digits/dot, prefix char, optional rest.
  const m = trimmed.match(/^([+-]?\d*\.?\d+)\s*([pnuµmKkMGT])([A-Za-zΩ]*)\s*$/);
  if (!m) {
    throw new UnitParseError(`Cannot parse "${raw}" as an engineering value.`);
  }
  const mantissa = Number(m[1]);
  const factor = PREFIXES[m[2] as keyof typeof PREFIXES];
  if (!Number.isFinite(mantissa) || factor === undefined) {
    throw new UnitParseError(`Cannot parse "${raw}" as an engineering value.`);
  }
  return mantissa * factor;
}

/**
 * Format a number into engineering notation with the given unit suffix.
 * Picks the prefix that yields a mantissa in [1, 1000). Examples:
 *   formatEng(0.0047, 'F')    → "4.700 mF"
 *   formatEng(10000, 'Ω')     → "10.00 kΩ"
 *   formatEng(1.6e9, 'Hz')    → "1.600 GHz"
 *   formatEng(0, 'V')         → "0.000 V"
 *
 * sigDigits = 4 by default; tweak for tighter or looser display.
 */
export function formatEng(value: number, unit: string, sigDigits = 4): string {
  if (!Number.isFinite(value)) return `${value} ${unit}`;
  if (value === 0) return `0 ${unit}`;

  const abs = Math.abs(value);
  const exp = Math.floor(Math.log10(abs));
  // Round exp DOWN to nearest multiple of 3 so we always land on an SI prefix.
  const engExp = Math.floor(exp / 3) * 3;
  const mantissa = value / 10 ** engExp;

  const PREFIX_MAP: Record<number, string> = {
    [-12]: 'p',
    [-9]: 'n',
    [-6]: 'µ',
    [-3]: 'm',
    [0]: '',
    [3]: 'k',
    [6]: 'M',
    [9]: 'G',
    [12]: 'T',
  };
  const prefix = PREFIX_MAP[engExp];
  if (prefix === undefined) {
    // Outside our range — fall back to scientific notation.
    return `${value.toPrecision(sigDigits)} ${unit}`;
  }

  return `${mantissa.toPrecision(sigDigits)} ${prefix}${unit}`;
}
