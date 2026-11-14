import { Category, Transaction } from '../models';
import { istDate } from '../lib/time';
import { buildTxnQuery, SPEND_EXPR } from './ledger/query';
import { categorySpend, rollUp } from './dashboard';

function monthKeys(year: number, basis: 'calendar' | 'fy'): string[] {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const m0 = basis === 'fy' ? (3 + i) % 12 : i;
    const y = basis === 'fy' && m0 < 3 ? year + 1 : year;
    out.push(`${y}-${String(m0 + 1).padStart(2, '0')}`);
  }
  return out;
}

async function totalFor(ownerId: string, from: Date, to: Date) {
  const [agg] = await Transaction.aggregate([
    { $match: buildTxnQuery(ownerId, { from, to }) },
    {
      $group: {
        _id: null,
        spend: SPEND_EXPR,
        income: { $sum: { $cond: [{ $and: [{ $eq: ['$direction', 'credit'] }, { $eq: ['$status', 'settled'] }, { $eq: ['$kind', 'income'] }] }, '$amountPaise', 0] } },
      },
    },
  ]);
  return { spendPaise: agg?.spend || 0, incomePaise: agg?.income || 0 };
}

function yearRange(year: number, basis: 'calendar' | 'fy') {
  return basis === 'fy'
    ? { start: istDate(year, 3, 1), end: istDate(year + 1, 3, 1), label: `${year}-${String((year + 1) % 100).padStart(2, '0')}` }
    : { start: istDate(year, 0, 1), end: istDate(year + 1, 0, 1), label: String(year) };
}

/**
 * Year report: spend and income per month, a category × month table (top
 * level categories, splits/refunds/my-share applied as on the dashboard),
 * and the totals of the previous years to compare.
 */
export async function yearReport(ownerId: string, year: number, basis: 'calendar' | 'fy', compareYears = 3) {
  const cats = await Category.find({ ownerId });
  const top = cats.filter((c) => !c.parentId);
  const months = [];
  const byCategory: Record<string, Record<string, number>> = {};
  for (const key of monthKeys(year, basis)) {
    const [y, m] = key.split('-').map(Number);
    const totals = await totalFor(ownerId, istDate(y, m - 1, 1), istDate(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
    const rolled = rollUp(await categorySpend(ownerId, key), cats);
    for (const [id, v] of rolled) {
      const isTop = id === 'none' || id === 'refund' || top.some((c) => String(c._id) === id);
      if (!isTop || !v) continue;
      byCategory[id] = byCategory[id] || {};
      byCategory[id][key] = v;
    }
    months.push({ key, ...totals });
  }
  const categories = Object.entries(byCategory).map(([id, perMonth]) => {
    const c = cats.find((x) => String(x._id) === id);
    return {
      categoryId: c ? id : null,
      name: c?.name || (id === 'refund' ? 'Refunds' : 'Uncategorised'),
      color: c?.color || '#A39E98',
      perMonth,
      total: Object.values(perMonth).reduce((a, b) => a + b, 0),
    };
  }).sort((a, b) => b.total - a.total);

  const current = yearRange(year, basis);
  const years = [];
  for (let i = compareYears; i >= 0; i--) {
    const r = yearRange(year - i, basis);
    years.push({ label: r.label, ...(await totalFor(ownerId, r.start, r.end)) });
  }
  return {
    year, basis, label: current.label, months, categories, years,
    totalSpendPaise: months.reduce((s, m) => s + m.spendPaise, 0),
    totalIncomePaise: months.reduce((s, m) => s + m.incomePaise, 0),
  };
}
