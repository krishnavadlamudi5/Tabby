import { Transaction } from '../../models';
import { formatPaiseINR } from '../../lib/money';
import { istStartOfDay } from '../../lib/time';
import { raiseAlert } from '../alerts';

/** Flags expected refunds whose promised date has passed without a credit. */
export async function refundWatch(now = new Date(), ownerId?: string): Promise<number> {
  const overdue = await Transaction.find({
    ...(ownerId ? { ownerId } : {}),
    kind: 'refund', status: 'pending', expectedAt: { $lt: istStartOfDay(now) },
  });
  for (const t of overdue) {
    await raiseAlert(t.ownerId, {
      type: 'refund_overdue',
      title: `Refund overdue: ${formatPaiseINR(t.amountPaise)} from ${t.merchant || 'merchant'}`,
      body: `Expected by ${t.expectedAt!.toISOString().slice(0, 10)}. Contact the merchant or your bank if it doesn't arrive.`,
      entity: { kind: 'transaction', id: String(t._id) },
      dedupeKey: `refund-overdue:${t._id}`,
      email: true,
    });
  }
  return overdue.length;
}
