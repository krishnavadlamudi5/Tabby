import { Router } from 'express';
import { Types } from 'mongoose';
import { Category, RawEvent, Rule, SenderProfile, Statement, Transaction, Account } from '../models';
import { handler, isObjectId, scoped, validate } from '../lib/http';
import { reviewConfirm } from '../validation/schemas';
import { decryptString } from '../lib/crypto';
import { maskNumbers } from '../services/ingest/text';
import { learnFromCorrection } from '../services/ledger/categorize';
import { applyCategory } from '../services/ingest/pipeline';
import { displayMerchant, normaliseMerchant } from '../services/ledger/merchants';
import { z } from 'zod';

const router = Router();
const notFound = (res: any) => res.status(404).json({ error: 'Review item not found' });

const REASON_TEXT: Record<string, string> = {
  unknown_account: 'Mentions an account or card you have not added yet',
  no_account: 'Could not tell which account this was paid from',
  no_parser: 'Unknown email format - fill in the details once',
  policy_suggestion: 'Looks like an insurance policy or renewal notice',
  statement_email: 'Statement email - upload the statement file',
  statement_password_needed: 'Statement PDF needs the account statement password',
  unsupported_event: 'Not sure what this is',
  order_waiting_for_payment: 'Order received; waiting for its payment',
};

function bodyPreview(enc: string): string {
  if (!enc) return '';
  try {
    return maskNumbers(decryptString(enc)).slice(0, 2000);
  } catch {
    return '';
  }
}

// GET /api/finance/review
router.get('/', handler(async (req, res) => {
  const owner = scoped(req);
  const [events, uncategorised, statements] = await Promise.all([
    RawEvent.find({ ...owner, status: 'needs_review' }).sort({ receivedAt: -1 }).limit(200),
    Transaction.find({ ...owner, kind: 'expense', status: 'settled', categoryId: null, 'splits.0': { $exists: false } }).sort({ postedAt: -1 }).limit(200),
    Statement.find({ ...owner, status: 'mismatch' }).sort({ periodEnd: -1 }),
  ]);
  const txnIds = events.flatMap((e) => e.transactionIds);
  const linkedTxns = await Transaction.find({ _id: { $in: txnIds }, ...owner });
  const byId = new Map(linkedTxns.map((t) => [String(t._id), t]));
  res.json({
    success: true,
    counts: { events: events.length, uncategorised: uncategorised.length, statements: statements.length },
    events: events.map((e) => ({
      id: String(e._id), source: e.source, sender: e.sender, subject: e.subject, receivedAt: e.receivedAt,
      detectedType: e.detectedType, reason: e.reviewReason, reasonText: REASON_TEXT[e.reviewReason || ''] || 'Please check',
      extracted: e.extracted, bodyPreview: bodyPreview(e.bodyEnc),
      transactions: e.transactionIds.map((id) => byId.get(String(id))).filter(Boolean),
    })),
    uncategorised,
    statements,
  });
}));

// POST /review/:id/confirm - accept (optionally with corrections)
router.post('/:id/confirm', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res);
  const body = validate(reviewConfirm, req.body, res);
  if (!body) return;
  const raw = await RawEvent.findOne({ _id: req.params.id, ...scoped(req) });
  if (!raw) return notFound(res);
  if (body.accountId && !(await Account.exists({ _id: body.accountId, ...scoped(req) }))) { res.status(400).json({ error: 'Account not found' }); return; }
  if (body.categoryId && !(await Category.exists({ _id: body.categoryId, ...scoped(req) }))) { res.status(400).json({ error: 'Category not found' }); return; }

  const ext: any = raw.extracted || {};
  let corrected = false;
  const txnIds: Types.ObjectId[] = [...raw.transactionIds];

  if (txnIds.length) {
    const set: Record<string, any> = {};
    for (const k of ['accountId', 'kind', 'merchant', 'postedAt', 'channel'] as const) {
      if (body[k] !== undefined) { set[k] = body[k]; corrected = true; }
    }
    if (body.categoryId !== undefined) { set.categoryId = body.categoryId; set.categorySource = 'user'; corrected = true; }
    if (Object.keys(set).length) await Transaction.updateMany({ _id: { $in: txnIds }, ...scoped(req) }, { $set: set });
    if (body.categoryId) {
      const t = await Transaction.findOne({ _id: txnIds[0], ...scoped(req) });
      if (t) await learnFromCorrection(req.userId!, t, body.categoryId);
    }
  } else {
    const amountPaise = body.amountPaise ?? ext.amountPaise;
    const direction = body.direction ?? ext.direction;
    if (!amountPaise || !direction) {
      res.status(400).json({ error: 'Enter the amount and whether money went out or came in' }); return;
    }
    corrected = body.amountPaise !== undefined || body.direction !== undefined || body.merchant !== undefined;
    const merchantRaw = body.merchant ?? ext.merchant ?? '';
    const txn = await Transaction.create({
      ...scoped(req), accountId: body.accountId ?? null, postedAt: body.postedAt ?? (ext.occurredAt ? new Date(ext.occurredAt) : raw.receivedAt),
      amountPaise, direction, currency: ext.currency || 'INR', merchantRaw, merchant: displayMerchant(merchantRaw) || merchantRaw,
      channel: body.channel ?? ext.channel ?? 'other', referenceIds: ext.referenceIds || [], kind: body.kind ?? (direction === 'debit' ? 'expense' : 'income'),
      status: 'settled', rawEventIds: [raw._id], sourceKinds: [ext.sourceKind || 'manual'], source: raw.source,
      categoryId: body.categoryId ?? null, categorySource: body.categoryId ? 'user' : '',
    });
    if (body.categoryId === undefined) await applyCategory(req.userId!, txn, raw.sender);
    else if (body.categoryId) await learnFromCorrection(req.userId!, txn, body.categoryId);
    txnIds.push(txn._id);
  }

  raw.status = 'parsed';
  raw.reviewReason = '';
  raw.transactionIds = txnIds;
  await raw.save();
  await SenderProfile.updateOne(
    { ...scoped(req), sender: raw.sender },
    { $addToSet: { confirmedExamples: raw._id }, $inc: corrected ? { 'stats.corrected': 1 } : { 'stats.autoAccepted': 1 } },
    { upsert: true },
  );
  res.json({ success: true, transactions: await Transaction.find({ _id: { $in: txnIds } }) });
}));

router.post('/:id/ignore', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res);
  const raw = await RawEvent.findOneAndUpdate({ _id: req.params.id, ...scoped(req) }, { $set: { status: 'ignored', reviewReason: 'ignored_by_user' } });
  if (!raw) return notFound(res);
  res.json({ success: true });
}));

// Always ignore this sender from now on (and clear what's queued from it).
router.post('/:id/ignore-sender', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res);
  const raw = await RawEvent.findOne({ _id: req.params.id, ...scoped(req) });
  if (!raw) return notFound(res);
  await SenderProfile.updateOne({ ...scoped(req), sender: raw.sender }, { $set: { ignored: true } }, { upsert: true });
  const r = await RawEvent.updateMany({ ...scoped(req), sender: raw.sender, status: 'needs_review' }, { $set: { status: 'ignored', reviewReason: 'sender_ignored' } });
  res.json({ success: true, ignored: r.modifiedCount });
}));

// Create a categorisation rule from this item's merchant.
const ruleFromItem = z.object({ categoryId: z.string().regex(/^[a-f0-9]{24}$/i), merchantContains: z.string().trim().max(100).optional() });
router.post('/:id/rule', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res);
  const body = validate(ruleFromItem, req.body, res);
  if (!body) return;
  const raw = await RawEvent.findOne({ _id: req.params.id, ...scoped(req) });
  const txn = raw ? null : await Transaction.findOne({ _id: req.params.id, ...scoped(req) });
  if (!raw && !txn) return notFound(res);
  const merchant = body.merchantContains || normaliseMerchant(txn?.merchant || (raw?.extracted as any)?.merchant || '').split(' ').slice(0, 3).join(' ');
  if (!merchant) { res.status(400).json({ error: 'No merchant to match on; type one' }); return; }
  const rule = await Rule.create({
    ...scoped(req), createdFrom: 'user_correction', priority: 10,
    match: { merchantContains: merchant.toLowerCase() }, action: { categoryId: body.categoryId },
  });
  // Apply it to uncategorised transactions from the same merchant.
  const re = new RegExp(merchant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  await Transaction.updateMany(
    { ...scoped(req), categoryId: null, categorySource: { $ne: 'user' }, $or: [{ merchant: re }, { merchantRaw: re }] },
    { $set: { categoryId: body.categoryId, categorySource: 'rule' } },
  );
  res.status(201).json({ success: true, rule });
}));

export default router;
