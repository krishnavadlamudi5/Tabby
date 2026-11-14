import { Types } from 'mongoose';
import { istMonthRange } from '../../lib/time';

/** Kinds/statuses hidden from lists and totals unless asked for. */
export const EXCLUDED_KINDS = ['self_transfer', 'cc_bill_payment'];

export interface TxnFilter {
  month?: string;
  from?: Date;
  to?: Date;
  accountId?: string;
  categoryId?: string;
  kind?: string;
  status?: string;
  tag?: string;
  tripId?: string;
  q?: string;
  includeExcluded?: boolean;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildTxnQuery(ownerId: string, f: TxnFilter): Record<string, any> {
  const q: Record<string, any> = { ownerId };
  if (f.month) {
    const { start, end } = istMonthRange(f.month);
    q.postedAt = { $gte: start, $lt: end };
  }
  if (f.from || f.to) q.postedAt = { ...(q.postedAt || {}), ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lt: f.to } : {}) };
  if (f.accountId) q.accountId = f.accountId === 'none' ? null : new Types.ObjectId(f.accountId);
  if (f.categoryId) {
    if (f.categoryId === 'none') {
      q.categoryId = null;
      q['splits.0'] = { $exists: false };
    } else {
      const id = new Types.ObjectId(f.categoryId);
      q.$or = [{ categoryId: id }, { 'splits.categoryId': id }];
    }
  }
  if (f.kind) q.kind = f.kind;
  if (f.status) q.status = f.status;
  if (f.tag) q.tags = f.tag;
  if (f.tripId) q.tripId = f.tripId;
  if (f.q) {
    const re = new RegExp(escapeRegex(f.q.slice(0, 100)), 'i');
    const text = [{ merchant: re }, { merchantRaw: re }, { description: re }, { notes: re }, { referenceIds: re }];
    q.$and = [...(q.$and || []), { $or: text }];
  }
  if (!f.includeExcluded && !f.kind && !f.status) {
    q.kind = { $nin: EXCLUDED_KINDS };
    q.status = { $ne: 'declined' };
  }
  return q;
}

/**
 * Spend for a set of transactions: expense debits minus refunds, settled
 * only. Shared expenses count only "my share" when set.
 */
export const SPEND_EXPR = {
  $sum: {
    $cond: [
      { $eq: ['$status', 'settled'] },
      {
        $switch: {
          branches: [
            { case: { $and: [{ $eq: ['$direction', 'debit'] }, { $in: ['$kind', ['expense', 'fee', 'emi']] }] }, then: { $ifNull: ['$mySharePaise', '$amountPaise'] } },
            { case: { $eq: ['$kind', 'refund'] }, then: { $multiply: ['$amountPaise', -1] } },
          ],
          default: 0,
        },
      },
      0,
    ],
  },
};
