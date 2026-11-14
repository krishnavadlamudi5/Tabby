import { Types } from 'mongoose';
import { IAccount, Statement, Transaction } from '../../models';

export interface AccountBalance {
  balancePaise: number;
  balanceAsOf: Date | null;
  lastStatementStatus: string | null;
  lastStatementEnd: Date | null;
  unreconciledCount: number;
}

/**
 * Balance per account = latest statement closing balance (or the opening
 * balance) plus every settled transaction posted after it. Credit cards and
 * loans read as amounts owed (negative).
 */
export async function accountBalances(ownerId: string, accounts: IAccount[]): Promise<Map<string, AccountBalance>> {
  const out = new Map<string, AccountBalance>();
  for (const acc of accounts) {
    const last = await Statement.findOne({ ownerId, accountId: acc._id }).sort({ periodEnd: -1 });
    const base = last ? last.closingBalancePaise : acc.openingBalancePaise;
    const since = last ? last.periodEnd : acc.openingBalanceDate || new Date(0);
    const agg = await Transaction.aggregate([
      { $match: { ownerId, accountId: new Types.ObjectId(String(acc._id)), status: 'settled', postedAt: { $gt: since } } },
      { $group: { _id: '$direction', total: { $sum: '$amountPaise' }, latest: { $max: '$postedAt' } } },
    ]);
    const credits = agg.find((a) => a._id === 'credit')?.total || 0;
    const debits = agg.find((a) => a._id === 'debit')?.total || 0;
    const latest = agg.reduce<Date | null>((m, a) => (!m || a.latest > m ? a.latest : m), null);
    const unreconciledCount = await Transaction.countDocuments({ ownerId, accountId: acc._id, status: 'settled', reconciled: false });
    out.set(String(acc._id), {
      balancePaise: base + credits - debits,
      balanceAsOf: latest || (last ? last.periodEnd : null),
      lastStatementStatus: last ? last.status : null,
      lastStatementEnd: last ? last.periodEnd : null,
      unreconciledCount,
    });
  }
  return out;
}
