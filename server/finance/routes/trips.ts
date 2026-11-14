import { Router } from 'express';
import { Group } from '../../models/Group';
import { Expense } from '../../models/Expense';
import { Category, Transaction } from '../models';
import { handler, scoped, validate } from '../lib/http';
import { tripUpdate } from '../validation/schemas';
import { addDays, istDate } from '../lib/time';

const router = Router();

/** "2026-11-20" -> start of that India day. */
function dayStart(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return istDate(y, m - 1, d);
}

async function tripFor(req: any, res: any) {
  const group = await Group.findOne({ id: req.params.groupId, members: req.userId });
  if (!group) { res.status(404).json({ error: 'Trip not found' }); return null; }
  return group;
}

// PATCH /api/finance/trips/:groupId - dates & budget (any member)
router.patch('/:groupId', handler(async (req, res) => {
  const body = validate(tripUpdate, req.body, res);
  if (!body) return;
  const group = await tripFor(req, res);
  if (!group) return;
  const set: Record<string, any> = {};
  if (body.startDate !== undefined) set.startDate = body.startDate ? body.startDate.toISOString().slice(0, 10) : null;
  if (body.endDate !== undefined) set.endDate = body.endDate ? body.endDate.toISOString().slice(0, 10) : null;
  if (body.budgetPaise !== undefined) set.budgetPaise = body.budgetPaise;
  if (body.currency) set.currency = body.currency;
  if (set.startDate && set.endDate && set.endDate < set.startDate) { res.status(400).json({ error: 'The trip ends before it starts' }); return; }
  const updated = await Group.findOneAndUpdate({ id: group.id }, { $set: set }, { returnDocument: 'after' });
  res.json({ success: true, group: updated });
}));

// GET /api/finance/trips/:groupId - my personal transactions on the trip,
// suggestions from the trip dates, and the trip summary.
router.get('/:groupId', handler(async (req, res) => {
  const group = await tripFor(req, res);
  if (!group) return;
  const owner = scoped(req);
  const personal = await Transaction.find({ ...owner, tripId: group.id }).sort({ postedAt: 1 });

  let suggestions: any[] = [];
  if (group.startDate) {
    const from = addDays(dayStart(group.startDate), -1);
    const to = addDays(dayStart(group.endDate || group.startDate), 2);
    suggestions = await Transaction.find({
      ...owner, tripId: null, direction: 'debit', status: 'settled', kind: 'expense', sharedExpenseId: null,
      postedAt: { $gte: from, $lt: to },
    }).sort({ postedAt: 1 }).limit(100);
  }

  const shared = await Expense.find({ groupId: group.id, isSettlement: { $ne: true } });
  const cats = await Category.find(owner);
  const catName = new Map(cats.map((c) => [String(c._id), c.name]));

  // Personal (not shared) payments count in full; shared ones are already in
  // the group's expenses, so they're not double counted.
  const personalOnly = personal.filter((t) => !t.sharedExpenseId && t.status === 'settled' && t.direction === 'debit');
  const byCategory = new Map<string, number>();
  for (const t of personalOnly) {
    if (t.splits.length) for (const p of t.splits) byCategory.set(catName.get(String(p.categoryId)) || 'Uncategorised', (byCategory.get(catName.get(String(p.categoryId)) || 'Uncategorised') || 0) + p.amountPaise);
    else byCategory.set(catName.get(String(t.categoryId)) || 'Uncategorised', (byCategory.get(catName.get(String(t.categoryId)) || 'Uncategorised') || 0) + t.amountPaise);
  }
  for (const e of shared) {
    const name = `Shared: ${e.category || 'other'}`;
    byCategory.set(name, (byCategory.get(name) || 0) + Math.round(e.amount * 100));
  }
  const sharedTotal = shared.reduce((s, e) => s + Math.round(e.amount * 100), 0);
  const personalTotal = personalOnly.reduce((s, t) => s + t.amountPaise, 0);
  const perPerson = new Map<string, { paidPaise: number; sharePaise: number }>();
  for (const e of shared) {
    const p = perPerson.get(e.paidBy) || { paidPaise: 0, sharePaise: 0 };
    p.paidPaise += Math.round(e.amount * 100);
    perPerson.set(e.paidBy, p);
    for (const s of e.splits) {
      const q = perPerson.get(s.userId) || { paidPaise: 0, sharePaise: 0 };
      q.sharePaise += Math.round(s.amount * 100);
      perPerson.set(s.userId, q);
    }
  }
  const total = sharedTotal + personalTotal;
  res.json({
    success: true,
    group,
    personal,
    suggestions,
    summary: {
      totalPaise: total,
      sharedPaise: sharedTotal,
      myPersonalPaise: personalTotal,
      budgetPaise: group.budgetPaise || null,
      remainingPaise: group.budgetPaise ? group.budgetPaise - total : null,
      byCategory: Array.from(byCategory.entries()).map(([name, amountPaise]) => ({ name, amountPaise })).sort((a, b) => b.amountPaise - a.amountPaise),
      perPerson: Array.from(perPerson.entries()).map(([userId, v]) => ({ userId, ...v })),
    },
  });
}));

export default router;
