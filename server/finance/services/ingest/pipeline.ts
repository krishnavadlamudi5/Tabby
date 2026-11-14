import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../../models/User';
import {
  Account, Commitment, IRawEvent, ITransaction, RawEvent, SenderProfile, SplitTemplate, Transaction,
} from '../../models';
import { encryptString } from '../../lib/crypto';
import { formatPaiseINR } from '../../lib/money';
import { addDays, istParts } from '../../lib/time';
import { detectType, hasMoneyAmount } from './detect';
import { findParser } from './parsers';
import { normaliseBody } from './text';
import { Extraction } from './types';
import { resolveAccount } from '../ledger/accounts';
import { findDuplicate, richerMerchant } from '../ledger/dedupe';
import { findOriginalDebit, findPendingRefund, linkPair } from '../ledger/linkRefunds';
import { isCreditCardBillPayment, isSelfTransfer } from '../ledger/classify';
import { categorize } from '../ledger/categorize';
import { displayMerchant, normaliseMerchant } from '../ledger/merchants';
import { autoSplitLineItems, partsFromPercents } from '../ledger/splits';
import { categoryIdsByKey } from '../categories';
import { raiseAlert } from '../alerts';

type RawDoc = HydratedDocument<IRawEvent>;

export interface IngestInput {
  ownerId: string;
  source: 'gmail' | 'manual' | 'receipt';
  sourceId: string;
  sender: string;
  subject: string;
  receivedAt: Date;
  bodyText: string;
  attachmentsMeta?: { filename: string; mimeType: string; size: number; documentId?: string }[];
}

export interface IngestResult {
  duplicate: boolean;
  rawEventId: string;
  status: string;
  detectedType: string;
  reviewReason?: string;
  transactionIds: string[];
}

export function largeDebitThresholdPaise(): number {
  return Number(process.env.FINANCE_LARGE_DEBIT_PAISE) || 25_000_00;
}

function senderAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

/**
 * Runs one email (or pasted text) through detection, parsing and the ledger.
 * Idempotent: the same (owner, source, sourceId) is only ever processed once.
 */
export async function ingestEmail(input: IngestInput): Promise<IngestResult> {
  const sender = senderAddress(input.sender);
  const existing = await RawEvent.findOne({ ownerId: input.ownerId, source: input.source, sourceId: input.sourceId });
  if (existing) return resultOf(existing, true);

  const text = normaliseBody(input.bodyText || '');
  const detected = detectType(sender, input.subject, text);

  let raw: RawDoc;
  try {
    raw = await RawEvent.create({
      ownerId: input.ownerId,
      source: input.source,
      sourceId: input.sourceId,
      sender,
      subject: input.subject.slice(0, 500),
      receivedAt: input.receivedAt,
      // OTP emails are dropped at detection: their body is never stored.
      bodyEnc: detected === 'otp' || !text ? '' : encryptString(text),
      attachmentsMeta: input.attachmentsMeta || [],
      detectedType: detected,
      status: 'needs_review',
    });
  } catch (err: any) {
    if (err?.code === 11000) {
      const dup = await RawEvent.findOne({ ownerId: input.ownerId, source: input.source, sourceId: input.sourceId });
      if (dup) return resultOf(dup, true);
    }
    throw err;
  }

  const profile = await SenderProfile.findOneAndUpdate(
    { ownerId: input.ownerId, sender },
    { $inc: { 'stats.seen': 1 }, $setOnInsert: { displayName: sender.split('@')[1] || sender } },
    { upsert: true, returnDocument: 'after' },
  );

  if (detected === 'otp' || detected === 'marketing') return finish(raw, 'ignored', detected);
  if (profile?.ignored) return finish(raw, 'ignored', 'sender_ignored');

  const parser = findParser(sender, input.subject);
  const ext = parser?.parse({ sender, subject: input.subject, text, receivedAt: input.receivedAt }) || null;
  raw.parser = parser && ext ? parser.name : '';
  raw.parserVersion = parser?.version || 1;
  raw.confidence = ext ? ext.confidence : 0;
  raw.extracted = ext ? serialise(ext) : null;
  if (ext) raw.detectedType = ext.eventType;
  if (parser && ext && profile && !profile.parser) {
    await SenderProfile.updateOne({ _id: profile._id }, { $set: { parser: parser.name } });
  }

  await raw.save();

  if (!ext) {
    // No known format. Without AI, anything that looks like money goes to
    // the review queue for the owner to fill in once.
    if (detected === 'policy') return finish(raw, 'needs_review', 'policy_suggestion');
    if (detected === 'statement') return finish(raw, 'needs_review', 'statement_email');
    if (hasMoneyAmount(text) && detected !== 'unknown') return finish(raw, 'needs_review', 'no_parser');
    if (hasMoneyAmount(text)) return finish(raw, 'needs_review', 'no_parser');
    return finish(raw, 'ignored', 'no_money');
  }

  switch (ext.eventType) {
    case 'info':
    case 'marketing':
    case 'otp':
      return finish(raw, 'ignored', ext.eventType);
    case 'transaction':
    case 'declined':
    case 'refund_credit': {
      const r = await applyMoneyEvent(input.ownerId, raw, ext, sender);
      raw.transactionIds = r.txnIds.map((id) => new Types.ObjectId(id));
      return finish(raw, r.status, r.reason);
    }
    case 'expected_refund': {
      const txn = await createExpectedRefund(input.ownerId, raw, ext);
      raw.transactionIds = [txn._id];
      return finish(raw, 'parsed');
    }
    case 'order': {
      const txnId = await attachOrderToPayment(input.ownerId, raw, ext);
      if (txnId) raw.transactionIds = [new Types.ObjectId(txnId)];
      return finish(raw, 'parsed', txnId ? undefined : 'order_waiting_for_payment');
    }
    case 'emi_due':
    case 'sip_report':
    case 'subscription':
      await upsertCommitmentFromEmail(input.ownerId, raw, ext);
      return finish(raw, 'parsed');
    default:
      return finish(raw, 'needs_review', 'unsupported_event');
  }
}

async function finish(raw: RawDoc, status: IRawEvent['status'], reason?: string): Promise<IngestResult> {
  raw.status = status;
  raw.reviewReason = status === 'needs_review' ? reason || 'check' : reason || '';
  await raw.save();
  return resultOf(raw, false);
}

function resultOf(raw: IRawEvent, duplicate: boolean): IngestResult {
  return {
    duplicate,
    rawEventId: String(raw._id),
    status: raw.status,
    detectedType: raw.detectedType,
    reviewReason: raw.reviewReason || undefined,
    transactionIds: raw.transactionIds.map(String),
  };
}

/** Dates as ISO strings so the extraction can be stored as plain JSON. */
function serialise(ext: Extraction): Record<string, any> {
  return JSON.parse(JSON.stringify(ext));
}

// ---------------------------------------------------------------- money events

async function applyMoneyEvent(ownerId: string, raw: IRawEvent, ext: Extraction, sender: string): Promise<{ txnIds: string[]; status: IRawEvent['status']; reason?: string }> {
  const { account, unknown, hint } = await resolveAccount(ownerId, ext);
  const accountId = account ? String(account._id) : null;
  const postedAt = ext.occurredAt || raw.receivedAt;
  const amountPaise = ext.amountPaise!;
  const direction = ext.direction || 'debit';

  const reviewFor = (txnAccount: unknown): { status: IRawEvent['status']; reason?: string } => {
    if (unknown) return { status: 'needs_review', reason: 'unknown_account' };
    if (!txnAccount) return { status: 'needs_review', reason: 'no_account' };
    return { status: 'parsed' };
  };

  if (unknown && hint) {
    await raiseAlert(ownerId, {
      type: 'unknown_account', title: `New account or card ending ${hint}`,
      body: `An email from ${sender} mentions ••${hint}, which isn't one of your accounts. Add it so future alerts land in the right place.`,
      dedupeKey: `unknown-account:${hint}`, entity: { kind: 'raw_event', id: String(raw._id) },
    });
  }

  // Declined attempts are kept for the record but never counted.
  if (ext.eventType === 'declined') {
    const txn = await Transaction.create({
      ownerId, accountId, postedAt, amountPaise, direction, currency: ext.currency || 'INR',
      merchantRaw: ext.merchant || '', merchant: displayMerchant(ext.merchant), channel: ext.channel || 'card',
      referenceIds: ext.referenceIds, kind: 'expense', status: 'declined', rawEventIds: [raw._id],
      sourceKinds: [ext.sourceKind], source: raw.source, description: ext.notes || 'Declined',
    });
    await raiseAlert(ownerId, {
      type: 'declined', title: `Declined: ${formatPaiseINR(amountPaise)} at ${txn.merchant || 'a merchant'}`,
      body: ext.notes ? `Reason: ${ext.notes}` : '', entity: { kind: 'transaction', id: String(txn._id) },
      dedupeKey: `declined:${raw._id}`, email: true,
    });
    return { txnIds: [String(txn._id)], ...reviewFor(accountId || 'declined') };
  }

  // Same payment already known from another source? Merge the evidence.
  const dup = await findDuplicate({ ownerId, amountPaise, direction, postedAt, accountId, referenceIds: ext.referenceIds, sourceKind: ext.sourceKind });
  if (dup) {
    const merchantRaw = dup.merchantRaw || ext.merchant || '';
    const merchant = richerMerchant(dup.merchant, displayMerchant(ext.merchant), ext.sourceKind);
    const update: Record<string, any> = {
      $addToSet: { rawEventIds: raw._id, referenceIds: { $each: ext.referenceIds }, sourceKinds: ext.sourceKind },
      $set: { merchant, merchantRaw },
    };
    if (!dup.accountId && accountId) update.$set.accountId = new Types.ObjectId(accountId);
    if (dup.channel === 'other' && ext.channel) update.$set.channel = ext.channel;
    await Transaction.updateOne({ _id: dup._id }, update);
    if (!['user', 'rule', 'split'].includes(dup.categorySource) && merchant !== dup.merchant) {
      const c = await categorize(ownerId, { merchant, merchantRaw, sender, channel: dup.channel, amountPaise, kind: dup.kind, direction });
      if (c.categoryId) await Transaction.updateOne({ _id: dup._id }, { $set: { categoryId: c.categoryId, categorySource: c.source } });
    }
    // Merging evidence can resolve earlier review items for this payment.
    if (dup.accountId || accountId) {
      await RawEvent.updateMany(
        { _id: { $in: dup.rawEventIds }, status: 'needs_review', reviewReason: 'no_account' },
        { $set: { status: 'parsed', reviewReason: '' } },
      );
    }
    return { txnIds: [String(dup._id)], ...reviewFor(dup.accountId || accountId) };
  }

  const owner = await User.findOne({ id: ownerId });
  const accounts = await Account.find({ ownerId });
  const base = {
    ownerId, accountId, postedAt, amountPaise, direction, currency: ext.currency || 'INR',
    merchantRaw: ext.merchant || '', merchant: displayMerchant(ext.merchant), channel: ext.channel || 'other',
    referenceIds: ext.referenceIds, status: 'settled' as const, rawEventIds: [raw._id], sourceKinds: [ext.sourceKind],
    source: raw.source, counterpartyName: ext.counterparty?.name || '', counterpartyAccount: ext.counterparty?.account || '',
    counterpartyIfsc: ext.counterparty?.ifsc || '',
  };

  let txn: ITransaction;
  if (direction === 'credit') {
    const isRefundLike = ext.eventType === 'refund_credit' || /refund|reversal|reversed/i.test(`${ext.merchant || ''} ${ext.notes || ''}`);
    const pending = isRefundLike ? await findPendingRefund(ownerId, amountPaise, accountId, postedAt) : null;
    if (pending) {
      await Transaction.updateOne({ _id: pending._id }, {
        $set: { status: 'settled', postedAt, ...(accountId && !pending.accountId ? { accountId: new Types.ObjectId(accountId) } : {}) },
        $addToSet: { rawEventIds: raw._id, referenceIds: { $each: ext.referenceIds }, sourceKinds: ext.sourceKind },
      });
      return { txnIds: [String(pending._id)], ...reviewFor(pending.accountId || accountId) };
    }
    let kind: ITransaction['kind'] = 'income';
    if (isRefundLike) kind = 'refund';
    else if (isSelfTransfer({ channel: ext.channel, counterparty: ext.counterparty, ownerName: owner?.name || '', accounts, accountId })) kind = 'self_transfer';
    else if (isCreditCardBillPayment({ direction, merchant: ext.merchant, account, accounts })) kind = 'cc_bill_payment';
    txn = await Transaction.create({ ...base, kind });
    if (kind === 'refund') {
      const original = await findOriginalDebit({ ownerId, amountPaise, accountId, referenceIds: ext.referenceIds, merchant: ext.merchant, postedAt });
      if (original) await linkPair(txn, original);
    }
  } else {
    let kind: ITransaction['kind'] = 'expense';
    if (isSelfTransfer({ channel: ext.channel, counterparty: ext.counterparty, ownerName: owner?.name || '', accounts, accountId })) kind = 'self_transfer';
    else if (isCreditCardBillPayment({ direction, merchant: ext.merchant, counterpartyAccount: ext.counterparty?.account, account, accounts })) kind = 'cc_bill_payment';
    txn = await Transaction.create({ ...base, kind });
    if (kind === 'expense' && amountPaise >= largeDebitThresholdPaise()) {
      await raiseAlert(ownerId, {
        type: 'large_debit', title: `Large payment: ${formatPaiseINR(amountPaise)}${txn.merchant ? ` to ${txn.merchant}` : ''}`,
        entity: { kind: 'transaction', id: String(txn._id) }, dedupeKey: `large-debit:${txn._id}`, email: true,
      });
    }
  }

  await applyCategory(ownerId, txn, sender);
  if (txn.kind === 'expense' && txn.direction === 'debit') await attachPendingOrders(ownerId, txn);
  return { txnIds: [String(txn._id)], ...reviewFor(accountId) };
}

/** Runs categorisation on a new transaction and applies a rule's split template. */
export async function applyCategory(ownerId: string, txn: ITransaction, sender?: string): Promise<void> {
  const c = await categorize(ownerId, {
    merchant: txn.merchant, merchantRaw: txn.merchantRaw, sender, channel: txn.channel,
    amountPaise: txn.amountPaise, kind: txn.kind, direction: txn.direction,
  });
  const set: Record<string, any> = { categoryId: c.categoryId, categorySource: c.source };
  if (c.kind && c.source === 'rule') set.kind = c.kind;
  if (c.tags?.length) set.tags = Array.from(new Set([...txn.tags, ...c.tags]));
  if (c.splitTemplateId) {
    const tpl = await SplitTemplate.findOne({ _id: c.splitTemplateId, ownerId });
    if (tpl) {
      set.splits = partsFromPercents(txn.amountPaise, tpl.parts.map((p) => ({ categoryId: String(p.categoryId), percent: p.percent })));
      set.categorySource = 'split';
    }
  }
  await Transaction.updateOne({ _id: txn._id }, { $set: set });
  Object.assign(txn, set);
}

// ---------------------------------------------------------------- expected refunds

async function createExpectedRefund(ownerId: string, raw: IRawEvent, ext: Extraction): Promise<ITransaction> {
  const { account } = await resolveAccount(ownerId, ext);
  const existing = ext.referenceIds.length
    ? await Transaction.findOne({ ownerId, kind: 'refund', referenceIds: { $in: ext.referenceIds }, amountPaise: ext.amountPaise })
    : null;
  if (existing) {
    await Transaction.updateOne({ _id: existing._id }, { $addToSet: { rawEventIds: raw._id } });
    return existing;
  }
  const keys = await categoryIdsByKey(ownerId);
  return Transaction.create({
    ownerId, accountId: account?._id || null, postedAt: ext.occurredAt || raw.receivedAt, expectedAt: ext.expectedAt,
    amountPaise: ext.amountPaise, direction: 'credit', currency: ext.currency || 'INR', merchantRaw: ext.merchant || '',
    merchant: displayMerchant(ext.merchant), channel: ext.channel || 'other', referenceIds: ext.referenceIds, kind: 'refund',
    status: 'pending', rawEventIds: [raw._id], sourceKinds: ['merchant'], source: raw.source,
    categoryId: keys.get('refund') || null, categorySource: 'dictionary',
    description: ext.institution ? `Refund to ${ext.institution.toUpperCase()}${ext.cardHint ? ` card ••${ext.cardHint}` : ''}` : 'Expected refund',
  });
}

// ---------------------------------------------------------------- orders -> auto split

function merchantsMatch(a: string, b: string): boolean {
  const x = normaliseMerchant(a);
  const y = normaliseMerchant(b);
  if (!x || !y) return true; // a bank alert without a merchant can still match by amount/time
  return x.includes(y) || y.includes(x);
}

async function applyOrderSplit(ownerId: string, txn: ITransaction, raw: IRawEvent, ext: Extraction): Promise<void> {
  if (txn.categorySource === 'user' || txn.splits.length) return;
  const keys = await categoryIdsByKey(ownerId);
  const parts = ext.lineItems?.length ? autoSplitLineItems(txn.amountPaise, ext.lineItems, keys) : [];
  const set: Record<string, any> = { categoryId: keys.get('groceries') || txn.categoryId };
  if (parts.length) {
    set.splits = parts;
    set.categorySource = 'split';
  }
  await Transaction.updateOne({ _id: txn._id }, { $set: set, $addToSet: { rawEventIds: raw._id, sourceKinds: 'merchant' } });
  await RawEvent.updateOne({ _id: raw._id }, { $set: { 'extracted.attachedTransactionId': String(txn._id), status: 'parsed', reviewReason: '' }, $addToSet: { transactionIds: txn._id } });
}

/** Order email arrived: find its payment (amount ±₹1, within 2 days, same merchant). */
async function attachOrderToPayment(ownerId: string, raw: IRawEvent, ext: Extraction): Promise<string | null> {
  const when = ext.occurredAt || raw.receivedAt;
  const candidates = await Transaction.find({
    ownerId, direction: 'debit', kind: 'expense', status: 'settled',
    amountPaise: { $gte: ext.amountPaise! - 100, $lte: ext.amountPaise! + 100 },
    postedAt: { $gte: addDays(when, -2), $lte: addDays(when, 2) },
  });
  const txn = candidates.find((c) => merchantsMatch(c.merchant || c.merchantRaw, ext.merchant || ''));
  if (!txn) return null;
  await applyOrderSplit(ownerId, txn, raw, ext);
  return String(txn._id);
}

/** Payment arrived: attach any order email received in the 2 days around it. */
async function attachPendingOrders(ownerId: string, txn: ITransaction): Promise<void> {
  const orders = await RawEvent.find({
    ownerId, detectedType: 'order', 'extracted.attachedTransactionId': { $exists: false },
    receivedAt: { $gte: addDays(txn.postedAt, -2), $lte: addDays(txn.postedAt, 2) },
  });
  for (const raw of orders) {
    const ext = raw.extracted as Extraction;
    if (!ext?.amountPaise || Math.abs(ext.amountPaise - txn.amountPaise) > 100) continue;
    if (!merchantsMatch(txn.merchant || txn.merchantRaw, ext.merchant || '')) continue;
    await applyOrderSplit(ownerId, txn, raw, ext);
    return;
  }
}

// ---------------------------------------------------------------- commitments

async function upsertCommitmentFromEmail(ownerId: string, raw: IRawEvent, ext: Extraction): Promise<void> {
  const c = ext.commitment;
  if (!c) return;
  const due = ext.dueDate || raw.receivedAt;
  const status = c.status as any;
  const set: Record<string, any> = {
    status, statusNote: c.note || '', currency: ext.currency || 'INR', source: 'email',
    'schedule.nextDueDate': due,
  };
  if (ext.amountPaise) set.amountPaise = ext.amountPaise;
  const commitment = await Commitment.findOneAndUpdate(
    { ownerId, externalKey: c.externalKey },
    {
      $set: set,
      $setOnInsert: {
        ownerId, externalKey: c.externalKey, name: c.name, type: c.type,
        'schedule.freq': 'monthly', 'schedule.dayOfMonth': istParts(due).day,
        matchRule: { merchantContains: c.type === 'sip' ? '' : normaliseMerchant(ext.merchant).split(' ')[0] || '', tolerancePct: 5 },
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  if (!commitment) return;
  const amount = formatPaiseINR(ext.amountPaise || 0, ext.currency || 'INR');
  if (c.status === 'failed') {
    await raiseAlert(ownerId, {
      type: 'commitment_failed', title: `${c.type.toUpperCase()} failed: ${c.name}`, body: `${amount}. ${c.note || ''}`.trim(),
      entity: { kind: 'commitment', id: String(commitment._id) }, dedupeKey: `failed:${raw._id}`, email: true,
    });
  } else if (c.status === 'action_needed') {
    await raiseAlert(ownerId, {
      type: 'action_needed', title: `Action needed: ${c.name} (${amount})`, body: c.note || '',
      entity: { kind: 'commitment', id: String(commitment._id) }, dedupeKey: `action:${raw._id}`, email: true,
    });
  } else if (ext.eventType === 'emi_due') {
    await raiseAlert(ownerId, {
      type: 'due', title: `EMI due: ${c.name}`, body: `${amount} due`, dueAt: due,
      entity: { kind: 'commitment', id: String(commitment._id) }, dedupeKey: `due:${c.externalKey}:${due.toISOString().slice(0, 10)}`,
    });
  }
}
