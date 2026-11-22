import jwt from 'jsonwebtoken';
import { GmailConnection, IGmailConnection, RawEvent } from '../models';
import { decryptString, encryptString, isEncryptionConfigured } from '../lib/crypto';
import { jwtSecret } from '../../middleware/auth';
import { processGmailEmail, GmailEmail } from './ingest/gmailEmail';

// "Connect Gmail": read-only Gmail access through Google OAuth. The server
// keeps an encrypted refresh token and pulls money emails itself (on demand,
// when the app opens, and from the scheduled jobs), so no Apps Script is
// needed. Messages go through the same pipeline as the Apps Script push and
// share its dedupe key (source 'gmail' + message id), so both can coexist.

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const DEFAULT_WEB_CLIENT_ID = '888676247797-cn7buordb6vqmd7qm6a35u8n6smievcr.apps.googleusercontent.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** First sync looks back this far. */
export const GMAIL_BACKFILL_DAYS = 90;
/** Messages fully processed per sync run; the rest continue next run. */
const PER_RUN = 150;
const MAX_IDS = 2000;
const MAX_BODY_CHARS = 100 * 1024;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_TYPES = /^(application\/pdf|image\/(jpeg|png|heic))$/i;

const MONEY_WORDS = '(debited OR credited OR paid OR payment OR refund OR refunded OR reversal OR invoice OR receipt OR order OR premium OR EMI OR installment OR "Rs." OR INR OR ₹ OR transaction OR statement OR policy OR renewal OR SIP OR subscription)';

export class GmailError extends Error {
  constructor(message: string, public code: 'not_configured' | 'no_encryption' | 'revoked' | 'google' | 'bad_state') {
    super(message);
  }
}

function clientId(): string {
  return process.env.GOOGLE_WEB_CLIENT_ID || DEFAULT_WEB_CLIENT_ID;
}

export function gmailConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_SECRET) && isEncryptionConfigured();
}

function assertConfigured(): void {
  if (!process.env.GOOGLE_CLIENT_SECRET) {
    throw new GmailError('Gmail connect is not set up on the server yet (GOOGLE_CLIENT_SECRET).', 'not_configured');
  }
  if (!isEncryptionConfigured()) {
    throw new GmailError('Set DATA_ENCRYPTION_KEY on the server before connecting Gmail.', 'no_encryption');
  }
}

// ---------------------------------------------------------------- OAuth

interface StatePayload { sub: string; purpose: 'gmail'; redirectUri: string }

/** Google consent URL. `state` carries who is connecting, signed and valid for 15 minutes. */
export function gmailAuthUrl(userId: string, redirectUri: string, loginHint?: string): string {
  assertConfigured();
  const state = jwt.sign({ sub: userId, purpose: 'gmail', redirectUri } satisfies StatePayload, jwtSecret(), { expiresIn: '15m' });
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPE,
    access_type: 'offline',
    // Always show consent so Google returns a refresh token every time.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function readState(state: string): StatePayload {
  try {
    const p = jwt.verify(state, jwtSecret()) as StatePayload;
    if (p.purpose !== 'gmail' || !p.sub || !p.redirectUri) throw new Error('bad');
    return p;
  } catch {
    throw new GmailError('This Gmail link expired. Start again from Tabby.', 'bad_state');
  }
}

async function tokenRequest(params: Record<string, string>): Promise<any> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), client_secret: process.env.GOOGLE_CLIENT_SECRET || '', ...params }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data?.error === 'invalid_grant') throw new GmailError('Gmail access was removed or has expired. Connect Gmail again.', 'revoked');
    throw new GmailError(`Google refused the request (${data?.error || res.status}).`, 'google');
  }
  return data;
}

/** Exchanges the consent code, stores the connection and returns it. */
export async function completeGmailConnect(userId: string, code: string, redirectUri: string): Promise<IGmailConnection> {
  assertConfigured();
  const tok = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri });
  if (!String(tok.scope || '').includes(GMAIL_SCOPE)) {
    throw new GmailError('Tabby needs permission to read Gmail. Tick the Gmail box on Google\'s screen and try again.', 'google');
  }
  if (!tok.refresh_token) throw new GmailError('Google did not return offline access. Try connecting again.', 'google');
  const profile = await gmailGet<{ emailAddress: string }>(tok.access_token, '/profile');
  const conn = await GmailConnection.findOneAndUpdate(
    { ownerId: userId },
    {
      $set: {
        email: profile.emailAddress || '', refreshTokenEnc: encryptString(tok.refresh_token), scope: tok.scope || GMAIL_SCOPE,
        connectedAt: new Date(), lastError: '', lastErrorAt: null,
      },
      $setOnInsert: { syncedUntil: null, lastSyncAt: null, imported: 0 },
    },
    { upsert: true, returnDocument: 'after' },
  );
  return conn as IGmailConnection;
}

export async function disconnectGmail(userId: string): Promise<void> {
  const conn = await GmailConnection.findOne({ ownerId: userId });
  if (!conn) return;
  try {
    const token = decryptString(conn.refreshTokenEnc);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' });
  } catch {
    // Revoking is best effort; the local token is deleted either way.
  }
  await GmailConnection.deleteOne({ _id: conn._id });
}

// ---------------------------------------------------------------- Gmail API

async function gmailGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) throw new GmailError('Gmail access was removed or has expired. Connect Gmail again.', 'revoked');
  if (!res.ok) throw new GmailError(`Gmail API error ${res.status}`, 'google');
  return res.json() as Promise<T>;
}

interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
}
interface GmailMessage { id: string; internalDate?: string; payload?: GmailPart }

function b64url(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function header(part: GmailPart | undefined, name: string): string {
  return part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

/** Plain text if the email has it, otherwise its HTML (the pipeline converts HTML to text). */
export function extractBody(payload: GmailPart | undefined): string {
  let plain = '';
  let html = '';
  const walk = (p: GmailPart | undefined) => {
    if (!p) return;
    const type = (p.mimeType || '').toLowerCase();
    if (!p.filename && p.body?.data) {
      if (type === 'text/plain' && !plain) plain = b64url(p.body.data).toString('utf8');
      else if (type === 'text/html' && !html) html = b64url(p.body.data).toString('utf8');
    }
    p.parts?.forEach(walk);
  };
  walk(payload);
  return (plain.trim() ? plain : html).slice(0, MAX_BODY_CHARS);
}

function attachmentParts(payload: GmailPart | undefined): GmailPart[] {
  const out: GmailPart[] = [];
  const walk = (p: GmailPart | undefined) => {
    if (!p) return;
    if (p.filename && p.body?.attachmentId && ATTACHMENT_TYPES.test(p.mimeType || '') && (p.body.size || 0) <= MAX_ATTACHMENT_BYTES) out.push(p);
    p.parts?.forEach(walk);
  };
  walk(payload);
  return out;
}

async function listIds(accessToken: string, q: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ q, maxResults: '500' });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await gmailGet<{ messages?: { id: string }[]; nextPageToken?: string }>(accessToken, `/messages?${params}`);
    (page.messages || []).forEach((m) => ids.push(m.id));
    pageToken = page.nextPageToken || '';
  } while (pageToken && ids.length < MAX_IDS);
  return ids;
}

// ---------------------------------------------------------------- sync

export interface GmailSyncResult { checked: number; imported: number; remaining: number; error?: string }

const running = new Map<string, Promise<GmailSyncResult>>();

/** Pulls new money emails for one user. Concurrent calls share one run. */
export function syncGmail(userId: string, now = new Date()): Promise<GmailSyncResult> {
  let p = running.get(userId);
  if (!p) {
    p = runSync(userId, now).finally(() => running.delete(userId));
    running.set(userId, p);
  }
  return p;
}

async function runSync(userId: string, now: Date): Promise<GmailSyncResult> {
  const conn = await GmailConnection.findOne({ ownerId: userId });
  if (!conn) return { checked: 0, imported: 0, remaining: 0, error: 'not_connected' };
  try {
    assertConfigured();
    const { access_token: accessToken } = await tokenRequest({ refresh_token: decryptString(conn.refreshTokenEnc), grant_type: 'refresh_token' });

    // A day of overlap catches late-arriving mail; repeats are skipped by id.
    const from = conn.syncedUntil
      ? new Date(conn.syncedUntil.getTime() - 86_400_000)
      : new Date(now.getTime() - GMAIL_BACKFILL_DAYS * 86_400_000);
    const after = Math.floor(from.getTime() / 1000);
    const queries = [
      `after:${after} -category:promotions -category:social ${MONEY_WORDS}`,
      `after:${after} has:attachment filename:pdf (statement OR invoice OR policy OR receipt)`,
    ];
    const seen = new Set<string>();
    for (const q of queries) for (const id of await listIds(accessToken, q)) seen.add(id);

    // Skip what's already in Tabby (from earlier runs or the Apps Script).
    const ids = [...seen];
    const done = new Set((await RawEvent.find({ ownerId: userId, source: 'gmail', sourceId: { $in: ids } }, { sourceId: 1 })).map((r) => r.sourceId));
    const todo = ids.filter((id) => !done.has(id));

    // Gmail lists newest first; import oldest first. A run handles at most
    // PER_RUN messages; the window only moves forward once it is empty, and
    // finished messages are skipped above, so nothing is ever missed.
    const batch = todo.reverse().slice(0, PER_RUN);
    let imported = 0;
    for (const id of batch) {
      const msg = await gmailGet<GmailMessage>(accessToken, `/messages/${id}?format=full`);
      const out = await processGmailEmail(userId, await toEmail(accessToken, msg));
      if (out.duplicate !== true) imported += 1;
    }
    const remaining = todo.length - batch.length;
    const syncedUntil = remaining > 0 ? conn.syncedUntil : now;

    await GmailConnection.updateOne({ _id: conn._id }, {
      $set: { lastSyncAt: now, syncedUntil, lastError: '', lastErrorAt: null },
      $inc: { imported },
    });
    return { checked: ids.length, imported, remaining };
  } catch (err: any) {
    const message = err instanceof GmailError ? err.message : 'Gmail sync failed. It will try again later.';
    if (!(err instanceof GmailError)) console.error('Gmail sync failed:', err);
    await GmailConnection.updateOne({ _id: conn._id }, { $set: { lastError: message, lastErrorAt: now, lastSyncAt: now } });
    return { checked: 0, imported: 0, remaining: 0, error: message };
  }
}

async function toEmail(accessToken: string, msg: GmailMessage): Promise<GmailEmail> {
  const attachments: GmailEmail['attachments'] = [];
  for (const part of attachmentParts(msg.payload)) {
    const att = await gmailGet<{ data: string }>(accessToken, `/messages/${msg.id}/attachments/${part.body!.attachmentId}`);
    attachments.push({ filename: part.filename!, mimeType: part.mimeType || 'application/octet-stream', base64: b64url(att.data).toString('base64') });
  }
  const internal = Number(msg.internalDate);
  return {
    messageId: msg.id,
    from: header(msg.payload, 'From'),
    subject: header(msg.payload, 'Subject'),
    date: Number.isFinite(internal) && internal > 0 ? new Date(internal) : new Date(),
    bodyText: extractBody(msg.payload),
    attachments,
  };
}

/** Scheduled job: sync every connected Gmail. */
export async function syncAllGmail(now = new Date()): Promise<{ users: number; imported: number; errors: number }> {
  let imported = 0;
  let errors = 0;
  const conns = await GmailConnection.find({}, { ownerId: 1 });
  for (const c of conns) {
    const r = await syncGmail(c.ownerId, now);
    imported += r.imported;
    if (r.error) errors += 1;
  }
  return { users: conns.length, imported, errors };
}
