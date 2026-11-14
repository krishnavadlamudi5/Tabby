import { Router, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { Alert, Commitment, Account, Policy } from '../models';
import { handler, isObjectId, scoped, validate } from '../lib/http';
import { commitmentCreate, commitmentUpdate } from '../validation/schemas';
import { recurringSuggestions } from '../services/commitments';
import { buildDashboard } from '../services/dashboard';
import { istMonthKey } from '../lib/time';
import { runJob, JOBS, JobName } from '../services/jobs';

export const commitmentsRouter = Router();
export const alertsRouter = Router();
export const dashboardRouter = Router();
const nf = (res: any, what: string) => res.status(404).json({ error: `${what} not found` });

// ---------------------------------------------------------------- commitments

commitmentsRouter.get('/', handler(async (req, res) => {
  res.json({ success: true, commitments: await Commitment.find(scoped(req)).sort({ 'schedule.nextDueDate': 1 }) });
}));

commitmentsRouter.get('/suggestions', handler(async (req, res) => {
  res.json({ success: true, suggestions: await recurringSuggestions(req.userId!) });
}));

async function checkRefs(req: any, body: { accountId?: string | null; policyId?: string | null }, res: Response): Promise<boolean> {
  if (body.accountId && !(await Account.exists({ _id: body.accountId, ...scoped(req) }))) { res.status(400).json({ error: 'Account not found' }); return false; }
  if (body.policyId && !(await Policy.exists({ _id: body.policyId, ...scoped(req) }))) { res.status(400).json({ error: 'Policy not found' }); return false; }
  return true;
}

commitmentsRouter.post('/', handler(async (req, res) => {
  const body = validate(commitmentCreate, req.body, res);
  if (!body || !(await checkRefs(req, body, res))) return;
  const commitment = await Commitment.create({ ...body, ...scoped(req), source: 'manual' });
  res.status(201).json({ success: true, commitment });
}));

commitmentsRouter.patch('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return nf(res, 'Commitment');
  const body = validate(commitmentUpdate, req.body, res);
  if (!body || !(await checkRefs(req, body, res))) return;
  const set: Record<string, any> = { ...body };
  if (body.schedule) {
    delete set.schedule;
    for (const [k, v] of Object.entries(body.schedule)) if (v !== undefined) set[`schedule.${k}`] = v;
  }
  if (body.matchRule) {
    delete set.matchRule;
    for (const [k, v] of Object.entries(body.matchRule)) if (v !== undefined) set[`matchRule.${k}`] = v;
  }
  const commitment = await Commitment.findOneAndUpdate({ _id: req.params.id, ...scoped(req) }, { $set: set }, { returnDocument: 'after' });
  if (!commitment) return nf(res, 'Commitment');
  res.json({ success: true, commitment });
}));

commitmentsRouter.delete('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return nf(res, 'Commitment');
  await Commitment.deleteOne({ _id: req.params.id, ...scoped(req) });
  res.json({ success: true });
}));

// ---------------------------------------------------------------- alerts

alertsRouter.get('/', handler(async (req, res) => {
  const [alerts, unread] = await Promise.all([
    Alert.find(scoped(req)).sort({ createdAt: -1 }).limit(100),
    Alert.countDocuments({ ...scoped(req), readAt: null }),
  ]);
  res.json({ success: true, alerts, unread });
}));

alertsRouter.post('/read-all', handler(async (req, res) => {
  await Alert.updateMany({ ...scoped(req), readAt: null }, { $set: { readAt: new Date() } });
  res.json({ success: true });
}));

alertsRouter.post('/:id/read', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return nf(res, 'Alert');
  const alert = await Alert.findOneAndUpdate({ _id: req.params.id, ...scoped(req) }, { $set: { readAt: new Date() } }, { returnDocument: 'after' });
  if (!alert) return nf(res, 'Alert');
  res.json({ success: true, alert });
}));

// ---------------------------------------------------------------- dashboard

dashboardRouter.get('/', handler(async (req, res) => {
  const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : istMonthKey(new Date());
  res.json({ success: true, ...(await buildDashboard(req.userId!, month)) });
}));

// ---------------------------------------------------------------- jobs (scheduler, not a user)

export const jobsRouter = Router();

// POST /api/finance/jobs/run?job=daily|hourly|<name>  with header
// "Authorization: Bearer <JOBS_SECRET>" (or X-Jobs-Secret). Called by the
// GitHub Actions schedule in .github/workflows/finance-jobs.yml.
jobsRouter.post('/run', async (req: Request, res: Response) => {
  const secret = process.env.JOBS_SECRET;
  if (!secret) { res.status(503).json({ error: 'JOBS_SECRET is not configured' }); return; }
  const given = String(req.headers['x-jobs-secret'] || (req.headers.authorization || '').replace(/^Bearer /, ''));
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) { res.status(401).json({ error: 'Bad jobs secret' }); return; }
  const job = String(req.query.job || 'daily') as JobName;
  if (job !== 'daily' && job !== 'hourly' && !(job in JOBS)) { res.status(400).json({ error: `Unknown job. Use daily, hourly or one of ${Object.keys(JOBS).join(', ')}` }); return; }
  const result = await runJob(job);
  res.json({ success: true, job, result });
});
