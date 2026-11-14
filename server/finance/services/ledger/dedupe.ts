import { ITransaction, Transaction } from '../../models';

export const DEDUPE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Finds an existing transaction that the new evidence describes.
 *
 * Same owner, amount and direction (never a declined one), and either
 *  - a shared reference id (RRN, UPI id, payment id), or
 *  - posted within 15 minutes AND the evidence comes from a different kind of
 *    source (bank alert vs merchant receipt vs statement), with matching or
 *    unknown accounts.
 * Two same-amount alerts from the same kind of source without a shared
 * reference are never merged: those are two real payments (two ₹10 chais).
 */
export async function findDuplicate(input: {
  ownerId: string;
  amountPaise: number;
  direction: 'debit' | 'credit';
  postedAt: Date;
  accountId: string | null;
  referenceIds: string[];
  sourceKind: string;
}): Promise<ITransaction | null> {
  const base = {
    ownerId: input.ownerId,
    amountPaise: input.amountPaise,
    direction: input.direction,
    status: { $nin: ['declined' as const] },
  };
  if (input.referenceIds.length) {
    const byRef = await Transaction.findOne({ ...base, referenceIds: { $in: input.referenceIds } });
    if (byRef) return byRef;
  }
  const candidates = await Transaction.find({
    ...base,
    status: { $in: ['settled' as const] },
    postedAt: { $gte: new Date(input.postedAt.getTime() - DEDUPE_WINDOW_MS), $lte: new Date(input.postedAt.getTime() + DEDUPE_WINDOW_MS) },
  }).sort({ postedAt: 1 });
  return candidates.find((c) => {
    if (c.sourceKinds.includes(input.sourceKind)) return false;
    if (input.accountId && c.accountId && String(c.accountId) !== input.accountId) return false;
    return true;
  }) || null;
}

/** Prefer the merchant name from a merchant receipt over a truncated bank descriptor. */
export function richerMerchant(current: string, incoming: string | undefined, incomingKind: string): string {
  if (!incoming) return current;
  if (!current) return incoming;
  if (incomingKind === 'merchant') return incoming;
  return current.length >= incoming.length ? current : incoming;
}
