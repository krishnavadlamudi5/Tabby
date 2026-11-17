import { Router } from 'express';
import { Types } from 'mongoose';
import { Category, FinDocument, RawEvent, SplitTemplate, Transaction } from '../models';
import { Expense } from '../../models/Expense';
import { Activity } from '../../models/Activity';
import { Group } from '../../models/Group';
import { handler, isObjectId, pageLimit, scoped, validate } from '../lib/http';
import { linkBody, shareBody, splitsBody, transactionCreate, transactionUpdate } from '../validation/schemas';
import { buildTxnQuery, SPEND_EXPR } from '../services/ledger/query';
import { learnFromCorrection } from '../services/ledger/categorize';
import { applyCategory } from '../services/ingest/pipeline';
import { assertSplitsTotal, autoSplitLineItems, partsFromPercents } from '../services/ledger/splits';
import { categoryIdsByKey } from '../services/categories';
import { displayMerchant } from '../services/ledger/merchants';
import { parseDay } from '../services/spending';
import { addDays } from '../lib/time';
import { findVisibleUsers } from '../../services/userVisibility';

const router = Router();
const notFound = (res: any) => res.status(404).json({ error: 'Transaction not found' });

function encodeCursor(t: { postedAt: Date; _id: unknown }): string {
  return Buffer.from(`${t.postedAt.toISOString()}|${t._id}`).toString('base64url');
}

function decodeCursor(c: string): { postedAt: Date; id: Types.ObjectId } | null {
  try {
    const [d, id] = Buffer.from(c, 'base64url').toString().split('|');
    return isObjectId(id) ? { postedAt: new Date(d), id: new Types.ObjectId(id) } : null;
  } catch {
    return null;
  }
}

// GET /api/finance/transactions?month=&accountId=&categoryId=&kind=&status=&tag=&tripId=&q=&includeExcluded=&cursor=&limit=
router.get('/', handler(async (req, res) => {
  const qp = req.query as Record<string, string>;
  for (const key of ['accountId', 'categoryId']) {
    if (qp[key] && qp[key] !== 'none' && !isObjectId(qp[key])) { res.status(400).json({ error: `Invalid ${key}` }); return; }
  }
  if (qp.month && !/^\d{4}-\d{2}$/.test(qp.month)) { res.status(400).json({ error: 'month must be YYYY-MM' }); return; }
  for (const key of ['from', 'to']) {
    if (qp[key] && !/^\d{4}-\d{2}-\d{2}$/.test(qp[key])) { res.status(400).json({ error: `${key} must be YYYY-MM-DD` }); return; }
  }
  // from/to are India dates, both inclusive.
  const filter = buildTxnQuery(req.userId!, {
    ...qp,
    from: qp.from ? parseDay(qp.from) : undefined,
    to: qp.to ? addDays(parseDay(qp.to), 1) : undefined,
    includeExcluded: qp.includeExcluded === 'true',
  });
  const limit = pageLimit(qp.limit);
  const page: Record<string, any> = { ...filter };
  const cursor = qp.cursor ? decodeCursor(qp.cursor) : null;
  if (cursor) {
    page.$and = [...(filter.$and || []), {
      $or: [{ postedAt: { $lt: cursor.postedAt } }, { postedAt: cursor.postedAt, _id: { $lt: cursor.id } }],
    }];
  }
  const rows = await Transaction.find(page).sort({ postedAt: -1, _id: -1 }).limit(limit + 1);
  const hasMore = rows.length > limit;
  const transactions = rows.slice(0, limit);

  const [agg] = await Transaction.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        debitPaise: { $sum: { $cond: [{ $and: [{ $eq: ['$direction', 'debit'] }, { $eq: ['$status', 'settled'] }] }, '$amountPaise', 0] } },
        creditPaise: { $sum: { $cond: [{ $and: [{ $eq: ['$direction', 'credit'] }, { $eq: ['$status', 'settled'] }] }, '$amountPaise', 0] } },
        spendPaise: SPEND_EXPR,
      },
    },
  ]);
  res.json({
    success: true,
    transactions,
    nextCursor: hasMore ? encodeCursor(transactions[transactions.length - 1]) : null,
    totals: { count: agg?.count || 0, debitPaise: agg?.debitPaise || 0, creditPaise: agg?.creditPaise || 0, spendPaise: agg?.spendPaise || 0 },
  });
}));

router.get('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res);
  const txn = await Transaction.findOne({ _id: req.params.id, ...scoped(req) });
  if (!txn) return notFound(res);
  const [linked, rawEvents, documents] = await Promise.all([
    txn.linkedTransactionId ? Transaction.findOne({ _id: txn.linkedTransactionId, ...scoped(req) }) : null,
    RawEvent.find({ _id: { $in: txn.rawEventIds }, ...scoped(req) }).sort({ receivedAt: 1 }),
    FinDocument.find({ ...scoped(req), $or: [{ _id: { $in: txn.attachmentDocIds } }, { linkedTo: { $elemMatch: { kind: 'transaction', id: String(txn._id) } } }] }),
  ]);
  res.json({
    success: true,
    transaction: txn,
    linked,
    sources: rawEvents.map((r) => ({
      id: String(r._id), source: r.source, sender: r.sender, subject: r.subject, receivedAt: r.receivedAt,
      parser: r.parser, status: r.status, lineItems: (r.extracted as any)?.lineItems,
    })),
    documents,
  });
}));

// Manual transaction (cash, or anything no email/statement covers)
router.post('/', handler(async (req, res) => {
  const body = validate(transactionCreate, req.body, res);
  if (!body) return;
  const kind = body.kind || (body.direction === 'debit' ? 'expense' : 'income');
  const txn = await Transaction.create({
    ...body, ...scoped(req), kind, status: 'settled', merchantRaw: body.merchant, merchant: displayMerchant(body.merchant) || body.merchant,
    sourceKinds: ['manual'], source: 'manual', categoryId: body.categoryId ?? null, categorySource: body.categoryId ? 'user' : '',
    channel: body.channel,
  });
  if (body.categoryId === undefined) await applyCategory(req.userId!, txn);
  res.status(201).json({ success: true, transaction: await Transaction.findById(txn._id) });
}));

router.patch('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res);
  const body = validate(transactionUpdate, req.body, res);
  if (!body) return;
  const txn = await Transaction.findOne({ _id: req.params.id, ...scoped(req) });
  if (!txn) return notFound(res);
  const { learn, ...changes } = body;

  if (changes.categoryId && !(await Category.exists({ _id: changes.categoryId, ...scoped(req) }))) {
    res.status(400).json({ error: 'Category not found' }); return;
  }
  if (changes.tripId && !(await Group.exists({ id: changes.tripId, members: req.userId }))) {
    res.status(400).json({ error: 'Trip not found' }); return;
  }
  const set: Record<string, any> = { ...changes };
  if (changes.merchant !== undefined) set.merchant = changes.merchant;
  if (changes.categoryId !== undefined) {
    set.categorySource = 'user';
    set.splits = [];
    if (learn && changes.categoryId) await learnFromCorrection(req.userId!, txn, changes.categoryId);
  }
  const updated = await Transaction.findOneAndUpdate({ _id: txn._id }, { $set: set }, { returnDocument: 'after' });
  res.json({ success: true, transaction: updated });
}));

router.delete('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res);
  const txn = await Transaction.findOne({ _id: req.params.id, ...scoped(req) });
  if (!txn) return notFound(res);
  if (txn.linkedTransactionId) {
    await Transaction.updateOne({ _id: txn.linkedTransactionId, ...scoped(req) }, { $set: { linkedTransactionId: null } });
  }
  // Source records stay (ignored) so re-ingesting the same email can't bring it back.
  await RawEvent.updateMany({ _id: { $in: txn.rawEventIds }, ...scoped(req) }, { $set: { status: 'ignored', reviewReason: 'transaction_deleted' }, $pull: { transactionIds: txn._id } });
  await Transaction.deleteOne({ _id: txn._id });
  res.json({ success: true });
}));

// PUT /:id/splits - category split; parts must add up to the payment.
router.put('/:id/splits', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res);
  const body = validate(splitsBody, req.body, res);
  if (!body) return;
  const txn = await Transaction.findOne({ _id: req.params.id, ...scoped(req) });
  if (!txn) return notFound(res);

  let splits: any[] = [];
  if (body.mode === 'clear') {
    splits = [];
  } else if (body.mode === 'template') {
    const tpl = body.templateId ? await SplitTemplate.findOne({ _id: body.templateId, ...scoped(req) }) : null;
    if (!tpl) { res.status(400).json({ error: 'Template not found' }); return; }
    splits = partsFromPercents(txn.amountPaise, tpl.parts.map((p) => ({ categoryId: String(p.categoryId), percent: p.percent })));
  } else if (body.mode === 'percent') {
    splits = partsFromPercents(txn.amountPaise, body.parts.map((p) => ({ categoryId: p.categoryId, percent: p.percent ?? 0, note: p.note })));
  } else {
    splits = body.parts.map((p) => ({
      categoryId: p.categoryId ? new Types.ObjectId(p.categoryId) : null, amountPaise: p.amountPaise ?? 0,
      note: p.note || '', lineItems: p.lineItems,
    }));
    assertSplitsTotal(splits, txn.amountPaise);
  }
  const ids = splits.map((s) => s.categoryId).filter(Boolean);
  if (ids.length && (await Category.countDocuments({ _id: { $in: ids }, ...scoped(req) })) !== new Set(ids.map(String)).size) {
    res.status(400).json({ error: 'Unknown category in split' }); return;
  }
  const updated = await Transaction.findOneAndUpdate(
    { _id: txn._id },
    { $set: { splits, categorySource: splits.length ? 'split' : 'user', ...(splits.length === 1 ? { categoryId: splits[0].categoryId } : {}) } },
    { returnDocument: 'after' },
  );
  res.json({ success: true, transaction: updated });
}));

// POST /:id/auto-split - re-run grocery auto-split from attached line items
router.post('/:id/auto-split', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res);
  const txn = await Transaction.findOne({ _id: req.params.id, ...scoped(req) });
  if (!txn) return notFound(res);
  const raws = await RawEvent.find({ _id: { $in: txn.rawEventIds }, ...scoped(req) });
  const items = raws.flatMap((r) => (r.extracted as any)?.lineItems || []);
  if (!items.length) { res.status(400).json({ error: 'No line items found for this payment' }); return; }
  const keys = await categoryIdsByKey(req.userId!);
  const splits = autoSplitLineItems(txn.amountPaise, items, keys);
  const updated = await Transaction.findOneAndUpdate({ _id: txn._id }, { $set: { splits, categorySource: 'split', categoryId: keys.get('groceries') } }, { returnDocument: 'after' });
  res.json({ success: true, transaction: updated });
}));

// POST /:id/link { otherId } - manually link a refund to its original (or unlink with null)
router.post('/:id/link', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res);
  const body = validate(linkBody, req.body, res);
  if (!body) return;
  const txn = await Transaction.findOne({ _id: req.params.id, ...scoped(req) });
  if (!txn) return notFound(res);
  if (txn.linkedTransactionId) {
    await Transaction.updateOne({ _id: txn.linkedTransactionId, ...scoped(req) }, { $set: { linkedTransactionId: null } });
  }
  if (!body.otherId) {
    await Transaction.updateOne({ _id: txn._id }, { $set: { linkedTransactionId: null } });
    res.json({ success: true, transaction: await Transaction.findById(txn._id) });
    return;
  }
  const other = await Transaction.findOne({ _id: body.otherId, ...scoped(req) });
  if (!other || String(other._id) === String(txn._id)) { res.status(400).json({ error: 'Transaction to link not found' }); return; }
  if (other.direction === txn.direction) { res.status(400).json({ error: 'Link a credit to a debit' }); return; }
  const [refund, original] = txn.direction === 'credit' ? [txn, other] : [other, txn];
  await Transaction.updateOne({ _id: refund._id }, { $set: { linkedTransactionId: original._id, kind: 'refund' } });
  await Transaction.updateOne({ _id: original._id }, { $set: { linkedTransactionId: refund._id } });
  res.json({ success: true, transaction: await Transaction.findById(txn._id) });
}));

// POST /:id/share - turn a personal payment into a Tabby shared expense
router.post('/:id/share', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res);
  const body = validate(shareBody, req.body, res);
  if (!body) return;
  const txn = await Transaction.findOne({ _id: req.params.id, ...scoped(req) });
  if (!txn) return notFound(res);
  if (txn.direction !== 'debit') { res.status(400).json({ error: 'Only payments can be shared' }); return; }

  const totalRupees = txn.amountPaise / 100;
  const splitSum = body.splits.reduce((s, x) => s + x.amount, 0);
  if (Math.abs(splitSum - totalRupees) > 0.01) {
    res.status(400).json({ error: `Shares add up to ${splitSum.toFixed(2)} but the payment is ${totalRupees.toFixed(2)}` }); return;
  }
  const me = body.splits.find((s) => s.userId === req.userId);
  if (!me) { res.status(400).json({ error: 'Include yourself in the split' }); return; }
  const visible = new Set((await findVisibleUsers(req.userId!)).map((u) => u.id));
  const strangers = body.splits.filter((s) => !visible.has(s.userId));
  if (strangers.length) { res.status(400).json({ error: 'You can only share with your friends or group members' }); return; }
  if (body.groupId && !(await Group.exists({ id: body.groupId, members: req.userId }))) {
    res.status(400).json({ error: 'Group not found' }); return;
  }

  // Existing Tabby expenses use rupees (Number) - kept as-is for the
  // installed app; the personal transaction keeps paise.
  const expenseId = txn.sharedExpenseId || `exp-fin-${txn._id}`;
  const expense = await Expense.findOneAndUpdate(
    { id: expenseId },
    {
      $set: {
        id: expenseId, description: body.description, amount: totalRupees,
        date: txn.postedAt.toISOString().slice(0, 10), paidBy: req.userId, groupId: body.groupId,
        involvedUserIds: Array.from(new Set(body.splits.map((s) => s.userId))), splits: body.splits,
        splitMethod: body.splitMethod, category: body.category, isSettlement: false, createdBy: req.userId,
      },
      $setOnInsert: { createdAt: new Date().toISOString() },
    },
    { upsert: true, returnDocument: 'after' },
  );
  await Activity.create({
    id: `act-fin-${txn._id}-${Date.now()}`, type: 'expense_add', userId: req.userId,
    description: `added "${body.description}" (₹${totalRupees.toFixed(2)}) from a bank payment`,
    timestamp: new Date().toISOString(),
  });
  const updated = await Transaction.findOneAndUpdate(
    { _id: txn._id },
    { $set: { sharedExpenseId: expenseId, mySharePaise: Math.round(me.amount * 100), ...(body.groupId ? { tripId: body.groupId } : {}) } },
    { returnDocument: 'after' },
  );
  res.json({ success: true, transaction: updated, expense });
}));

export default router;
