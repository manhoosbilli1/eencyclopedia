import { describe, it, expect } from 'vitest';
import { formatEng, parseEng, UnitParseError } from '../units';

describe('parseEng', () => {
  it('parses plain numbers', () => {
    expect(parseEng('5')).toBe(5);
    expect(parseEng('3.3')).toBeCloseTo(3.3);
    expect(parseEng('-2.5')).toBe(-2.5);
    expect(parseEng('1e-9')).toBe(1e-9);
  });

  it('parses kilo and mega', () => {
    expect(parseEng('10k')).toBe(10_000);
    expect(parseEng('4.7K')).toBeCloseTo(4_700);
    expect(parseEng('1M')).toBe(1_000_000);
    expect(parseEng('2.2G')).toBeCloseTo(2.2e9);
  });

  it('parses fractional sub-unit prefixes', () => {
    expect(parseEng('100n')).toBeCloseTo(100e-9);
    expect(parseEng('4.7u')).toBeCloseTo(4.7e-6);
    expect(parseEng('4.7µ')).toBeCloseTo(4.7e-6);
    expect(parseEng('1m')).toBeCloseTo(1e-3);
    expect(parseEng('10p')).toBeCloseTo(10e-12);
  });

  it('strips trailing unit suffix', () => {
    expect(parseEng('10kΩ')).toBe(10_000);
    expect(parseEng('100nF')).toBeCloseTo(100e-9);
    expect(parseEng('1.5MHz')).toBeCloseTo(1.5e6);
  });

  it('returns NaN for empty/missing input', () => {
    expect(parseEng('')).toBeNaN();
    expect(parseEng(undefined)).toBeNaN();
    expect(parseEng(null)).toBeNaN();
    expect(parseEng('   ')).toBeNaN();
  });

  it('throws on garbage', () => {
    expect(() => parseEng('not-a-number')).toThrow(UnitParseError);
    expect(() => parseEng('10x')).toThrow(UnitParseError);
  });

  it('does NOT confuse milli with mega', () => {
    expect(parseEng('5m')).toBeCloseTo(5e-3);
    expect(parseEng('5M')).toBe(5e6);
  });
});

describe('formatEng', () => {
  it('picks the right prefix', () => {
    expect(formatEng(0.0047, 'F')).toBe('4.700 mF');
    expect(formatEng(10_000, 'Ω')).toBe('10.00 kΩ');
    expect(formatEng(1.6e9, 'Hz')).toBe('1.600 GHz');
    expect(formatEng(100e-9, 'F')).toMatch(/^100\.0 nF$/);
  });

  it('handles zero', () => {
    expect(formatEng(0, 'V')).toBe('0 V');
  });

  it('handles values between 1 and 1000', () => {
    expect(formatEng(5, 'V')).toBe('5.000 V');
    expect(formatEng(125.5, 'Hz')).toBe('125.5 Hz');
  });
});
