import { Router } from 'express';
import { Account, Statement, Transaction } from '../models';
import { handler, isObjectId, scoped, validate } from '../lib/http';
import { accountCreate, accountUpdate, statementPassword } from '../validation/schemas';
import { encryptString } from '../lib/crypto';
import { accountBalances } from '../services/ledger/balances';

const router = Router();

/** Masked forms banks use for one account, stored so alerts can be matched. */
function defaultAliases(last4: string): string[] {
  return last4 ? [`XX${last4}`, `xx${last4}`] : [];
}

router.get('/', handler(async (req, res) => {
  const accounts = await Account.find(scoped(req)).sort({ isActive: -1, name: 1 });
  const balances = await accountBalances(req.userId!, accounts);
  res.json({
    success: true,
    accounts: accounts.map((a) => ({ ...a.toJSON(), ...balances.get(String(a._id)) })),
  });
}));

router.post('/', handler(async (req, res) => {
  const body = validate(accountCreate, req.body, res);
  if (!body) return;
  const account = await Account.create({
    ...body,
    ...scoped(req),
    aliases: Array.from(new Set([...body.aliases, ...defaultAliases(body.last4)])),
  });
  res.status(201).json({ success: true, account });
}));

router.patch('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) { res.status(404).json({ error: 'Account not found' }); return; }
  const body = validate(accountUpdate, req.body, res);
  if (!body) return;
  const account = await Account.findOneAndUpdate({ _id: req.params.id, ...scoped(req) }, { $set: body }, { returnDocument: 'after' });
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }
  res.json({ success: true, account });
}));

// Write-only: the password is encrypted and never returned.
router.put('/:id/statement-password', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) { res.status(404).json({ error: 'Account not found' }); return; }
  const body = validate(statementPassword, req.body, res);
  if (!body) return;
  const enc = body.password ? encryptString(body.password) : '';
  const account = await Account.findOneAndUpdate({ _id: req.params.id, ...scoped(req) }, { $set: { statementPasswordEnc: enc } }, { returnDocument: 'after' });
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }
  res.json({ success: true, account });
}));

router.delete('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) { res.status(404).json({ error: 'Account not found' }); return; }
  const filter = { _id: req.params.id, ...scoped(req) };
  const used = await Transaction.exists({ ownerId: req.userId, accountId: req.params.id });
  if (used) {
    // Keep history intact: archive instead of deleting.
    await Account.updateOne(filter, { $set: { isActive: false } });
    res.json({ success: true, archived: true });
    return;
  }
  await Statement.deleteMany({ ownerId: req.userId, accountId: req.params.id });
  await Account.deleteOne(filter);
  res.json({ success: true, deleted: true });
}));

export default router;
