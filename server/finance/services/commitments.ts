import { Commitment, ICommitment, Transaction } from '../models';
import { addDays, istDate, istParts, shiftMonthKey, istMonthKey, istMonthRange } from '../lib/time';
import { formatPaiseINR } from '../lib/money';
import { merchantKey, } from './ledger/classify';
import { normaliseMerchant } from './ledger/merchants';
import { raiseAlert } from './alerts';

const FREQ_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };

/** Next due date after `from` for a schedule, keeping the day of month (clamped to month length). */
export function rollDueDate(from: Date, freq: string, dayOfMonth?: number): Date {
  if (freq === 'weekly') return addDays(from, 7);
  const months = FREQ_MONTHS[freq] || 1;
  const p = istParts(from);
  const idx = p.year * 12 + p.month0 + months;
  const y = Math.floor(idx / 12);
  const m0 = idx % 12;
  const daysInMonth = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  return istDate(y, m0, Math.min(dayOfMonth || p.day, daysInMonth));
}

/** Debit that pays this commitment: amount within tolerance, merchant (if set), around the due date. */
export async function findPayment(c: ICommitment, windowStart: Date, windowEnd: Date) {
  const tol = Math.max(100, Math.round((c.amountPaise * (c.matchRule?.tolerancePct ?? 5)) / 100));
  const candidates = await Transaction.find({
    ownerId: c.ownerId, direction: 'debit', status: 'settled',
    amountPaise: { $gte: c.amountPaise - tol, $lte: c.amountPaise + tol },
    postedAt: { $gte: windowStart, $lte: windowEnd },
    ...(c.accountId ? { accountId: c.accountId } : {}),
    ...(c.lastPaidTransactionId ? { _id: { $ne: c.lastPaidTransactionId } } : {}),
  }).sort({ postedAt: 1 });
  const needle = (c.matchRule?.merchantContains || '').toLowerCase();
  return candidates.find((t) => !needle || `${normaliseMerchant(t.merchant)} ${normaliseMerchant(t.merchantRaw)} ${t.description.toLowerCase()}`.includes(needle)) || null;
}

/**
 * Status engine (daily job):
 *  - a matching debit near the due date -> paid, roll nextDueDate
 *  - due date + 2 days passed without one -> missed (alert)
 * 'failed' / 'action_needed' set from emails stay until a payment shows up.
 */
export async function commitmentWatch(now = new Date(), ownerId?: string): Promise<{ paid: number; missed: number }> {
  const list = await Commitment.find({ ...(ownerId ? { ownerId } : {}), status: { $ne: 'paused' }, 'schedule.nextDueDate': { $lte: addDays(now, 5) } });
  let paid = 0;
  let missed = 0;
  for (const c of list) {
    if (!c.amountPaise) continue;
    const due = c.schedule.nextDueDate;
    const txn = await findPayment(c, addDays(due, -7), now);
    if (txn) {
      c.status = 'paid';
      c.statusNote = '';
      c.lastPaidTransactionId = txn._id;
      c.lastPaidAt = txn.postedAt;
      c.schedule.nextDueDate = rollDueDate(due, c.schedule.freq, c.schedule.dayOfMonth);
      await c.save();
      paid += 1;
      continue;
    }
    if (now > addDays(due, 2) && !['missed', 'failed', 'action_needed'].includes(c.status)) {
      c.status = 'missed';
      await c.save();
      missed += 1;
      await raiseAlert(c.ownerId, {
        type: 'commitment_missed', title: `Missed: ${c.name} (${formatPaiseINR(c.amountPaise, c.currency)})`,
        body: `It was due on ${due.toISOString().slice(0, 10)} and no matching payment has arrived.`,
        entity: { kind: 'commitment', id: String(c._id) }, dedupeKey: `missed:${c._id}:${due.toISOString().slice(0, 10)}`, email: true,
      });
    } else if (now >= addDays(due, -3) && now <= due && c.status !== 'paid') {
      await raiseAlert(c.ownerId, {
        type: 'due', title: `Due soon: ${c.name} (${formatPaiseINR(c.amountPaise, c.currency)})`, dueAt: due,
        entity: { kind: 'commitment', id: String(c._id) }, dedupeKey: `due:${c._id}:${due.toISOString().slice(0, 10)}`,
      });
    }
  }
  return { paid, missed };
}

/**
 * "Looks recurring - track it?": same merchant with a similar amount (±5%)
 * in at least 2 of the last 3 full months, not already tracked.
 */
export async function recurringSuggestions(ownerId: string, now = new Date()) {
  const thisMonth = istMonthKey(now);
  const start = istMonthRange(shiftMonthKey(thisMonth, -3)).start;
  const end = istMonthRange(thisMonth).start;
  const txns = await Transaction.find({ ownerId, direction: 'debit', status: 'settled', kind: { $in: ['expense', 'emi', 'fee'] }, postedAt: { $gte: start, $lt: end } });
  const groups = new Map<string, typeof txns>();
  for (const t of txns) {
    const key = merchantKey(t.merchant || t.merchantRaw);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), t]);
  }
  const existing = await Commitment.find({ ownerId });
  const tracked = existing.map((c) => (c.matchRule?.merchantContains || normaliseMerchant(c.name)).toLowerCase()).filter(Boolean);
  const out: { name: string; merchantContains: string; amountPaise: number; dayOfMonth: number; months: string[] }[] = [];
  for (const [key, list] of groups) {
    const amounts = list.map((t) => t.amountPaise).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    const similar = list.filter((t) => Math.abs(t.amountPaise - median) <= median * 0.05);
    const months = Array.from(new Set(similar.map((t) => istMonthKey(t.postedAt))));
    if (months.length < 2) continue;
    if (tracked.some((tk) => tk.includes(key) || key.includes(tk))) continue;
    const days = similar.map((t) => istParts(t.postedAt).day).sort((a, b) => a - b);
    out.push({ name: similar[0].merchant || key, merchantContains: key, amountPaise: median, dayOfMonth: days[Math.floor(days.length / 2)], months: months.sort() });
  }
  return out.sort((a, b) => b.amountPaise - a.amountPaise);
}
