// Money is stored as integer paise (₹331.00 -> 33100). Never floats.

/**
 * Parses an amount as written in an email or statement into paise.
 * Accepts "5662", "5,662", "5662.00", "₹5,662", "Rs. 1099.0", "INR 12.00",
 * "5000.0000", "1,32,000.50" (Indian grouping). Returns null if no number.
 */
export function parseAmountToPaise(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    return parseAmountToPaise(input.toFixed(4));
  }
  const match = String(input).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  let str = match[0];
  const negative = str.startsWith('-');
  if (negative) str = str.slice(1);
  const [intPart, fracRaw = ''] = str.split('.');
  const frac = (fracRaw + '000').slice(0, 3);
  let paise = Number(intPart) * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) paise += 1;
  return negative ? -paise : paise;
}

/** 33100 -> "331.00" (no currency symbol). */
export function paiseToDecimalString(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(Math.round(paise));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Display helper for server-side text (emails, alerts). */
export function formatPaiseINR(paise: number, currency = 'INR'): string {
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const grouped = currency === 'INR'
    ? rupees.toLocaleString('en-IN')
    : rupees.toLocaleString('en-US');
  return `${paise < 0 ? '-' : ''}${symbol}${grouped}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Splits `total` into parts proportional to `weights`, in whole paise, so the
 * parts always add up exactly to `total`. Leftover paise go to the largest part.
 */
export function allocateByWeights(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || weights.length === 0) return weights.map(() => 0);
  const parts = weights.map((w) => Math.floor((total * w) / sum));
  let leftover = total - parts.reduce((a, b) => a + b, 0);
  const order = weights.map((w, i) => i).sort((a, b) => weights[b] - weights[a]);
  let k = 0;
  while (leftover > 0) {
    parts[order[k % order.length]] += 1;
    leftover -= 1;
    k += 1;
  }
  return parts;
}
