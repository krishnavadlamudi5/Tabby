import { Router } from 'express';
import { Claim, FinDocument, Person, Policy, Transaction } from '../models';
import { handler, isObjectId, scoped, validate } from '../lib/http';
import { claimCreate, claimUpdate, personCreate, personUpdate, policyCreate, policyUpdate } from '../validation/schemas';
import { linkPremiums, syncPremiumCommitment, taxSummary } from '../services/insurance';
import { financialYear } from '../lib/time';
import { Commitment } from '../models';

export const policiesRouter = Router();
export const peopleRouter = Router();
export const claimsRouter = Router();
const nf = (res: any, what: string) => res.status(404).json({ error: `${what} not found` });

async function membersBelong(ownerId: string, ids: string[] | undefined): Promise<boolean> {
  if (!ids?.length) return true;
  return (await Person.countDocuments({ ownerId, _id: { $in: ids } })) === new Set(ids).size;
}

// ---------------------------------------------------------------- policies

policiesRouter.get('/', handler(async (req, res) => {
  const policies = await Policy.find(scoped(req)).sort({ renewalDate: 1, insurer: 1 });
  res.json({ success: true, policies });
}));

// GET /policies/tax?fy=2026-27
policiesRouter.get('/tax', handler(async (req, res) => {
  const fy = typeof req.query.fy === 'string' && /^\d{4}-\d{2}$/.test(req.query.fy) ? req.query.fy : financialYear(new Date());
  res.json({ success: true, ...(await taxSummary(req.userId!, fy)) });
}));

policiesRouter.get('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return nf(res, 'Policy');
  const policy = await Policy.findOne({ _id: req.params.id, ...scoped(req) });
  if (!policy) return nf(res, 'Policy');
  const [members, premiums, documents, claims] = await Promise.all([
    Person.find({ ...scoped(req), _id: { $in: policy.insuredMemberIds } }),
    Transaction.find({ ...scoped(req), _id: { $in: policy.premiumTransactionIds } }).sort({ postedAt: -1 }),
    FinDocument.find({ ...scoped(req), $or: [{ _id: { $in: policy.documentIds } }, { linkedTo: { $elemMatch: { kind: 'policy', id: String(policy._id) } } }] }),
    Claim.find({ ...scoped(req), policyId: policy._id }).sort({ date: -1 }),
  ]);
  res.json({ success: true, policy, members, premiums, documents, claims });
}));

policiesRouter.post('/', handler(async (req, res) => {
  const body = validate(policyCreate, req.body, res);
  if (!body) return;
  if (!(await membersBelong(req.userId!, body.insuredMemberIds))) { res.status(400).json({ error: 'Unknown insured member' }); return; }
  const policy = await Policy.create({ ...body, ...scoped(req) });
  await syncPremiumCommitment(req.userId!, policy);
  await linkPremiums(req.userId!, policy);
  res.status(201).json({ success: true, policy: await Policy.findById(policy._id) });
}));

policiesRouter.patch('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return nf(res, 'Policy');
  const body = validate(policyUpdate, req.body, res);
  if (!body) return;
  if (!(await membersBelong(req.userId!, body.insuredMemberIds))) { res.status(400).json({ error: 'Unknown insured member' }); return; }
  const policy = await Policy.findOneAndUpdate({ _id: req.params.id, ...scoped(req) }, { $set: body }, { returnDocument: 'after' });
  if (!policy) return nf(res, 'Policy');
  await syncPremiumCommitment(req.userId!, policy);
  res.json({ success: true, policy });
}));

policiesRouter.post('/:id/link-premiums', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return nf(res, 'Policy');
  const policy = await Policy.findOne({ _id: req.params.id, ...scoped(req) });
  if (!policy) return nf(res, 'Policy');
  const linked = await linkPremiums(req.userId!, policy);
  res.json({ success: true, linked: linked.length, policy: await Policy.findById(policy._id) });
}));

policiesRouter.delete('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return nf(res, 'Policy');
  const policy = await Policy.findOneAndDelete({ _id: req.params.id, ...scoped(req) });
  if (!policy) return nf(res, 'Policy');
  await Commitment.deleteOne({ ...scoped(req), externalKey: `policy:${policy._id}` });
  await Claim.deleteMany({ ...scoped(req), policyId: policy._id });
  // Documents are kept (they may matter later); only the link is removed.
  await FinDocument.updateMany({ ...scoped(req) }, { $pull: { linkedTo: { kind: 'policy', id: String(policy._id) } } });
  res.json({ success: true });
}));

// ---------------------------------------------------------------- people (insured members)

peopleRouter.get('/', handler(async (req, res) => {
  res.json({ success: true, people: await Person.find(scoped(req)).sort({ name: 1 }) });
}));
peopleRouter.post('/', handler(async (req, res) => {
  const body = validate(personCreate, req.body, res);
  if (!body) return;
  res.status(201).json({ success: true, person: await Person.create({ ...body, ...scoped(req) }) });
}));
peopleRouter.patch('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return nf(res, 'Person');
  const body = validate(personUpdate, req.body, res);
  if (!body) return;
  const person = await Person.findOneAndUpdate({ _id: req.params.id, ...scoped(req) }, { $set: body }, { returnDocument: 'after' });
  if (!person) return nf(res, 'Person');
  res.json({ success: true, person });
}));
peopleRouter.delete('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return nf(res, 'Person');
  await Person.deleteOne({ _id: req.params.id, ...scoped(req) });
  await Policy.updateMany(scoped(req), { $pull: { insuredMemberIds: req.params.id } });
  res.json({ success: true });
}));

// ---------------------------------------------------------------- claims

claimsRouter.get('/', handler(async (req, res) => {
  const filter: Record<string, any> = scoped(req);
  if (typeof req.query.policyId === 'string' && isObjectId(req.query.policyId)) filter.policyId = req.query.policyId;
  res.json({ success: true, claims: await Claim.find(filter).sort({ date: -1 }) });
}));
claimsRouter.post('/', handler(async (req, res) => {
  const body = validate(claimCreate, req.body, res);
  if (!body) return;
  if (!(await Policy.exists({ _id: body.policyId, ...scoped(req) }))) { res.status(400).json({ error: 'Policy not found' }); return; }
  res.status(201).json({ success: true, claim: await Claim.create({ ...body, ...scoped(req) }) });
}));
claimsRouter.patch('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return nf(res, 'Claim');
  const body = validate(claimUpdate, req.body, res);
  if (!body) return;
  if (body.policyId && !(await Policy.exists({ _id: body.policyId, ...scoped(req) }))) { res.status(400).json({ error: 'Policy not found' }); return; }
  const claim = await Claim.findOneAndUpdate({ _id: req.params.id, ...scoped(req) }, { $set: body }, { returnDocument: 'after' });
  if (!claim) return nf(res, 'Claim');
  res.json({ success: true, claim });
}));
claimsRouter.delete('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return nf(res, 'Claim');
  await Claim.deleteOne({ _id: req.params.id, ...scoped(req) });
  res.json({ success: true });
}));
