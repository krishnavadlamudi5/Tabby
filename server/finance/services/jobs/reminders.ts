import { Policy, RawEvent } from '../../models';
import { formatPaiseINR } from '../../lib/money';
import { addDays, daysBetween } from '../../lib/time';
import { raiseAlert } from '../alerts';

const RENEWAL_STEPS = [30, 7, 1];

/** Renewal reminders 30, 7 and 1 days before; marks policies renewal_due. */
export async function renewalReminders(now = new Date(), ownerId?: string): Promise<number> {
  const policies = await Policy.find({
    ...(ownerId ? { ownerId } : {}),
    status: { $in: ['active', 'renewal_due'] },
    renewalDate: { $gte: addDays(now, -1), $lte: addDays(now, 31) },
  });
  let raised = 0;
  for (const p of policies) {
    const days = daysBetween(now, p.renewalDate!);
    if (days <= 30 && p.status === 'active') {
      p.status = 'renewal_due';
      await p.save();
    }
    const step = RENEWAL_STEPS.filter((s) => days <= s).sort((a, b) => a - b)[0];
    if (step === undefined) continue;
    const a = await raiseAlert(p.ownerId, {
      type: 'renewal',
      title: days <= 0 ? `${p.insurer} policy renews today` : `${p.insurer} policy renews in ${days} day${days === 1 ? '' : 's'}`,
      body: `${p.planName || p.type} · premium ${formatPaiseINR(p.premiumPaise)} · renewal ${p.renewalDate!.toISOString().slice(0, 10)}`,
      dueAt: p.renewalDate, entity: { kind: 'policy', id: String(p._id) },
      dedupeKey: `renewal-${step}:${p._id}:${p.renewalDate!.toISOString().slice(0, 10)}`, email: true,
    });
    if (a) raised += 1;
  }
  return raised;
}

/** Email bodies are only needed for review; drop them after 30 days. */
export async function purgeOldBodies(now = new Date()): Promise<number> {
  const r = await RawEvent.updateMany(
    { bodyEnc: { $ne: '' }, receivedAt: { $lt: addDays(now, -30) }, status: { $ne: 'needs_review' } },
    { $set: { bodyEnc: '', bodyPurgedAt: now } },
  );
  return r.modifiedCount;
}
