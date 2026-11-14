import { Types } from 'mongoose';
import { Commitment, IPolicy, Policy, Transaction } from '../models';
import { addDays, financialYear, istParts } from '../lib/time';
import { normaliseMerchant } from './ledger/merchants';
import { categoryIdsByKey } from './categories';

/** Months between premiums; null for single premium. */
export function premiumMonths(freq: IPolicy['premiumFrequency']): number | null {
  return { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12, single: null }[freq];
}

/** Words of the insurer name used to match bank descriptors ("Care Health Insurance" -> ["care", "health"]). */
function insurerWords(insurer: string): string[] {
  return normaliseMerchant(insurer).split(' ').filter((w) => w.length > 2 && !['insurance', 'general', 'life', 'company', 'co'].includes(w));
}

/**
 * Links premium payments to a policy: debits whose merchant mentions the
 * insurer and whose amount is within ±1% of the premium. Also files them
 * under the Insurance category. Returns the linked transaction ids.
 */
const PAYMENT_VIA = /policybazaar|acko|digit|insurancedekho|ditto|coverfox|turtlemint|renewbuy|razorpay|payu|billdesk|ccavenue|paytm|phonepe|cashfree|insurance|general|lombard|ergo|assurance/;

/**
 * Links premium payments to a policy:
 *  - a debit whose merchant mentions the insurer, amount within ±1% of the
 *    premium (any date), or
 *  - when bought through a website/gateway (Acko, PolicyBazaar, Razorpay…):
 *    the same amount (±₹1) within 3 days of the policy start / email.
 * Files them under Insurance. Returns the linked transaction ids.
 */
export async function linkPremiums(ownerId: string, policy: IPolicy, aroundDate?: Date): Promise<Types.ObjectId[]> {
  if (!policy.premiumPaise) return [];
  const words = insurerWords(policy.insurer);
  const tol = Math.max(100, Math.round(policy.premiumPaise * 0.01));
  const candidates = await Transaction.find({
    ownerId, direction: 'debit', status: 'settled',
    amountPaise: { $gte: policy.premiumPaise - tol, $lte: policy.premiumPaise + tol },
  });
  const anchors = [aroundDate, policy.startDate].filter((d): d is Date => Boolean(d));
  const hits = candidates.filter((t) => {
    const m = `${normaliseMerchant(t.merchant)} ${normaliseMerchant(t.merchantRaw)} ${normaliseMerchant(t.description)}`;
    if (words.some((w) => m.includes(w))) return true;
    const near = anchors.some((a) => Math.abs(t.postedAt.getTime() - a.getTime()) <= 3 * 86_400_000);
    const exact = Math.abs(t.amountPaise - policy.premiumPaise) <= 100;
    return near && exact && (PAYMENT_VIA.test(m) || !m.trim());
  });
  if (!hits.length) return [];
  const ids = hits.map((h) => h._id);
  const keys = await categoryIdsByKey(ownerId);
  await Transaction.updateMany(
    { _id: { $in: ids }, ownerId, categorySource: { $ne: 'user' } },
    { $set: { categoryId: keys.get('insurance'), categorySource: 'rule' } },
  );
  await Policy.updateOne({ _id: policy._id, ownerId }, { $addToSet: { premiumTransactionIds: { $each: ids } } });
  return ids;
}

/** Keeps a "premium" commitment in step with a policy's next premium date. */
export async function syncPremiumCommitment(ownerId: string, policy: IPolicy): Promise<void> {
  const key = `policy:${policy._id}`;
  const months = premiumMonths(policy.premiumFrequency);
  if (!months || !policy.renewalDate || !policy.premiumPaise || ['cancelled', 'lapsed'].includes(policy.status)) {
    await Commitment.deleteOne({ ownerId, externalKey: key });
    return;
  }
  await Commitment.updateOne(
    { ownerId, externalKey: key },
    {
      $set: {
        name: `${policy.insurer} premium${policy.planName ? ` (${policy.planName})` : ''}`,
        type: 'premium', amountPaise: policy.premiumPaise, policyId: policy._id,
        'schedule.freq': months === 1 ? 'monthly' : months === 3 ? 'quarterly' : months === 6 ? 'half_yearly' : 'yearly',
        'schedule.nextDueDate': policy.renewalDate, 'schedule.dayOfMonth': istParts(policy.renewalDate).day,
        'matchRule.merchantContains': insurerWords(policy.insurer)[0] || '', 'matchRule.tolerancePct': 1,
      },
      $setOnInsert: { ownerId, externalKey: key, status: 'due', source: 'manual', currency: 'INR' },
    },
    { upsert: true },
  );
}

/** Yearly 80C / 80D totals from linked premium payments, per Indian financial year. */
export async function taxSummary(ownerId: string, fy: string) {
  const policies = await Policy.find({ ownerId, taxSection: { $in: ['80C', '80D'] } });
  const rows: { policyId: string; insurer: string; planName: string; section: string; paidPaise: number; payments: number }[] = [];
  for (const p of policies) {
    const txns = await Transaction.find({ ownerId, _id: { $in: p.premiumTransactionIds }, status: 'settled' });
    const inYear = txns.filter((t) => financialYear(t.postedAt) === fy);
    rows.push({
      policyId: String(p._id), insurer: p.insurer, planName: p.planName, section: p.taxSection!,
      paidPaise: inYear.reduce((s, t) => s + t.amountPaise, 0), payments: inYear.length,
    });
  }
  const total = (sec: string) => rows.filter((r) => r.section === sec).reduce((s, r) => s + r.paidPaise, 0);
  return {
    fy,
    rows,
    totals: { '80C': total('80C'), '80D': total('80D') },
    // Statutory caps for reference (₹1.5 lakh for 80C; 80D ₹25,000 self/family,
    // up to ₹50,000 more for senior-citizen parents). Not tax advice.
    limitsPaise: { '80C': 150000_00, '80D_self': 25000_00, '80D_parents_senior': 50000_00 },
  };
}

export function daysUntil(date: Date, now = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
}

export { addDays };

/** Year label for a date: "2026" (calendar) or "2026-27" (Indian FY, Apr-Mar). */
export function yearLabel(d: Date, basis: 'calendar' | 'fy'): string {
  if (basis === 'fy') return financialYear(d);
  return String(new Date(d.getTime() + 330 * 60_000).getUTCFullYear());
}

/**
 * Premiums paid per policy per year (from linked payments), with totals by
 * year, by insurance type and by insured person.
 */
export async function premiumSummary(ownerId: string, basis: 'calendar' | 'fy', yearsBack = 4, now = new Date()) {
  const { Person } = await import('../models');
  const policies = await Policy.find({ ownerId }).sort({ type: 1, insurer: 1 });
  const people = new Map((await Person.find({ ownerId })).map((p) => [String(p._id), p]));
  const current = yearLabel(now, basis);
  const years: string[] = [];
  for (let i = yearsBack - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 365.25 * 86_400_000);
    const y = yearLabel(d, basis);
    if (!years.includes(y)) years.push(y);
  }
  if (!years.includes(current)) years.push(current);

  const txnIds = policies.flatMap((p) => p.premiumTransactionIds);
  const txns = new Map((await Transaction.find({ ownerId, _id: { $in: txnIds }, status: 'settled' })).map((t) => [String(t._id), t]));
  const totalsByYear: Record<string, number> = Object.fromEntries(years.map((y) => [y, 0]));
  const byType: Record<string, Record<string, number>> = {};
  const byPerson: Record<string, Record<string, number>> = {};
  const rows = policies.map((p) => {
    const byYear: Record<string, number> = Object.fromEntries(years.map((y) => [y, 0]));
    const payments = p.premiumTransactionIds.map((id) => txns.get(String(id))).filter(Boolean) as any[];
    for (const t of payments) {
      const y = yearLabel(t.postedAt, basis);
      if (y in byYear) byYear[y] += t.amountPaise;
    }
    const members = p.insuredMemberIds.map((id) => people.get(String(id))).filter(Boolean).map((m: any) => ({ id: String(m._id), name: m.name, relation: m.relation }));
    const personKeys = members.length ? members.map((m) => `${m.name} (${m.relation})`) : ['Not set'];
    for (const y of years) {
      totalsByYear[y] += byYear[y];
      byType[p.type] = byType[p.type] || Object.fromEntries(years.map((k) => [k, 0]));
      byType[p.type][y] += byYear[y];
      // A family floater counts once per person it covers, split evenly.
      for (const k of personKeys) {
        byPerson[k] = byPerson[k] || Object.fromEntries(years.map((x) => [x, 0]));
        byPerson[k][y] += Math.round(byYear[y] / personKeys.length);
      }
    }
    return {
      policyId: String(p._id), insurer: p.insurer, type: p.type, planName: p.planName, vehicleNumber: p.vehicleNumber,
      status: p.status, members, byYear, total: years.reduce((s, y) => s + byYear[y], 0),
      annualPremiumPaise: p.premiumPaise, premiumFrequency: p.premiumFrequency,
    };
  });
  return { basis, years, rows, totalsByYear, byType, byPerson, grandTotal: years.reduce((s, y) => s + totalsByYear[y], 0) };
}
