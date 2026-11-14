import { Types } from 'mongoose';
import { User } from '../../../models/User';
import { Account, IAccount, RawEvent, Statement, Transaction } from '../../models';
import { encryptString, sha256 } from '../../lib/crypto';
import { formatPaiseINR } from '../../lib/money';
import { addDays } from '../../lib/time';
import { StatementLine, ParsedStatement } from './parse';
import { reconcileLines } from '../ledger/reconcile';
import { isCreditCardBillPayment, isSelfTransfer } from '../ledger/classify';
import { displayMerchant } from '../ledger/merchants';
import { applyCategory } from '../ingest/pipeline';
import { channelFromText } from '../ingest/parsers/util';
import { raiseAlert } from '../alerts';

/** Pulls a payee name out of a narration: "UPI/631234/SWIGGY/okaxis/Payment" -> "SWIGGY". */
export function merchantFromNarration(desc: string): string {
  const parts = desc.split(/[/|\\-]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1 && /^(upi|imps|neft|rtgs|pos|ecom|mmt|ach|nach|bil|vps|ib)/i.test(parts[0])) {
    const name = parts.slice(1).find((p) => /[a-z]{3,}/i.test(p) && !/^(upi|dr|cr|p2m|p2a|payment|pay|ref|okaxis|oksbi|okicici|okhdfcbank|ybl|paytm|ibl|axl|na)$/i.test(p) && !/@/.test(p));
    if (name) return name;
  }
  return desc.replace(/\s{2,}/g, ' ').slice(0, 80);
}

export interface ImportResult {
  statementId: string;
  status: string;
  lineCount: number;
  matchedCount: number;
  createdCount: number;
  mismatchPaise: number;
  issues: { line: number; message: string; amountPaise?: number }[];
}

/**
 * Imports parsed statement lines for one account: every line becomes a
 * RawEvent (idempotent, so re-importing changes nothing), is matched to an
 * existing transaction (amount, direction, date ±2 days, or reference) or
 * creates one (this is how UPI payments that never emailed get in), and the
 * statement is reconciled.
 */
export async function importStatement(ownerId: string, account: IAccount, parsed: ParsedStatement, opts: {
  format: 'csv' | 'pdf';
  fileDocId?: Types.ObjectId | null;
  openingBalancePaise?: number;
  closingBalancePaise?: number;
}): Promise<ImportResult> {
  const lines = [...parsed.lines].sort((a, b) => a.lineNo - b.lineNo);
  const rec = reconcileLines(lines, opts.openingBalancePaise ?? parsed.openingBalancePaise, opts.closingBalancePaise ?? parsed.closingBalancePaise);
  const periodStart = lines.reduce((m, l) => (l.date < m ? l.date : m), lines[0].date);
  const periodEnd = lines.reduce((m, l) => (l.date > m ? l.date : m), lines[0].date);

  const statement = await Statement.findOneAndUpdate(
    { ownerId, accountId: account._id, periodStart, periodEnd },
    {
      $set: {
        openingBalancePaise: rec.openingBalancePaise, closingBalancePaise: rec.closingBalancePaise, format: opts.format,
        lineCount: lines.length, mismatchPaise: rec.mismatchPaise, issues: rec.issues,
        ...(opts.fileDocId ? { fileDocId: opts.fileDocId } : {}),
      },
    },
    { upsert: true, returnDocument: 'after' },
  );

  const owner = await User.findOne({ id: ownerId });
  const accounts = await Account.find({ ownerId });
  const seen = new Map<string, number>();
  const usedTxnIds = new Set<string>();
  let matched = 0;
  let created = 0;

  for (const line of lines) {
    const direction = line.creditPaise > 0 ? 'credit' : 'debit';
    const amountPaise = line.creditPaise || line.debitPaise;
    const base = `${account._id}:${line.date.toISOString().slice(0, 10)}:${direction}:${amountPaise}:${sha256(line.description).slice(0, 12)}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const sourceId = `${base}:${n}`;

    let raw = await RawEvent.findOne({ ownerId, source: 'statement', sourceId });
    if (raw && raw.transactionIds.length) {
      usedTxnIds.add(String(raw.transactionIds[0]));
      matched += 1;
      continue;
    }
    if (!raw) {
      raw = await RawEvent.create({
        ownerId, source: 'statement', sourceId, sender: `statement:${account.institution}`,
        subject: `Statement line ${line.lineNo}`, receivedAt: line.date,
        bodyEnc: encryptString(JSON.stringify(line)), detectedType: 'transaction', parser: `statement.${opts.format}`,
        extracted: { ...line, date: line.date.toISOString(), direction, amountPaise }, confidence: 1, status: 'parsed',
      });
    }

    const txn = await matchLine(ownerId, account, line, direction, amountPaise, usedTxnIds);
    if (txn) {
      usedTxnIds.add(String(txn._id));
      await Transaction.updateOne({ _id: txn._id }, {
        $set: { reconciled: true, accountId: account._id, ...(txn.status === 'pending' ? { status: 'settled' } : {}) },
        $addToSet: { rawEventIds: raw._id, sourceKinds: 'statement', ...(line.ref ? { referenceIds: line.ref } : {}) },
      });
      raw.transactionIds = [txn._id];
      await raw.save();
      matched += 1;
      continue;
    }

    const merchantRaw = merchantFromNarration(line.description);
    const channel = channelFromText(line.description);
    let kind: 'expense' | 'income' | 'self_transfer' | 'cc_bill_payment' = direction === 'debit' ? 'expense' : 'income';
    if (isSelfTransfer({ channel, counterparty: { name: merchantRaw }, ownerName: owner?.name || '', accounts, accountId: String(account._id) })) kind = 'self_transfer';
    else if (isCreditCardBillPayment({ direction, merchant: line.description, account, accounts })) kind = 'cc_bill_payment';
    const newTxn = await Transaction.create({
      ownerId, accountId: account._id, postedAt: line.date, amountPaise, direction, currency: account.currency || 'INR',
      merchantRaw, merchant: displayMerchant(merchantRaw), description: line.description, channel,
      referenceIds: line.ref ? [line.ref] : [], kind, status: 'settled', rawEventIds: [raw._id],
      sourceKinds: ['statement'], source: 'statement', reconciled: true,
    });
    await applyCategory(ownerId, newTxn);
    usedTxnIds.add(String(newTxn._id));
    raw.transactionIds = [newTxn._id];
    await raw.save();
    created += 1;
  }

  const ok = rec.mismatchPaise === 0 && rec.issues.length === 0;
  statement!.status = ok ? 'reconciled' : 'mismatch';
  statement!.matchedCount = matched;
  statement!.createdCount = created;
  await statement!.save();

  if (!ok) {
    await raiseAlert(ownerId, {
      type: 'statement_mismatch',
      title: `${account.name}: statement doesn't add up (${formatPaiseINR(rec.mismatchPaise)})`,
      body: rec.issues.map((i) => i.message).join('\n'),
      entity: { kind: 'statement', id: String(statement!._id) },
      dedupeKey: `mismatch:${statement!._id}:${rec.mismatchPaise}`, email: true,
    });
  }

  return {
    statementId: String(statement!._id), status: statement!.status, lineCount: lines.length,
    matchedCount: matched, createdCount: created, mismatchPaise: rec.mismatchPaise, issues: rec.issues,
  };
}

async function matchLine(ownerId: string, account: IAccount, line: StatementLine, direction: 'debit' | 'credit', amountPaise: number, used: Set<string>) {
  const notUsed = (id: unknown) => !used.has(String(id));
  if (line.ref) {
    const byRef = await Transaction.find({ ownerId, referenceIds: line.ref, amountPaise, direction });
    const hit = byRef.find((t) => notUsed(t._id));
    if (hit) return hit;
  }
  const candidates = await Transaction.find({
    ownerId,
    $or: [{ accountId: account._id }, { accountId: null }],
    amountPaise, direction,
    status: { $in: ['settled' as const, 'pending' as const] },
    postedAt: { $gte: addDays(line.date, -2), $lte: addDays(line.date, 3) },
  }).sort({ postedAt: 1 });
  const free = candidates.filter((t) => notUsed(t._id));
  // Prefer one already on this account, then the closest in time.
  free.sort((a, b) => {
    const accA = a.accountId ? 0 : 1;
    const accB = b.accountId ? 0 : 1;
    if (accA !== accB) return accA - accB;
    return Math.abs(a.postedAt.getTime() - line.date.getTime()) - Math.abs(b.postedAt.getTime() - line.date.getTime());
  });
  return free[0] || null;
}
