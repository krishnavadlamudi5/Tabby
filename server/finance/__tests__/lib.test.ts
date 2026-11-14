import { describe, expect, it } from 'vitest';
import { allocateByWeights, formatPaiseINR, parseAmountToPaise } from '../lib/money';
import { financialYear, istMonthKey, istMonthRange, parseIndianDate } from '../lib/time';
import { decryptString, encryptString } from '../lib/crypto';

describe('parseAmountToPaise', () => {
  it.each([
    ['331.00', 33100], ['5,662', 566200], ['5662.00', 566200], ['₹5,662', 566200], ['Rs. 1099.0', 109900],
    ['INR 12.00', 1200], ['5000.0000', 500000], ['1,32,000.50', 13200050], ['₨. 298', 29800], ['$205.32', 20532],
    ['0.005', 1], ['1.004', 100],
  ])('%s -> %i', (input, expected) => {
    expect(parseAmountToPaise(input)).toBe(expected);
  });
  it('returns null without a number', () => expect(parseAmountToPaise('no amount')).toBeNull());
});

describe('allocateByWeights', () => {
  it('always adds up exactly and gives leftover paise to the largest part', () => {
    const parts = allocateByWeights(10001, [60, 25, 15]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10001);
    expect(parts[0]).toBe(6001);
  });
});

describe('formatPaiseINR', () => {
  it('uses Indian grouping', () => expect(formatPaiseINR(13200050)).toBe('₹1,32,000.50'));
});

describe('parseIndianDate (India time)', () => {
  const iso = (s: string) => parseIndianDate(s)!.toISOString();
  it.each([
    ['14/11/2026 19:21:23', '2026-11-14T13:51:23.000Z'],
    ['02-Nov-2026', '2026-11-01T18:30:00.000Z'],
    ['10-NOV-2026', '2026-11-09T18:30:00.000Z'],
    ['Nov 14, 2026 , 06:59 PM', '2026-11-14T13:29:00.000Z'],
    ['09 Nov, 2026 09:45:43 AM IST', '2026-11-09T04:15:43.000Z'],
    ['Nov 16, 2026', '2026-11-15T18:30:00.000Z'],
    ['2026-11-14', '2026-11-13T18:30:00.000Z'],
  ])('%s', (input, expected) => expect(iso(input)).toBe(expected));

  it('uses India month boundaries', () => {
    const { start, end } = istMonthRange('2026-11');
    expect(start.toISOString()).toBe('2026-10-31T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-11-30T18:30:00.000Z');
    expect(istMonthKey(new Date('2026-10-31T19:00:00Z'))).toBe('2026-11');
  });

  it('financial year runs April to March', () => {
    expect(financialYear(new Date('2026-11-14T00:00:00Z'))).toBe('2026-27');
    expect(financialYear(new Date('2027-02-01T00:00:00Z'))).toBe('2026-27');
  });
});

describe('crypto', () => {
  it('round-trips and never stores plaintext', () => {
    const packed = encryptString('secret-pass');
    expect(packed).not.toContain('secret-pass');
    expect(decryptString(packed)).toBe('secret-pass');
  });
});
