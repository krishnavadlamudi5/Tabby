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
export async function linkPremiums(ownerId: string, policy: IPolicy): Promise<Types.ObjectId[]> {
  if (!policy.premiumPaise) return [];
  const words = insurerWords(policy.insurer);
  if (!words.length) return [];
  const tol = Math.max(100, Math.round(policy.premiumPaise * 0.01));
  const candidates = await Transaction.find({
    ownerId, direction: 'debit', status: 'settled',
    amountPaise: { $gte: policy.premiumPaise - tol, $lte: policy.premiumPaise + tol },
  });
  const hits = candidates.filter((t) => {
    const m = `${normaliseMerchant(t.merchant)} ${normaliseMerchant(t.merchantRaw)} ${normaliseMerchant(t.description)}`;
    return words.some((w) => m.includes(w));
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
