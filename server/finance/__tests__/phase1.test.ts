import request from 'supertest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { app, twoUsers, useTestDb, makeUser, as } from './helpers';
import { Account, Category } from '../models';
import { googleVerifier } from '../../routes/auth';

useTestDb();
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ALLOWED_EMAILS;
});

describe('finance auth', () => {
  it('requires a session', async () => {
    expect((await request(app).get('/api/finance/accounts')).status).toBe(401);
  });

  it('honours ALLOWED_EMAILS', async () => {
    process.env.ALLOWED_EMAILS = 'alice@example.com';
    const { a, b } = await twoUsers();
    expect((await a.api.get('/api/finance/accounts')).status).toBe(200);
    expect((await b.api.get('/api/finance/accounts')).status).toBe(403);
  });
});

describe('default categories', () => {
  it('are seeded on first Google sign-in, once', async () => {
    vi.spyOn(googleVerifier, 'verify').mockResolvedValue({ email: 'new@example.com', name: 'New' });
    const r1 = await request(app).post('/api/auth/google').send({ idToken: 'x' });
    await request(app).post('/api/auth/google').send({ idToken: 'y' });
    const ownerId = r1.body.user.id;
    const groceries = await Category.findOne({ ownerId, key: 'groceries' });
    expect(groceries).toBeTruthy();
    expect(await Category.countDocuments({ ownerId, parentId: groceries!._id })).toBe(9);
    const total = await Category.countDocuments({ ownerId });
    const again = await as(`Bearer ${r1.body.token}`).get('/api/finance/categories');
    expect(again.body.categories).toHaveLength(total);
  });
});

describe('ownership scoping', () => {
  it('keeps accounts and categories private to their owner', async () => {
    const { a, b } = await twoUsers();
    const created = await a.api.post('/api/finance/accounts').send({ name: 'Kotak savings', institution: 'kotak', last4: '9564' });
    expect(created.status).toBe(201);
    const id = created.body.account.id;

    expect((await b.api.get('/api/finance/accounts')).body.accounts).toHaveLength(0);
    expect((await b.api.patch(`/api/finance/accounts/${id}`).send({ name: 'hijack' })).status).toBe(404);
    expect((await b.api.put(`/api/finance/accounts/${id}/statement-password`).send({ password: 'x' })).status).toBe(404);
    await b.api.delete(`/api/finance/accounts/${id}`);
    expect(await Account.countDocuments({ _id: id })).toBe(1);

    const aCats = (await a.api.get('/api/finance/categories')).body.categories;
    const bCats = (await b.api.get('/api/finance/categories')).body.categories;
    const aIds = new Set(aCats.map((c: any) => c.id));
    expect(bCats.some((c: any) => aIds.has(c.id))).toBe(false);
    const res = await b.api.patch(`/api/finance/categories/${aCats[0].id}`).send({ name: 'mine' });
    expect(res.status).toBe(404);
  });
});

describe('accounts', () => {
  it('adds masked aliases and keeps the statement password write-only', async () => {
    const { api } = { api: as((await makeUser('owner')).auth) };
    const { body } = await api.post('/api/finance/accounts').send({ name: 'Kotak', last4: '9564' });
    expect(body.account.aliases).toContain('XX9564');
    const put = await api.put(`/api/finance/accounts/${body.account.id}/statement-password`).send({ password: 'PAN1234' });
    expect(put.body.account.statementPasswordEnc).toBeUndefined();
    expect(put.body.account.hasStatementPassword).toBe(true);
    const stored = await Account.findById(body.account.id);
    expect(stored!.statementPasswordEnc).not.toContain('PAN1234');
    const list = await api.get('/api/finance/accounts');
    expect(JSON.stringify(list.body)).not.toContain(stored!.statementPasswordEnc);
  });

  it('rejects invalid bodies with field errors', async () => {
    const api = as((await makeUser('owner')).auth);
    const res = await api.post('/api/finance/accounts').send({ name: '', last4: '12' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.details)).toEqual(expect.arrayContaining(['name', 'last4']));
  });
});

describe('rules and templates', () => {
  it('validate their bodies', async () => {
    const api = as((await makeUser('owner')).auth);
    expect((await api.post('/api/finance/rules').send({ match: {}, action: {} })).status).toBe(400);
    const cats = (await api.get('/api/finance/categories')).body.categories;
    const bad = await api.post('/api/finance/split-templates').send({ name: 'Kirana', parts: [{ categoryId: cats[1].id, percent: 60 }] });
    expect(bad.status).toBe(400);
    const ok = await api.post('/api/finance/split-templates').send({
      name: 'Kirana', parts: [{ categoryId: cats[1].id, percent: 60 }, { categoryId: cats[2].id, percent: 40 }],
    });
    expect(ok.status).toBe(201);
  });
});
