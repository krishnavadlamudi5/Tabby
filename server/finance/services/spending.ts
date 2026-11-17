import { Category, Transaction } from '../models';
import { User } from '../../models/User';
import { addDays, istDate, istMonthKey, istMonthRange, istParts } from '../lib/time';
import { buildTxnQuery, SPEND_EXPR } from './ledger/query';
import { categorySpendRange, rollUp } from './dashboard';
import { totalFor } from './reports';
import { raiseAlert } from './alerts';
import { formatPaiseINR as formatInr } from '../lib/money';

/** "2026-11-05" (India day) -> the UTC instant that day starts. */
export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return istDate(y, m - 1, d);
}

function dayKey(d: Date): string {
  const p = istParts(d);
  return `${p.year}-${String(p.month0 + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** How many monthly budgets fit in [from, to): whole months when the period is month-aligned. */
export function budgetFactor(from: Date, to: Date): number {
  const a = istParts(from);
  const b = istParts(to);
  if (a.day === 1 && b.day === 1) return (b.year * 12 + b.month0) - (a.year * 12 + a.month0);
  return Math.round(((to.getTime() - from.getTime()) / 86_400_000 / 30.44) * 100) / 100;
}

async function monthlyBudgetOf(ownerId: string): Promise<number> {
  const u = await User.findOne({ id: ownerId }, { preferences: 1 }).lean() as any;
  const v = Number(u?.preferences?.monthlyBudgetPaise || 0);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Everything the Spending page shows for a period: totals, the previous period
 * of the same length, spend per category (with sub-categories), a day or
 * month trend, budgets scaled to the period, and the top merchants.
 * `fromDay`/`toDay` are India dates, both inclusive.
 */
export async function spendingSummary(ownerId: string, fromDay: string, toDay: string) {
  const from = parseDay(fromDay);
  const to = addDays(parseDay(toDay), 1);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
  const prevFrom = addDays(from, -days);

  const [cur, prev, cats, byCatRaw, monthly] = await Promise.all([
    totalFor(ownerId, from, to),
    totalFor(ownerId, prevFrom, from),
    Category.find({ ownerId }),
    categorySpendRange(ownerId, from, to),
    monthlyBudgetOf(ownerId),
  ]);
  const rolled = rollUp(byCatRaw, cats);
  const catById = new Map(cats.map((c) => [String(c._id), c]));

  const byCategory = Array.from(rolled.entries())
    .filter(([id]) => id === 'none' || id === 'refund' || (catById.has(id) && !catById.get(id)!.parentId))
    .map(([id, amountPaise]) => {
      const c = catById.get(id);
      const kids = c ? cats.filter((k) => String(k.parentId) === id) : [];
      const children = kids.length
        ? [
          ...kids.map((k) => ({ categoryId: String(k._id), name: k.name, amountPaise: byCatRaw.get(String(k._id)) || 0 })),
          { categoryId: id, name: `Other ${c!.name.toLowerCase()}`, amountPaise: byCatRaw.get(id) || 0 },
        ].filter((k) => k.amountPaise !== 0).sort((x, y) => y.amountPaise - x.amountPaise)
        : [];
      return {
        categoryId: c ? id : null,
        key: c?.key || '',
        name: c?.name || (id === 'refund' ? 'Refunds' : 'Uncategorised'),
        color: c?.color || '#A39E98',
        icon: c?.icon || 'tag',
        amountPaise,
        children,
      };
    })
    .filter((r) => r.amountPaise !== 0)
    .sort((a, b) => b.amountPaise - a.amountPaise);

  // Trend: per day for up to ~2 months, per month beyond that.
  const granularity: 'day' | 'month' = days <= 62 ? 'day' : 'month';
  const fmt = granularity === 'day' ? '%Y-%m-%d' : '%Y-%m';
  const rows = await Transaction.aggregate([
    { $match: buildTxnQuery(ownerId, { from, to }) },
    { $group: { _id: { $dateToString: { format: fmt, date: '$postedAt', timezone: '+05:30' } }, s: SPEND_EXPR } },
  ]);
  const byKey = new Map(rows.map((r: any) => [r._id as string, r.s as number]));
  const trend: { key: string; spendPaise: number }[] = [];
  if (granularity === 'day') {
    for (let d = from; d < to; d = addDays(d, 1)) trend.push({ key: dayKey(d), spendPaise: byKey.get(dayKey(d)) || 0 });
  } else {
    for (let m = istMonthKey(from); istMonthRange(m).start < to; m = istMonthKey(istMonthRange(m).end)) {
      trend.push({ key: m, spendPaise: byKey.get(m) || 0 });
    }
  }

  const factor = budgetFactor(from, to);
  const categoryBudgets = cats.filter((c) => c.budgetPaise > 0).map((c) => ({
    categoryId: String(c._id), name: c.name, color: c.color, monthlyPaise: c.budgetPaise,
    budgetPaise: Math.round(c.budgetPaise * factor), spentPaise: rolled.get(String(c._id)) || 0,
  })).sort((a, b) => b.spentPaise / (b.budgetPaise || 1) - a.spentPaise / (a.budgetPaise || 1));

  const merchants = await Transaction.aggregate([
    { $match: { ...buildTxnQuery(ownerId, { from, to }), status: 'settled', direction: 'debit', kind: { $in: ['expense', 'fee', 'emi'] } } },
    { $group: { _id: { $ifNull: [{ $cond: [{ $eq: ['$merchant', ''] }, null, '$merchant'] }, '$merchantRaw'] }, amountPaise: { $sum: { $ifNull: ['$mySharePaise', '$amountPaise'] } }, count: { $sum: 1 } } },
    { $sort: { amountPaise: -1 } },
    { $limit: 6 },
  ]);

  return {
    from: fromDay,
    to: toDay,
    days,
    granularity,
    spendPaise: cur.spendPaise,
    incomePaise: cur.incomePaise,
    previous: { from: dayKey(prevFrom), to: dayKey(addDays(from, -1)), spendPaise: prev.spendPaise },
    byCategory,
    trend,
    budget: monthly ? { monthlyPaise: monthly, budgetPaise: Math.round(monthly * factor), spentPaise: cur.spendPaise } : null,
    categoryBudgets,
    topMerchants: merchants.map((m: any) => ({ name: m._id || 'Unknown', amountPaise: m.amountPaise, count: m.count })),
  };
}

const THRESHOLDS = [80, 100] as const;

/**
 * Budget alerts for the current India month: one alert per budget when spend
 * crosses 80% and again at 100%. Covers the overall monthly budget and every
 * category budget.
 */
export async function budgetWatch(now = new Date()) {
  const month = istMonthKey(now);
  const { start, end } = istMonthRange(month);
  const owners = new Set<string>([
    ...(await Category.distinct('ownerId', { budgetPaise: { $gt: 0 } })) as string[],
    ...(await User.find({ 'preferences.monthlyBudgetPaise': { $gt: 0 } }, { id: 1 }).lean()).map((u: any) => u.id as string),
  ]);
  let raised = 0;
  const monthName = new Date(start.getTime() + 15 * 86_400_000).toLocaleString('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' });
  for (const ownerId of owners) {
    const [total, cats, raw, monthly] = await Promise.all([
      totalFor(ownerId, start, end), Category.find({ ownerId }), categorySpendRange(ownerId, start, end), monthlyBudgetOf(ownerId),
    ]);
    const rolled = rollUp(raw, cats);
    const checks = [
      ...(monthly ? [{ id: 'all', name: 'your monthly budget', budget: monthly, spent: total.spendPaise }] : []),
      ...cats.filter((c) => c.budgetPaise > 0).map((c) => ({ id: String(c._id), name: `${c.name} budget`, budget: c.budgetPaise, spent: rolled.get(String(c._id)) || 0 })),
    ];
    for (const c of checks) {
      const pct = Math.floor((c.spent / c.budget) * 100);
      const hit = [...THRESHOLDS].reverse().find((t) => pct >= t);
      if (!hit) continue;
      const over = hit === 100;
      const alert = await raiseAlert(ownerId, {
        type: 'budget',
        title: over ? `Over ${c.name} for ${monthName}` : `${pct}% of ${c.name} used`,
        body: `${formatInr(c.spent)} spent of ${formatInr(c.budget)} in ${monthName}.${over ? '' : ` ${formatInr(c.budget - c.spent)} left.`}`,
        entity: c.id === 'all' ? null : { kind: 'category', id: c.id },
        dedupeKey: `budget:${month}:${c.id}:${hit}`,
        email: over,
      });
      if (alert) raised += 1;
    }
  }
  return raised;
}
