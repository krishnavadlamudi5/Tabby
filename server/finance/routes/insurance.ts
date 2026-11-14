import { Router } from 'express';
import { Claim, FinDocument, Person, Policy, Transaction } from '../models';
import { handler, isObjectId, scoped, validate } from '../lib/http';
import { claimCreate, claimUpdate, docPasswordCreate, personCreate, personUpdate, policyCreate, policyExtractBody, policyUpdate } from '../validation/schemas';
import { DocPassword, FinDocument as Doc, RawEvent } from '../models';
import { encryptString, decryptString } from '../lib/crypto';
import { extractPolicy, isUsable, mergeExtractions } from '../services/insurance/policyExtract';
import { aiExtractPolicy, isAiConfigured } from '../services/ai/cloudflare';
import { User } from '../../models/User';
import { updateRaw } from '../services/insurance/filePolicy';
import { linkPremiums, syncPremiumCommitment, taxSummary } from '../services/insurance';
import { financialYear } from '../lib/time';
import { Commitment } from '../models';

export const policiesRouter = Router();
export const peopleRouter = Router();
export const claimsRouter = Router();
export const docPasswordsRouter = Router();
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

// POST /policies/extract - read policy details from text (OCR'd on the phone,
// pasted, or a review item's email). Labels first, then the optional AI backup.
policiesRouter.post('/extract', handler(async (req, res) => {
  const body = validate(policyExtractBody, req.body, res);
  if (!body) return;
  let text = body.text || '';
  let sender = body.sender;
  let subject = body.subject;
  let attachments: { documentId?: string; filename: string; mimeType: string }[] = [];
  if (body.rawEventId) {
    const raw = await RawEvent.findOne({ _id: body.rawEventId, ...scoped(req) });
    if (!raw) { res.status(404).json({ error: 'Review item not found' }); return; }
    const prior = (raw.extracted as any)?.policy;
    text = [text, raw.bodyEnc ? decryptString(raw.bodyEnc) : ''].filter(Boolean).join('\n');
    sender = sender || raw.sender;
    subject = subject || raw.subject;
    attachments = raw.attachmentsMeta;
    if (prior && !body.text) {
      const parts = [{ ...prior, startDate: prior.startDate ? new Date(prior.startDate) : undefined, endDate: prior.endDate ? new Date(prior.endDate) : undefined }];
      parts.push(extractPolicy(text, sender, subject));
      res.json({ success: true, extraction: mergeExtractions(parts), attachments });
      return;
    }
  }
  let extraction = extractPolicy(text, sender, subject);
  if (!isUsable(extraction) && isAiConfigured()) {
    const owner = await User.findOne({ id: req.userId });
    const ai = await aiExtractPolicy(`${subject}\n${text}`, owner?.name || '');
    if (ai) extraction = mergeExtractions([extraction, ai]);
  }
  res.json({ success: true, extraction, attachments, aiAvailable: isAiConfigured() });
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
  const { fromRawEventId, ...fields } = body;
  const raw = fromRawEventId ? await RawEvent.findOne({ _id: fromRawEventId, ...scoped(req) }) : null;
  const docIds = (raw?.attachmentsMeta || []).map((a) => a.documentId).filter(Boolean) as string[];
  const policy = await Policy.create({ ...fields, ...scoped(req), documentIds: docIds, sourceRawEventId: raw?._id || null, needsCheck: false });
  for (const id of docIds) {
    await Doc.updateOne({ _id: id, ...scoped(req) }, { $push: { linkedTo: { kind: 'policy', id: String(policy._id) } }, $set: { type: 'policy' } });
  }
  if (raw) await updateRaw(req.userId!, String(raw._id), { status: 'parsed', reviewReason: '' }, { policyId: String(policy._id) });
  await syncPremiumCommitment(req.userId!, policy);
  await linkPremiums(req.userId!, policy, raw?.receivedAt);
  res.status(201).json({ success: true, policy: await Policy.findById(policy._id) });
}));

policiesRouter.patch('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return nf(res, 'Policy');
  const body = validate(policyUpdate, req.body, res);
  if (!body) return;
  if (!(await membersBelong(req.userId!, body.insuredMemberIds))) { res.status(400).json({ error: 'Unknown insured member' }); return; }
  const { fromRawEventId: _ignored, ...fields } = body;
  const policy = await Policy.findOneAndUpdate({ _id: req.params.id, ...scoped(req) }, { $set: { needsCheck: false, ...fields } }, { returnDocument: 'after' });
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

// ---------------------------------------------------------------- PDF passwords (write-only)

docPasswordsRouter.get('/', handler(async (req, res) => {
  const list = await DocPassword.find(scoped(req)).sort({ label: 1 });
  res.json({ success: true, passwords: list.map((p) => ({ id: String(p._id), label: p.label })) });
}));
docPasswordsRouter.post('/', handler(async (req, res) => {
  const body = validate(docPasswordCreate, req.body, res);
  if (!body) return;
  const p = await DocPassword.create({ ...scoped(req), label: body.label, passwordEnc: encryptString(body.password) });
  res.status(201).json({ success: true, password: { id: String(p._id), label: p.label } });
}));
docPasswordsRouter.delete('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return nf(res, 'Password');
  await DocPassword.deleteOne({ _id: req.params.id, ...scoped(req) });
  res.json({ success: true });
}));
