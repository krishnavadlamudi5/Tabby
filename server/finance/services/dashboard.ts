import { Types } from 'mongoose';
import { Account, Alert, Category, Commitment, Policy, RawEvent, Statement, Transaction, ICategory } from '../models';
import { addDays, istMonthKey, istMonthRange, shiftMonthKey } from '../lib/time';
import { buildTxnQuery, SPEND_EXPR } from './ledger/query';

async function spendFor(ownerId: string, month: string): Promise<number> {
  const [agg] = await Transaction.aggregate([{ $match: buildTxnQuery(ownerId, { month }) }, { $group: { _id: null, s: SPEND_EXPR } }]);
  return agg?.s || 0;
}

/**
 * Spend per category for a month. Split payments count per part; refunds
 * reduce the category of the payment they reverse; shared payments count
 * only my share (scaled across parts).
 */
export async function categorySpend(ownerId: string, month: string): Promise<Map<string, number>> {
  const { start, end } = istMonthRange(month);
  return categorySpendRange(ownerId, start, end);
}

/** categorySpend for any [from, to) range. */
export async function categorySpendRange(ownerId: string, from: Date, to: Date): Promise<Map<string, number>> {
  const txns = await Transaction.find({ ...buildTxnQuery(ownerId, { from, to }), status: 'settled', kind: { $in: ['expense', 'fee', 'emi', 'refund'] } });
  const out = new Map<string, number>();
  const add = (id: unknown, v: number) => {
    const k = id ? String(id) : 'none';
    out.set(k, (out.get(k) || 0) + v);
  };
  const linkedIds = txns.filter((t) => t.kind === 'refund' && t.linkedTransactionId).map((t) => t.linkedTransactionId);
  const originals = new Map((await Transaction.find({ ownerId, _id: { $in: linkedIds } })).map((t) => [String(t._id), t]));
  for (const t of txns) {
    if (t.kind === 'refund') {
      const orig = t.linkedTransactionId ? originals.get(String(t.linkedTransactionId)) : null;
      add(orig ? orig.categoryId : 'refund', -t.amountPaise);
      continue;
    }
    if (t.direction !== 'debit') continue;
    const total = t.mySharePaise ?? t.amountPaise;
    if (t.splits.length) {
      const scale = total / t.amountPaise;
      for (const p of t.splits) add(p.categoryId, Math.round(p.amountPaise * scale));
    } else {
      add(t.categoryId, total);
    }
  }
  return out;
}

/** Adds each child's amount to its parent (parents report their whole tree). */
export function rollUp(byCat: Map<string, number>, cats: ICategory[]): Map<string, number> {
  const parentOf = new Map(cats.map((c) => [String(c._id), c.parentId ? String(c.parentId) : null]));
  const out = new Map<string, number>();
  for (const [id, v] of byCat) {
    out.set(id, (out.get(id) || 0) + v);
    const parent = parentOf.get(id);
    if (parent) out.set(parent, (out.get(parent) || 0) + v);
  }
  return out;
}

export async function buildDashboard(ownerId: string, month: string, now = new Date()) {
  const prev = shiftMonthKey(month, -1);
  const cats = await Category.find({ ownerId });
  const catById = new Map(cats.map((c) => [String(c._id), c]));

  const [spend, prevSpend, byCatRaw] = await Promise.all([spendFor(ownerId, month), spendFor(ownerId, prev), categorySpend(ownerId, month)]);
  const rolled = rollUp(byCatRaw, cats);

  // Top-level categories for the donut / bars
  const byCategory = Array.from(rolled.entries())
    .filter(([id]) => id === 'none' || id === 'refund' || !catById.get(id)?.parentId)
    .map(([id, amountPaise]) => {
      const c = catById.get(id);
      return { categoryId: c ? id : null, name: c?.name || (id === 'refund' ? 'Refunds' : 'Uncategorised'), color: c?.color || '#A39E98', icon: c?.icon || 'tag', amountPaise };
    })
    .filter((r) => r.amountPaise !== 0)
    .sort((a, b) => b.amountPaise - a.amountPaise);

  const budgets = cats.filter((c) => c.budgetPaise > 0).map((c) => ({
    categoryId: String(c._id), name: c.name, color: c.color, budgetPaise: c.budgetPaise, spentPaise: rolled.get(String(c._id)) || 0,
  }));

  // Groceries: sub-categories this month + 6-month trend
  const groceries = cats.find((c) => c.key === 'groceries' && !c.parentId);
  let groceriesWidget = null;
  if (groceries) {
    const children = cats.filter((c) => String(c.parentId) === String(groceries._id));
    const breakdown = [{ id: String(groceries._id), name: 'Other groceries', color: groceries.color }, ...children.map((c) => ({ id: String(c._id), name: c.name, color: c.color }))]
      .map((c) => ({ ...c, amountPaise: byCatRaw.get(c.id) || 0 }))
      .filter((c) => c.amountPaise !== 0);
    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const m = shiftMonthKey(month, -i);
      const r = rollUp(await categorySpend(ownerId, m), cats);
      trend.push({ month: m, amountPaise: r.get(String(groceries._id)) || 0 });
    }
    groceriesWidget = { totalPaise: rolled.get(String(groceries._id)) || 0, breakdown, trend };
  }

  const horizon = addDays(now, 14);
  const [commitments, renewals, pendingRefunds, reviewEvents, uncategorised, mismatched, accounts, unreadAlerts] = await Promise.all([
    Commitment.find({ ownerId, status: { $ne: 'paused' }, 'schedule.nextDueDate': { $lte: horizon } }).sort({ 'schedule.nextDueDate': 1 }),
    Policy.find({ ownerId, status: { $in: ['active', 'renewal_due'] }, renewalDate: { $gte: addDays(now, -1), $lte: addDays(now, 30) } }).sort({ renewalDate: 1 }),
    Transaction.find({ ownerId, kind: 'refund', status: 'pending' }).sort({ expectedAt: 1 }),
    RawEvent.countDocuments({ ownerId, status: 'needs_review' }),
    Transaction.countDocuments({ ownerId, kind: 'expense', status: 'settled', categoryId: null, 'splits.0': { $exists: false } }),
    Statement.countDocuments({ ownerId, status: 'mismatch' }),
    Account.find({ ownerId, isActive: true }),
    Alert.countDocuments({ ownerId, readAt: null }),
  ]);

  const unreconciledAccounts = [];
  for (const a of accounts) {
    const count = await Transaction.countDocuments({ ownerId, accountId: a._id, status: 'settled', reconciled: false, postedAt: { $lt: istMonthRange(istMonthKey(now)).start } });
    const last = await Statement.findOne({ ownerId, accountId: a._id }).sort({ periodEnd: -1 });
    if (count > 0 || last?.status === 'mismatch') {
      unreconciledAccounts.push({ accountId: String(a._id), name: a.name, unreconciledCount: count, lastStatementStatus: last?.status || null });
    }
  }

  const upcoming = [
    ...commitments.map((c) => ({
      kind: 'commitment' as const, id: String(c._id), type: c.type, name: c.name, amountPaise: c.amountPaise, currency: c.currency,
      dueDate: c.schedule.nextDueDate, status: c.status,
    })),
    ...renewals.filter((p) => !commitments.some((c) => String(c.policyId) === String(p._id))).map((p) => ({
      kind: 'policy' as const, id: String(p._id), type: 'renewal', name: `${p.insurer} renewal`, amountPaise: p.premiumPaise, currency: 'INR',
      dueDate: p.renewalDate!, status: p.status,
    })),
  ].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  return {
    month,
    spendPaise: spend,
    previousMonth: prev,
    previousSpendPaise: prevSpend,
    byCategory,
    budgets,
    groceries: groceriesWidget,
    upcoming,
    pendingRefunds: pendingRefunds.map((t) => ({
      id: String(t._id), merchant: t.merchant, amountPaise: t.amountPaise, expectedAt: t.expectedAt || null,
      overdue: Boolean(t.expectedAt && t.expectedAt < now),
    })),
    review: { events: reviewEvents, uncategorised, statements: mismatched, total: reviewEvents + uncategorised + mismatched },
    unreconciledAccounts,
    unreadAlerts,
  };
}

export { Types };
