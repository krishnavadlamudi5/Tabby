import { Account, FinDocument, IAccount, RawEvent, Transaction } from '../../models';
import { decryptString } from '../../lib/crypto';
import { saveDocument } from '../storage/documents';
import { parsePdfStatement, StatementParseError } from '../statements/parse';
import { importStatement } from '../statements/importStatement';
import { raiseAlert } from '../alerts';
import { filePolicy } from '../insurance/filePolicy';
import { ingestEmail, IngestResult } from './pipeline';

/** One Gmail message, from the Apps Script push or the Gmail API connection. */
export interface GmailEmail {
  messageId: string;
  from: string;
  subject: string;
  date?: Date;
  bodyText: string;
  attachments: { filename: string; mimeType: string; base64: string }[];
}

export type GmailEmailOutcome =
  | { duplicate: true }
  | { duplicate?: false; result: IngestResult; policy: { id: string; created: boolean } | null; statements: any[] };

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

/**
 * Stores a Gmail message's attachments, runs it through the ledger, links
 * invoices, files insurance policies and imports attached statements.
 * Idempotent per message id.
 */
export async function processGmailEmail(ownerId: string, body: GmailEmail): Promise<GmailEmailOutcome> {

  if (await RawEvent.exists({ ownerId, source: 'gmail', sourceId: body.messageId })) return { duplicate: true };

  // Attachments go straight to encrypted storage as documents.
  const attachmentsMeta: { filename: string; mimeType: string; size: number; documentId?: string }[] = [];
  const statementPdfs: { buffer: Buffer; filename: string; docId: string }[] = [];
  const otherPdfs: { buffer: Buffer; documentId: string; type: string }[] = [];
  for (const att of body.attachments) {
    const buffer = Buffer.from(att.base64, 'base64');
    try {
      const type = guessDocType(att.filename, body.subject);
      const { doc } = await saveDocument(ownerId, {
        buffer, filename: att.filename, mimeType: att.mimeType, title: att.filename, type, source: 'gmail',
      });
      attachmentsMeta.push({ filename: att.filename, mimeType: att.mimeType, size: buffer.length, documentId: String(doc._id) });
      if (type === 'statement' && att.mimeType === 'application/pdf') statementPdfs.push({ buffer, filename: att.filename, docId: String(doc._id) });
      else if (att.mimeType === 'application/pdf') otherPdfs.push({ buffer, documentId: String(doc._id), type });
    } catch (err: any) {
      attachmentsMeta.push({ filename: att.filename, mimeType: att.mimeType, size: buffer.length });
      console.warn('Attachment not stored:', err?.message);
    }
  }

  const result = await ingestEmail({
    ownerId, source: 'gmail', sourceId: body.messageId, sender: body.from, subject: body.subject,
    receivedAt: body.date || new Date(), bodyText: body.bodyText, attachmentsMeta,
  });
  if (result.duplicate) return { duplicate: true };

  // Invoices attached to an order/payment email belong to that payment.
  if (result.transactionIds.length && otherPdfs.length && result.detectedType !== 'policy') {
    const txnId = result.transactionIds[0];
    for (const p of otherPdfs) {
      await FinDocument.updateOne(
        { _id: p.documentId, ownerId, 'linkedTo.id': { $ne: txnId } },
        { $push: { linkedTo: { kind: 'transaction', id: txnId } }, ...(p.type === 'other' ? { $set: { type: 'invoice' } } : {}) },
      );
      await Transaction.updateOne({ _id: txnId, ownerId }, { $addToSet: { attachmentDocIds: p.documentId } });
    }
  }

  // Insurance emails: file the policy automatically (with its PDF).
  let policy: { id: string; created: boolean } | null = null;
  const policyPdfs = otherPdfs.filter((p) => p.type === 'policy' || result.detectedType === 'policy');
  if (result.detectedType === 'policy' || policyPdfs.length) {
    const filed = await filePolicy(ownerId, result.rawEventId, {
      sender: body.from, subject: body.subject, bodyText: body.bodyText, receivedAt: body.date || new Date(),
      pdfs: policyPdfs.map((p) => ({ buffer: p.buffer, documentId: p.documentId })),
    });
    if (filed.policy) policy = { id: String(filed.policy._id), created: filed.created };
  }

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
  return { result, policy, statements };
}
