import { Types } from 'mongoose';
import { Category, Commitment, Holding, Transaction, IHolding } from '../models';
import { istMonthKey, istMonthRange, shiftMonthKey } from '../lib/time';

/** Adds or replaces (same India day) a value point on a holding's history. */
export function pushHistory(h: Pick<IHolding, 'history' | 'investedPaise' | 'currentValuePaise'>, date: Date) {
  const day = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const point = { date, investedPaise: h.investedPaise, valuePaise: h.currentValuePaise };
  const history = (h.history || []).filter((p) => day(new Date(p.date)) !== day(date));
  history.push(point);
  history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return history.slice(-400);
}

/**
 * Investments page: totals, split by type, SIPs, money put in per month (from
 * bank payments tagged Investments) and total value per month (from the value
 * history of each holding).
 */
export async function investmentSummary(ownerId: string, now = new Date(), months = 12) {
  const [holdings, sips, cats] = await Promise.all([
    Holding.find({ ownerId }).sort({ isActive: -1, currentValuePaise: -1 }),
    Commitment.find({ ownerId, type: 'sip' }).sort({ 'schedule.nextDueDate': 1 }),
    Category.find({ ownerId, $or: [{ key: 'investments' }, { key: /^investments\./ }] }, { _id: 1, parentId: 1, key: 1 }),
  ]);
  const active = holdings.filter((h) => h.isActive);
  const investedPaise = active.reduce((s, h) => s + h.investedPaise, 0);
  const valuePaise = active.reduce((s, h) => s + h.currentValuePaise, 0);

  const byTypeMap = new Map<string, { investedPaise: number; valuePaise: number; count: number }>();
  for (const h of active) {
    const t = byTypeMap.get(h.type) || { investedPaise: 0, valuePaise: 0, count: 0 };
    t.investedPaise += h.investedPaise;
    t.valuePaise += h.currentValuePaise;
    t.count += 1;
    byTypeMap.set(h.type, t);
  }
  const byType = Array.from(byTypeMap.entries()).map(([type, v]) => ({ type, ...v })).sort((a, b) => b.valuePaise - a.valuePaise);

  // Money put in per month, from the ledger.
  const thisMonth = istMonthKey(now);
  const firstMonth = shiftMonthKey(thisMonth, -(months - 1));
  const from = istMonthRange(firstMonth).start;
  const to = istMonthRange(thisMonth).end;
  const catIds = cats.map((c) => c._id as Types.ObjectId);
  const rows = await Transaction.aggregate([
    {
      $match: {
        ownerId, status: 'settled', direction: 'debit', postedAt: { $gte: from, $lt: to },
        $or: [{ kind: 'investment' }, ...(catIds.length ? [{ categoryId: { $in: catIds } }] : [])],
      },
    },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$postedAt', timezone: '+05:30' } }, s: { $sum: '$amountPaise' }, n: { $sum: 1 } } },
  ]);
  const putIn = new Map(rows.map((r: any) => [r._id as string, r.s as number]));

  const timeline = [];
  for (let i = 0; i < months; i++) {
    const m = shiftMonthKey(firstMonth, i);
    const end = istMonthRange(m).end;
    let value = 0;
    let invested = 0;
    for (const h of holdings) {
      const pts = (h.history || []).filter((p) => new Date(p.date) < end);
      const last = pts[pts.length - 1];
      if (!last) continue;
      // A closed holding stops counting from the point it was marked inactive.
      if (!h.isActive && h.updatedAt < end && last === h.history[h.history.length - 1]) continue;
      value += last.valuePaise;
      invested += last.investedPaise;
    }
    timeline.push({ month: m, investedPaise: invested, valuePaise: value, putInPaise: putIn.get(m) || 0 });
  }

  const sipMonthlyPaise = sips.filter((s) => s.status !== 'paused').reduce((s, c) => {
    const f = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, half_yearly: 1 / 6, yearly: 1 / 12 }[c.schedule.freq] || 1;
    return s + Math.round(c.amountPaise * f);
  }, 0);

  return {
    totals: {
      investedPaise,
      valuePaise,
      gainPaise: valuePaise - investedPaise,
      gainPct: investedPaise ? Math.round(((valuePaise - investedPaise) / investedPaise) * 1000) / 10 : null,
      sipMonthlyPaise,
      putInThisMonthPaise: putIn.get(thisMonth) || 0,
      putInLast12Paise: Array.from(putIn.values()).reduce((a, b) => a + b, 0),
    },
    byType,
    timeline,
    holdings,
    sips,
  };
}
