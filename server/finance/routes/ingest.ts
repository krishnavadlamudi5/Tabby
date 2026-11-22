import { Router, Request, Response } from 'express';
import express from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { User } from '../../models/User';
import { RawEvent } from '../models';
import { handler, scoped, validate } from '../lib/http';
import { emailIngest, manualIngest, smsIngest } from '../validation/schemas';
import { institutionForSms, smsSenderFromAddress } from '../services/ingest/parsers/sms';
import { ingestEmail } from '../services/ingest/pipeline';
import { sha256, isEncryptionConfigured } from '../lib/crypto';
import { getFileStore } from '../services/storage/fileStore';
import { isAiConfigured } from '../services/ai/cloudflare';
import { filePolicy } from '../services/insurance/filePolicy';
import { processGmailEmail } from '../services/ingest/gmailEmail';

// ---------------------------------------------------------------- manual (signed-in user)

export const manualIngestRouter = Router();

// POST /api/finance/ingest/manual - paste an email or SMS
manualIngestRouter.post('/', handler(async (req, res) => {
  const body = validate(manualIngest, req.body, res);
  if (!body) return;
  const result = await ingestEmail({
    ...scoped(req), source: 'manual', sourceId: sha256(`${body.sender}|${body.subject}|${body.text}`),
    sender: body.sender || 'manual@paste', subject: body.subject, receivedAt: body.receivedAt || new Date(), bodyText: body.text,
  });
  let policy = null;
  if (!result.duplicate && result.detectedType === 'policy') {
    const filed = await filePolicy(req.userId!, result.rawEventId, {
      sender: body.sender, subject: body.subject, bodyText: body.text, receivedAt: body.receivedAt || new Date(), pdfs: [],
    });
    policy = filed.policy;
  }
  res.status(result.duplicate ? 409 : 200).json({
    success: !result.duplicate, ...result, ...(policy ? { status: 'parsed', policyId: String(policy._id) } : {}),
    ...(result.duplicate ? { error: 'already_ingested' } : {}),
  });
}));

// POST /api/finance/ingest/sms - bank SMS read from the phone's inbox.
// Only SMS from known bank sender IDs are kept; anything else is skipped
// without being stored, so personal messages never reach the server.
manualIngestRouter.post('/sms', handler(async (req, res) => {
  const body = validate(smsIngest, req.body, res);
  if (!body) return;
  const counts = { received: body.messages.length, parsed: 0, review: 0, ignored: 0, duplicate: 0, skipped: 0 };
  for (const msg of body.messages) {
    const sender = smsSenderFromAddress(msg.address);
    if (!sender || !institutionForSms(sender)) { counts.skipped += 1; continue; }
    const receivedAt = new Date(msg.date);
    const result = await ingestEmail({
      ...scoped(req), source: 'sms', sourceId: sha256(`${sender}|${receivedAt.getTime()}|${msg.body}`),
      sender, subject: '', receivedAt, bodyText: msg.body,
    });
    if (result.duplicate) counts.duplicate += 1;
    else if (result.status === 'needs_review') counts.review += 1;
    else if (result.status === 'ignored') counts.ignored += 1;
    else counts.parsed += 1;
  }
  res.json({ success: true, ...counts });
}));

// GET /api/finance/ingest/status - is the Gmail import working?
manualIngestRouter.get('/status', handler(async (req, res) => {
  const owner = scoped(req);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [last, week, review, total] = await Promise.all([
    RawEvent.findOne({ ...owner, source: 'gmail' }).sort({ createdAt: -1 }),
    RawEvent.countDocuments({ ...owner, source: 'gmail', createdAt: { $gte: weekAgo } }),
    RawEvent.countDocuments({ ...owner, status: 'needs_review' }),
    RawEvent.countDocuments({ ...owner, source: 'gmail' }),
  ]);
  const user = await User.findOne({ id: req.userId });
  const ownerEmail = (process.env.INGEST_OWNER_EMAIL || '').toLowerCase().trim();
  res.json({
    success: true,
    configured: Boolean(process.env.INGEST_HMAC_SECRET),
    isIngestOwner: Boolean(ownerEmail && user && user.email === ownerEmail),
    lastReceivedAt: last?.createdAt || null,
    lastSubject: last?.subject || null,
    emailsThisWeek: week,
    emailsTotal: total,
    needsReview: review,
    features: {
      encryption: isEncryptionConfigured(),
      documentsStorage: getFileStore().name,
      aiBackup: isAiConfigured(),
      alertEmails: Boolean(process.env.RESEND_API_KEY),
    },
  });
}));

// ---------------------------------------------------------------- Gmail push (HMAC)

const MAX_SKEW_MS = 5 * 60 * 1000;

/** HMAC-SHA256(secret, timestamp + "." + rawBody), hex. */
export function signIngest(secret: string, timestamp: string, rawBody: string | Buffer): string {
  return createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
}

function verify(req: Request & { rawBody?: Buffer }): string | null {
  const secret = process.env.INGEST_HMAC_SECRET;
  if (!secret) return 'Ingestion is not configured (INGEST_HMAC_SECRET)';
  const ts = String(req.headers['x-tabby-timestamp'] || '');
  const sig = String(req.headers['x-tabby-signature'] || '');
  if (!ts || !sig || !req.rawBody) return 'Missing signature';
  const tsMs = /^\d{13}$/.test(ts) ? Number(ts) : Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > MAX_SKEW_MS) return 'Stale timestamp';
  const expected = Buffer.from(signIngest(secret, ts, req.rawBody), 'hex');
  const given = Buffer.from(sig.replace(/^sha256=/, ''), 'hex');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'Bad signature';
  return null;
}

export const emailIngestRouter = Router();

// The raw body is needed for the signature, and this route alone may carry
// attachments (25 MB). Registered before the app-wide JSON parser.
emailIngestRouter.use(express.json({
  limit: '25mb',
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf;
  },
}));

// POST /api/finance/ingest/email - called by tools/apps-script/Code.gs
emailIngestRouter.post('/', async (req: Request, res: Response) => {
  try {
    const problem = verify(req as any);
    if (problem) { res.status(401).json({ error: problem }); return; }
    const ownerEmail = (process.env.INGEST_OWNER_EMAIL || '').toLowerCase().trim();
    const owner = ownerEmail ? await User.findOne({ email: ownerEmail }) : null;
    if (!owner) { res.status(503).json({ error: 'INGEST_OWNER_EMAIL does not match a Tabby user. Sign in to Tabby with that Google account first.' }); return; }

    const body = validate(emailIngest, req.body, res);
    if (!body) return;
    const ownerId = owner.id;

    const out = await processGmailEmail(ownerId, body);
    if (out.duplicate === true) { res.status(409).json({ error: 'already_ingested' }); return; }
    res.json({ success: true, ...out.result, ...(out.policy ? { status: 'parsed', reviewReason: undefined, policy: out.policy } : {}), statements: out.statements });
  } catch (err: any) {
    console.error('Email ingest failed:', err);
    res.status(500).json({ error: 'Ingest failed' });
  }
});
