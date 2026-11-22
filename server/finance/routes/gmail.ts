import { Router, Request, Response } from 'express';
import { User } from '../../models/User';
import { GmailConnection } from '../models';
import { handler } from '../lib/http';
import type { AuthedRequest } from '../../middleware/auth';
import {
  GMAIL_BACKFILL_DAYS, GmailError, completeGmailConnect, disconnectGmail, gmailAuthUrl, gmailConfigured, readState, syncGmail,
} from '../services/gmail';

/** Where Google sends the user back. Must be listed on the OAuth web client. */
function redirectUri(req: Request): string {
  if (process.env.GMAIL_REDIRECT_URI) return process.env.GMAIL_REDIRECT_URI;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0].trim();
  return `${proto}://${req.get('host')}/api/finance/gmail/callback`;
}

// ---------------------------------------------------------------- signed-in user (/api/finance/gmail)

export const gmailRouter = Router();

// GET /api/finance/gmail - connection status (never the token)
gmailRouter.get('/', handler(async (req: AuthedRequest, res) => {
  const conn = await GmailConnection.findOne({ ownerId: req.userId });
  res.json({
    success: true,
    available: gmailConfigured(),
    connected: Boolean(conn),
    email: conn?.email || null,
    connectedAt: conn?.connectedAt || null,
    lastSyncAt: conn?.lastSyncAt || null,
    imported: conn?.imported || 0,
    lastError: conn?.lastError || null,
    backfillDays: GMAIL_BACKFILL_DAYS,
  });
}));

// POST /api/finance/gmail/connect -> { url } to open in a browser
gmailRouter.post('/connect', handler(async (req: AuthedRequest, res) => {
  try {
    const user = await User.findOne({ id: req.userId });
    res.json({ success: true, url: gmailAuthUrl(req.userId!, redirectUri(req), user?.email) });
  } catch (err) {
    if (err instanceof GmailError) { res.status(503).json({ error: err.message, code: err.code }); return; }
    throw err;
  }
}));

// POST /api/finance/gmail/sync - import new emails now
gmailRouter.post('/sync', handler(async (req: AuthedRequest, res) => {
  const result = await syncGmail(req.userId!);
  if (result.error === 'not_connected') { res.status(404).json({ error: 'Gmail is not connected.' }); return; }
  res.json({ success: !result.error, ...result });
}));

// DELETE /api/finance/gmail - revoke access and forget the token
gmailRouter.delete('/', handler(async (req: AuthedRequest, res) => {
  await disconnectGmail(req.userId!);
  res.json({ success: true });
}));

// ---------------------------------------------------------------- Google redirect (public)

export const gmailCallbackRouter = Router();

function page(title: string, message: string, ok: boolean): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F8F5F2;font-family:system-ui,-apple-system,sans-serif;color:#2C2B29;padding:16px;box-sizing:border-box}
.card{background:#fff;border:1px solid #E6E1DA;border-radius:20px;padding:28px 24px;max-width:360px;text-align:center}
.icon{width:48px;height:48px;border-radius:14px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:24px;background:${ok ? '#EBF1ED;color:#3C5A48' : '#FDF3F0;color:#C86D51'}}
h1{font-size:18px;margin:0 0 8px}p{font-size:14px;line-height:1.5;color:#736F6A;margin:0}</style></head>
<body><div class="card"><div class="icon">${ok ? '&#10003;' : '!'}</div><h1>${esc(title)}</h1><p>${esc(message)}</p></div>
<script>setTimeout(function(){try{window.close()}catch(e){}},2500)</script></body></html>`;
}

// GET /api/finance/gmail/callback?code&state - Google's redirect after consent
gmailCallbackRouter.get('/', async (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  const { code, state, error } = req.query as Record<string, string | undefined>;
  if (error) {
    res.status(400).send(page('Gmail not connected', error === 'access_denied' ? 'You cancelled on Google\'s screen. You can connect any time from Tabby.' : `Google said: ${error}`, false));
    return;
  }
  try {
    if (!code || !state) throw new GmailError('This link is incomplete. Start again from Tabby.', 'bad_state');
    const { sub, redirectUri: uri } = readState(state);
    const conn = await completeGmailConnect(sub, code, uri);
    // First import runs in the background; the app shows progress.
    void syncGmail(sub).catch((err) => console.error('First Gmail sync failed:', err));
    res.send(page('Gmail connected', `${conn.email || 'Your Gmail'} is linked. Tabby is importing your bank emails now. You can go back to the app.`, true));
  } catch (err: any) {
    if (!(err instanceof GmailError)) console.error('Gmail connect failed:', err);
    res.status(400).send(page('Gmail not connected', err instanceof GmailError ? err.message : 'Something went wrong. Please try again from Tabby.', false));
  }
});
