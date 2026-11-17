import { Router } from 'express';
import { Commitment, Holding } from '../models';
import { handler, isObjectId, scoped, validate } from '../lib/http';
import { holdingCreate, holdingUpdate, periodQuery } from '../validation/schemas';
import { investmentSummary, pushHistory } from '../services/investments';
import { spendingSummary } from '../services/spending';

export const investmentsRouter = Router();
export const spendingRouter = Router();
const nf = (res: any) => res.status(404).json({ error: 'Investment not found' });

// GET /api/finance/spending?from=YYYY-MM-DD&to=YYYY-MM-DD (India dates, inclusive)
spendingRouter.get('/', handler(async (req, res) => {
  const q = validate(periodQuery, req.query, res);
  if (!q) return;
  if (q.to < q.from) { res.status(400).json({ error: '"to" is before "from"' }); return; }
  const span = (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000;
  if (span > 366 * 5) { res.status(400).json({ error: 'Pick a period of 5 years or less' }); return; }
  res.json({ success: true, ...(await spendingSummary(req.userId!, q.from, q.to)) });
}));

// GET /api/finance/investments - holdings, SIPs and the summary graphs
investmentsRouter.get('/', handler(async (req, res) => {
  res.json({ success: true, ...(await investmentSummary(req.userId!)) });
}));

async function commitmentOk(req: any, id: string | null | undefined, res: any): Promise<boolean> {
  if (id && !(await Commitment.exists({ _id: id, ...scoped(req), type: 'sip' }))) {
    res.status(400).json({ error: 'SIP not found' });
    return false;
  }
  return true;
}

investmentsRouter.post('/', handler(async (req, res) => {
  const body = validate(holdingCreate, req.body, res);
  if (!body || !(await commitmentOk(req, body.commitmentId, res))) return;
  const asOf = body.valueAsOf || new Date();
  const doc = new Holding({ ...body, ...scoped(req), valueAsOf: asOf });
  doc.history = pushHistory(doc as any, asOf) as any;
  await doc.save();
  res.status(201).json({ success: true, holding: doc });
}));

investmentsRouter.patch('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return nf(res);
  const body = validate(holdingUpdate, req.body, res);
  if (!body || !(await commitmentOk(req, body.commitmentId as string | null | undefined, res))) return;
  const doc = await Holding.findOne({ _id: req.params.id, ...scoped(req) });
  if (!doc) return nf(res);
  for (const [k, v] of Object.entries(body)) if (v !== undefined && k !== 'valueAsOf') (doc as any)[k] = v;
  if (body.investedPaise !== undefined || body.currentValuePaise !== undefined || body.valueAsOf) {
    const asOf = (body.valueAsOf as Date | undefined) || new Date();
    doc.valueAsOf = asOf;
    doc.history = pushHistory(doc, asOf) as any;
  }
  await doc.save();
  res.json({ success: true, holding: doc });
}));

investmentsRouter.delete('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return nf(res);
  await Holding.deleteOne({ _id: req.params.id, ...scoped(req) });
  res.json({ success: true });
}));
