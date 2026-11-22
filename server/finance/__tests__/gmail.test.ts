import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, as, useTestDb, makeUser } from './helpers';
import { fixture } from './fixtures';
import { Account, GmailConnection, RawEvent, Transaction } from '../models';
import { ensureDefaultCategories } from '../services/categories';
import { decryptString } from '../lib/crypto';
import { extractBody, syncGmail } from '../services/gmail';

useTestDb();

const OWNER = 'gmailowner';
let api: ReturnType<typeof as>;
const kotak = fixture('F01'); // Kotak debit card spend

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Fake Google: token endpoint + Gmail API with the given messages. */
function fakeGoogle(messages: { id: string; from: string; subject: string; body: string; at: string }[], opts: { revoked?: boolean } = {}) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push(u);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.startsWith('https://oauth2.googleapis.com/token')) {
      const form = new URLSearchParams(String(init?.body));
      if (opts.revoked && form.get('grant_type') === 'refresh_token') return json({ error: 'invalid_grant' }, 400);
      return json({ access_token: 'at-1', refresh_token: 'rt-secret', scope: 'https://www.googleapis.com/auth/gmail.readonly openid', expires_in: 3600 });
    }
    if (u.startsWith('https://oauth2.googleapis.com/revoke')) return json({});
    if (u.endsWith('/users/me/profile')) return json({ emailAddress: 'owner@gmail.com' });
    if (u.includes('/users/me/messages?')) return json({ messages: messages.map((m) => ({ id: m.id })) });
    const m = u.match(/\/users\/me\/messages\/([^/?]+)\?format=full/);
    if (m) {
      const msg = messages.find((x) => x.id === m[1])!;
      return json({
        id: msg.id, internalDate: String(new Date(msg.at).getTime()),
        payload: {
          mimeType: 'multipart/alternative',
          headers: [{ name: 'From', value: msg.from }, { name: 'Subject', value: msg.subject }],
          parts: [{ mimeType: 'text/plain', body: { data: b64url(msg.body) } }],
        },
      });
    }
    return json({ error: 'unexpected ' + u }, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

beforeEach(async () => {
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  const u = await makeUser(OWNER, { name: 'Gmail Owner', email: 'owner@gmail.com' });
  api = as(u.auth);
  await ensureDefaultCategories(OWNER);
  await Account.create({ ownerId: OWNER, name: 'Kotak savings', institution: 'kotak', type: 'savings', last4: '9564', cardLast4s: ['2797'], aliases: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_CLIENT_SECRET;
});

async function connect() {
  const start = await api.post('/api/finance/gmail/connect');
  expect(start.status).toBe(200);
  const url = new URL(start.body.url);
  const state = url.searchParams.get('state')!;
  const res = await request(app).get('/api/finance/gmail/callback').query({ code: 'auth-code', state });
  return { url, res };
}

describe('Connect Gmail', () => {
  it('asks Google for read-only Gmail with offline access', async () => {
    const res = await api.post('/api/finance/gmail/connect');
    const url = new URL(res.body.url);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/gmail.readonly');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('redirect_uri')).toMatch(/\/api\/finance\/gmail\/callback$/);
    expect(url.searchParams.get('login_hint')).toBe('owner@gmail.com');
  });

  it('stores an encrypted refresh token and imports bank emails', async () => {
    fakeGoogle([{ id: 'm1', from: kotak.sender, subject: kotak.subject, body: kotak.bodyText, at: kotak.receivedAt }]);
    const { res } = await connect();
    expect(res.status).toBe(200);
    expect(res.text).toContain('Gmail connected');

    const conn = await GmailConnection.findOne({ ownerId: OWNER });
    expect(conn!.email).toBe('owner@gmail.com');
    expect(conn!.refreshTokenEnc).not.toContain('rt-secret');
    expect(decryptString(conn!.refreshTokenEnc)).toBe('rt-secret');

    const sync = await syncGmail(OWNER);
    expect(sync).toMatchObject({ remaining: 0 });
    expect(await RawEvent.countDocuments({ ownerId: OWNER, source: 'gmail', sourceId: 'm1' })).toBe(1);
    expect(await Transaction.countDocuments({ ownerId: OWNER })).toBe(1);

    // Status never leaks the token.
    const status = await api.get('/api/finance/gmail');
    expect(status.body).toMatchObject({ connected: true, email: 'owner@gmail.com' });
    expect(JSON.stringify(status.body)).not.toContain('rt-secret');
    expect(JSON.stringify(status.body)).not.toContain('refreshTokenEnc');
  });

  it('does not import the same email twice (shares ids with the Apps Script push)', async () => {
    fakeGoogle([{ id: 'm1', from: kotak.sender, subject: kotak.subject, body: kotak.bodyText, at: kotak.receivedAt }]);
    await connect();
    await syncGmail(OWNER);
    const again = await api.post('/api/finance/gmail/sync');
    expect(again.body).toMatchObject({ imported: 0 });
    expect(await Transaction.countDocuments({ ownerId: OWNER })).toBe(1);
  });

  it('rejects a forged or expired state', async () => {
    fakeGoogle([]);
    const res = await request(app).get('/api/finance/gmail/callback').query({ code: 'x', state: 'not-a-real-state' });
    expect(res.status).toBe(400);
    expect(await GmailConnection.countDocuments({})).toBe(0);
  });

  it('reports revoked access instead of failing silently', async () => {
    fakeGoogle([], { revoked: false });
    await connect();
    await syncGmail(OWNER); // let the first background import finish
    fakeGoogle([], { revoked: true });
    const r = await syncGmail(OWNER);
    expect(r.error).toMatch(/Connect Gmail again/);
    const status = await api.get('/api/finance/gmail');
    expect(status.body.lastError).toMatch(/Connect Gmail again/);
  });

  it('disconnect revokes and forgets the token', async () => {
    const calls = fakeGoogle([]);
    await connect();
    const res = await api.delete('/api/finance/gmail');
    expect(res.status).toBe(200);
    expect(await GmailConnection.countDocuments({ ownerId: OWNER })).toBe(0);
    expect(calls.some((c) => c.startsWith('https://oauth2.googleapis.com/revoke'))).toBe(true);
  });

  it('explains when the server is not set up', async () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    const res = await api.post('/api/finance/gmail/connect');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/GOOGLE_CLIENT_SECRET/);
  });
});

describe('extractBody', () => {
  it('prefers text/plain and falls back to HTML', () => {
    expect(extractBody({ parts: [{ mimeType: 'text/html', body: { data: b64url('<b>hi</b>') } }, { mimeType: 'text/plain', body: { data: b64url('hi') } }] })).toBe('hi');
    expect(extractBody({ parts: [{ mimeType: 'text/html', body: { data: b64url('<b>hi</b>') } }] })).toBe('<b>hi</b>');
  });
});
