import { Router, Request, Response } from 'express';
import express from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { User } from '../../models/User';
import { Account, IAccount, RawEvent } from '../models';
import { handler, scoped, validate } from '../lib/http';
import { emailIngest, manualIngest } from '../validation/schemas';
import { ingestEmail } from '../services/ingest/pipeline';
import { sha256, decryptString } from '../lib/crypto';
import { saveDocument } from '../services/storage/documents';
import { parsePdfStatement, StatementParseError } from '../services/statements/parse';
import { importStatement } from '../services/statements/importStatement';
import { raiseAlert } from '../services/alerts';

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
  res.status(result.duplicate ? 409 : 200).json({ success: !result.duplicate, ...result, ...(result.duplicate ? { error: 'already_ingested' } : {}) });
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

function guessDocType(filename: string, subject: string): 'statement' | 'invoice' | 'policy' | 'premium_receipt' | 'other' {
  const s = `${filename} ${subject}`.toLowerCase();
  if (/statement|e-?stmt|estatement/.test(s)) return 'statement';
  if (/premium (paid )?receipt|premium acknowledg/.test(s)) return 'premium_receipt';
  if (/policy|schedule|certificate of insurance/.test(s)) return 'policy';
  if (/invoice|bill|receipt/.test(s)) return 'invoice';
  return 'other';
}

async function accountForStatement(ownerId: string, sender: string, filename: string, subject: string): Promise<IAccount | null> {
  const accounts = await Account.find({ ownerId, isActive: true });
  const digits = `${filename} ${subject}`.match(/\d{4,}/g) || [];
  const byNumber = accounts.find((a) => digits.some((d) => d.endsWith(a.last4) || a.cardLast4s.some((c) => d.endsWith(c))));
  if (byNumber) return byNumber;
  const bank = ['kotak', 'icici', 'hdfc', 'sbm', 'sbi', 'axis', 'idfc', 'yes'].find((b) => sender.includes(b));
  const sameBank = accounts.filter((a) => bank && a.institution === bank);
  return sameBank.length === 1 ? sameBank[0] : null;
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

    if (await RawEvent.exists({ ownerId, source: 'gmail', sourceId: body.messageId })) {
      res.status(409).json({ error: 'already_ingested' });
      return;
    }

    // Attachments go straight to encrypted storage as documents.
    const attachmentsMeta: { filename: string; mimeType: string; size: number; documentId?: string }[] = [];
    const statementPdfs: { buffer: Buffer; filename: string; docId: string }[] = [];
    for (const att of body.attachments) {
      const buffer = Buffer.from(att.base64, 'base64');
      try {
        const type = guessDocType(att.filename, body.subject);
        const { doc } = await saveDocument(ownerId, {
          buffer, filename: att.filename, mimeType: att.mimeType, title: att.filename, type, source: 'gmail',
        });
        attachmentsMeta.push({ filename: att.filename, mimeType: att.mimeType, size: buffer.length, documentId: String(doc._id) });
        if (type === 'statement' && att.mimeType === 'application/pdf') statementPdfs.push({ buffer, filename: att.filename, docId: String(doc._id) });
      } catch (err: any) {
        attachmentsMeta.push({ filename: att.filename, mimeType: att.mimeType, size: buffer.length });
        console.warn('Attachment not stored:', err?.message);
      }
    }

    const result = await ingestEmail({
      ownerId, source: 'gmail', sourceId: body.messageId, sender: body.from, subject: body.subject,
      receivedAt: body.date || new Date(), bodyText: body.bodyText, attachmentsMeta,
    });
    if (result.duplicate) { res.status(409).json({ error: 'already_ingested' }); return; }

    const statements: any[] = [];
    for (const pdf of statementPdfs) {
      const account = await accountForStatement(ownerId, body.from.toLowerCase(), pdf.filename, body.subject);
      if (!account) {
        await RawEvent.updateOne({ _id: result.rawEventId }, { $set: { status: 'needs_review', reviewReason: 'statement_email' } });
        continue;
      }
      try {
        const password = account.statementPasswordEnc ? decryptString(account.statementPasswordEnc) : undefined;
        const parsed = await parsePdfStatement(pdf.buffer, password);
        statements.push(await importStatement(ownerId, account, parsed, { format: 'pdf', fileDocId: pdf.docId as any }));
      } catch (err: any) {
        const needsPassword = err instanceof StatementParseError && err.code !== 'unreadable';
        await RawEvent.updateOne({ _id: result.rawEventId }, { $set: { status: 'needs_review', reviewReason: needsPassword ? 'statement_password_needed' : 'statement_email' } });
        if (needsPassword) {
          await raiseAlert(ownerId, {
            type: 'statement_password', title: `${account.name}: statement password needed`,
            body: 'Open Accounts in Tabby and save the statement password. Never reply to the bank email with it.',
            dedupeKey: `stmt-pass:${account._id}`, entity: { kind: 'account', id: String(account._id) },
          });
        }
      }
    }
    res.json({ success: true, ...result, statements });
  } catch (err: any) {
    console.error('Email ingest failed:', err);
    res.status(500).json({ error: 'Ingest failed' });
  }
});
