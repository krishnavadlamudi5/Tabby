import { Types } from 'mongoose';
import { ITransaction, Transaction } from '../../models';
import { addDays } from '../../lib/time';
import { normaliseMerchant } from './merchants';

/**
 * Settles a pending expected refund (e.g. a Flipkart "refund initiated"
 * email) when the matching bank credit arrives: same amount, same card or
 * account (or the pending one had none), announced before the credit arrived.
 */
export async function findPendingRefund(ownerId: string, amountPaise: number, accountId: string | null, postedAt: Date): Promise<ITransaction | null> {
  // The refund email must come before (or at most 2 days after) the credit.
  const pending = await Transaction.find({
    ownerId, kind: 'refund' as const, status: 'pending' as const, direction: 'credit' as const, amountPaise,
    postedAt: { $lte: addDays(postedAt, 2) },
  }).sort({ expectedAt: 1, postedAt: 1 });
  return pending.find((p) => !accountId || !p.accountId || String(p.accountId) === accountId) || null;
}

/**
 * Finds the debit a credit reverses: first by shared reference id (RRN),
 * then by same merchant (or same account+card channel when the credit names
 * no merchant) with amount <= the original, within the previous 60 days.
 */
export async function findOriginalDebit(input: {
  ownerId: string;
  amountPaise: number;
  accountId: string | null;
  referenceIds: string[];
  merchant?: string;
  postedAt: Date;
}): Promise<ITransaction | null> {
  const base = { ownerId: input.ownerId, direction: 'debit' as const, status: 'settled' as const, linkedTransactionId: null };
  if (input.referenceIds.length) {
    const byRef = await Transaction.findOne({ ...base, referenceIds: { $in: input.referenceIds } });
    if (byRef) return byRef;
  }
  const windowStart = addDays(input.postedAt, -60);
  const candidates = await Transaction.find({
    ...base,
    kind: 'expense' as const,
    amountPaise: { $gte: input.amountPaise },
    postedAt: { $gte: windowStart, $lte: input.postedAt },
    ...(input.accountId ? { accountId: new Types.ObjectId(input.accountId) } : {}),
  }).sort({ postedAt: -1 });

  const wanted = input.merchant ? normaliseMerchant(input.merchant) : '';
  if (wanted) {
    const byMerchant = candidates.find((c) => {
      const m = normaliseMerchant(c.merchant || c.merchantRaw);
      return m && (m.includes(wanted) || wanted.includes(m));
    });
    if (byMerchant) return byMerchant;
  }
  // No merchant in the credit (bank reversal): only an exact amount on the
  // same account is safe enough to link automatically.
  if (input.accountId) return candidates.find((c) => c.amountPaise === input.amountPaise) || null;
  return null;
}

export async function linkPair(refund: ITransaction, original: ITransaction): Promise<void> {
  await Transaction.updateOne({ _id: refund._id }, { $set: { linkedTransactionId: original._id, kind: 'refund' } });
  await Transaction.updateOne({ _id: original._id }, { $set: { linkedTransactionId: refund._id } });
}
