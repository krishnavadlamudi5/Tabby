import { Types } from 'mongoose';
import { ISplitPart } from '../../models';
import { allocateByWeights } from '../../lib/money';
import { groceryKeyForItem } from './groceryDictionary';

export class SplitError extends Error {
  status = 400;
}

/** Split parts must cover the whole transaction, to the paisa. */
export function assertSplitsTotal(parts: { amountPaise: number }[], totalPaise: number): void {
  const sum = parts.reduce((s, p) => s + p.amountPaise, 0);
  if (parts.some((p) => !Number.isInteger(p.amountPaise) || p.amountPaise < 0)) throw new SplitError('Split amounts must be whole paise');
  if (sum !== totalPaise) throw new SplitError(`Split parts add up to ${sum} paise but the payment is ${totalPaise} paise`);
}

/** Percentages -> paise parts that add up exactly (leftover to the largest part). */
export function partsFromPercents(totalPaise: number, parts: { categoryId: string | null; percent: number; note?: string }[]): ISplitPart[] {
  const pctSum = parts.reduce((s, p) => s + p.percent, 0);
  if (Math.abs(pctSum - 100) > 0.001) throw new SplitError(`Percentages add up to ${pctSum}, not 100`);
  const amounts = allocateByWeights(totalPaise, parts.map((p) => p.percent));
  return parts.map((p, i) => ({
    categoryId: p.categoryId ? new Types.ObjectId(p.categoryId) : null,
    amountPaise: amounts[i],
    note: p.note || '',
  }));
}

/**
 * Auto-split an order's line items into grocery sub-categories. Unknown
 * items go to the parent "Groceries" category. Item totals are scaled to the
 * payment amount so fees/discounts are spread proportionally and the parts
 * add up exactly.
 */
export function autoSplitLineItems(
  totalPaise: number,
  items: { name: string; qty?: number; amountPaise?: number }[],
  keys: Map<string, Types.ObjectId>,
): ISplitPart[] {
  const buckets = new Map<string, { amount: number; items: typeof items }>();
  for (const item of items) {
    const key = groceryKeyForItem(item.name) || 'groceries';
    const b = buckets.get(key) || { amount: 0, items: [] };
    b.amount += item.amountPaise || 0;
    b.items.push(item);
    buckets.set(key, b);
  }
  const entries = Array.from(buckets.entries()).filter(([, b]) => b.amount > 0);
  if (!entries.length) return [];
  const amounts = allocateByWeights(totalPaise, entries.map(([, b]) => b.amount));
  return entries.map(([key, b], i) => ({
    categoryId: keys.get(key) || keys.get('groceries') || null,
    amountPaise: amounts[i],
    note: '',
    lineItems: b.items.map((it) => ({ name: it.name, qty: it.qty, amountPaise: it.amountPaise })),
  }));
}
