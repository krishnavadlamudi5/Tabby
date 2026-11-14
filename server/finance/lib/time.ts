// All business logic (month boundaries, "today", due dates) uses India time.
// IST is a fixed UTC+05:30 with no daylight saving, so plain offset maths is
// exact; dates are stored in UTC.

export const IST_OFFSET_MS = 330 * 60 * 1000;

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

/** Builds a UTC Date from wall-clock time in India. */
export function istDate(year: number, month0: number, day: number, h = 0, m = 0, s = 0): Date {
  return new Date(Date.UTC(year, month0, day, h, m, s) - IST_OFFSET_MS);
}

/** Wall-clock parts of a Date in India. */
export function istParts(d: Date) {
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month0: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** "2026-11" for the India month containing `d`. */
export function istMonthKey(d: Date): string {
  const p = istParts(d);
  return `${p.year}-${String(p.month0 + 1).padStart(2, '0')}`;
}

/** [start, end) of an India calendar month given "YYYY-MM". */
export function istMonthRange(monthKey: string): { start: Date; end: Date } {
  const [y, m] = monthKey.split('-').map(Number);
  return { start: istDate(y, m - 1, 1), end: istDate(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) };
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

/** Start of the India day containing `d`. */
export function istStartOfDay(d: Date): Date {
  const p = istParts(d);
  return istDate(p.year, p.month0, p.day);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((istStartOfDay(b).getTime() - istStartOfDay(a).getTime()) / 86_400_000);
}

/** Indian financial year label for a date: Apr 2026 - Mar 2027 -> "2026-27". */
export function financialYear(d: Date): string {
  const p = istParts(d);
  const startYear = p.month0 >= 3 ? p.year : p.year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function to24h(hour: number, ampm?: string): number {
  if (!ampm) return hour;
  const pm = ampm.toLowerCase() === 'pm';
  if (hour === 12) return pm ? 12 : 0;
  return pm ? hour + 12 : hour;
}

function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/**
 * Parses the date formats Indian banks and merchants use, interpreting them
 * as India time. Returns null when nothing recognisable is found.
 *   14/11/2026 19:21:23 · 14-11-2026 · 02-Nov-2026 · 10-NOV-2026 · 01-Nov-26
 *   Nov 14, 2026 , 06:59 PM · 09 Nov, 2026 09:45:43 AM · Nov 16, 2026
 *   2026-11-14 · 14 Nov 2026
 */
export function parseIndianDate(text: string): Date | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ').trim();
  const time = (str: string | undefined) => {
    if (!str) return { h: 0, m: 0, s: 0 };
    const tm = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (!tm) return { h: 0, m: 0, s: 0 };
    return { h: to24h(Number(tm[1]), tm[4]), m: Number(tm[2]), s: Number(tm[3] || 0) };
  };

  let m = t.match(/(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?/);
  if (m) {
    const tt = time(m[4]);
    return istDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]), tt.h, tt.m, tt.s);
  }
  m = t.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b(.*)?/);
  if (m) {
    const tt = time(m[4]);
    return istDate(fullYear(Number(m[3])), Number(m[2]) - 1, Number(m[1]), tt.h, tt.m, tt.s);
  }
  m = t.match(/\b(\d{1,2})[\s-]([A-Za-z]{3,9})[\s,-]+(\d{2,4})\b(.*)?/);
  if (m && MONTHS[m[2].toLowerCase().slice(0, 3)] !== undefined) {
    const tt = time(m[4]);
    return istDate(fullYear(Number(m[3])), MONTHS[m[2].toLowerCase().slice(0, 3)], Number(m[1]), tt.h, tt.m, tt.s);
  }
  m = t.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b(.*)?/);
  if (m && MONTHS[m[1].toLowerCase().slice(0, 3)] !== undefined) {
    const tt = time(m[4]);
    return istDate(Number(m[3]), MONTHS[m[1].toLowerCase().slice(0, 3)], Number(m[2]), tt.h, tt.m, tt.s);
  }
  return null;
}
