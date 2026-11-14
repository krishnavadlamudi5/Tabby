import request from 'supertest';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { app, as, useTestDb, makeUser } from './helpers';
import { Account, Alert, Category, Commitment, FinDocument, Policy, Transaction } from '../models';
import { Group } from '../../models/Group';
import { ensureDefaultCategories } from '../services/categories';
import { getFileStore, MemoryStore, setFileStore } from '../services/storage/fileStore';
import { renewalReminders } from '../services/jobs/reminders';
import { commitmentWatch, recurringSuggestions } from '../services/commitments';
import { User } from '../../models/User';

useTestDb();

let api: ReturnType<typeof as>;
let other: ReturnType<typeof as>;
let kotak: any;

beforeEach(async () => {
  setFileStore(new MemoryStore());
  const u = await makeUser('owner', { name: 'Test Owner', friendIds: ['pal'] });
  await makeUser('pal', { name: 'Pal', friendIds: ['owner'] });
  const o = await makeUser('stranger');
  api = as(u.auth);
  other = as(o.auth);
  await ensureDefaultCategories('owner');
  kotak = await Account.create({ ownerId: 'owner', name: 'Kotak', institution: 'kotak', last4: '9564' });
});
afterEach(() => {
  delete process.env.JOBS_SECRET;
});

async function txn(fields: Record<string, any>) {
  return Transaction.create({
    ownerId: 'owner', accountId: kotak._id, postedAt: new Date('2026-11-12T06:00:00Z'), amountPaise: 100000, direction: 'debit',
    kind: 'expense', status: 'settled', merchant: 'Shop', ...fields,
  });
}
const cat = (key: string) => Category.findOne({ ownerId: 'owner', key }).then((c) => String(c!._id));

describe('Phase 4: splits', () => {
  it('validates that parts add up and supports percent and templates with exact paise', async () => {
    const t = await txn({ amountPaise: 100001 });
    const [veg, staples, snacks] = await Promise.all([cat('groceries.vegetables'), cat('groceries.staples'), cat('groceries.snacks')]);
    const bad = await api.put(`/api/finance/transactions/${t._id}/splits`).send({ mode: 'amounts', parts: [{ categoryId: veg, amountPaise: 50000 }, { categoryId: staples, amountPaise: 50000 }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain('add up');

    const ok = await api.put(`/api/finance/transactions/${t._id}/splits`).send({ mode: 'amounts', parts: [{ categoryId: veg, amountPaise: 50001 }, { categoryId: staples, amountPaise: 50000 }] });
    expect(ok.status).toBe(200);

    const pct = await api.put(`/api/finance/transactions/${t._id}/splits`).send({ mode: 'percent', parts: [{ categoryId: staples, percent: 60 }, { categoryId: veg, percent: 25 }, { categoryId: snacks, percent: 15 }] });
    const amounts = pct.body.transaction.splits.map((s: any) => s.amountPaise);
    expect(amounts.reduce((a: number, b: number) => a + b, 0)).toBe(100001);
    expect(amounts[0]).toBe(60001);

    const tpl = await api.post('/api/finance/split-templates').send({ name: 'Monthly kirana', parts: [{ categoryId: staples, percent: 60 }, { categoryId: veg, percent: 40 }] });
    const byTpl = await api.put(`/api/finance/transactions/${t._id}/splits`).send({ mode: 'template', templateId: tpl.body.template.id });
    expect(byTpl.body.transaction.splits).toHaveLength(2);

    const foreign = await other.put(`/api/finance/transactions/${t._id}/splits`).send({ mode: 'clear' });
    expect(foreign.status).toBe(404);
  });

  it('sharing a payment creates a Tabby expense that shows in the friend\'s balances', async () => {
    const t = await txn({ amountPaise: 120000, merchant: 'Dinner place' });
    const res = await api.post(`/api/finance/transactions/${t._id}/share`).send({
      description: 'Dinner', splitMethod: 'equally', splits: [{ userId: 'owner', amount: 600 }, { userId: 'pal', amount: 600 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.transaction.mySharePaise).toBe(60000);
    const palAuth = `Bearer ${(await import('../../middleware/auth')).signToken('pal', 'pal@example.com')}`;
    const palSync = await request(app).get('/api/sync/me').set('Authorization', palAuth);
    expect(palSync.body.expenses.map((e: any) => e.description)).toContain('Dinner');
    // My spend counts only my share
    const list = await api.get('/api/finance/transactions?month=2026-11');
    expect(list.body.totals.spendPaise).toBe(60000);
    // Can't share with a stranger
    const t2 = await txn({ amountPaise: 2000 });
    const bad = await api.post(`/api/finance/transactions/${t2._id}/share`).send({ description: 'x', splits: [{ userId: 'owner', amount: 10 }, { userId: 'stranger', amount: 10 }] });
    expect(bad.status).toBe(400);
  });
});

describe('Phase 5: document vault', () => {
  it('stores files encrypted, downloads the original for the owner only, dedupes by hash', async () => {
    const pdf = Buffer.from('%PDF-1.4 Care Health policy schedule 123');
    const up = await api.post('/api/finance/documents').field('type', 'policy').field('title', 'Care policy')
      .attach('file', pdf, { filename: 'care.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    const id = up.body.document.id;
    expect(up.body.document.storageKey).toBeUndefined();

    const stored = (getFileStore() as MemoryStore).files;
    const blob = Array.from(stored.values())[0];
    expect(blob.includes(Buffer.from('Care Health'))).toBe(false);

    const dl = await api.get(`/api/finance/documents/${id}/download`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(dl.status).toBe(200);
    expect(Buffer.compare(dl.body, pdf)).toBe(0);
    expect(dl.headers['content-disposition']).toContain('care.pdf');

    expect((await other.get(`/api/finance/documents/${id}/download`)).status).toBe(404);
    const again = await api.post('/api/finance/documents').attach('file', pdf, { filename: 'copy.pdf', contentType: 'application/pdf' });
    expect(again.body.existed).toBe(true);
    expect(await FinDocument.countDocuments()).toBe(1);

    const exe = await api.post('/api/finance/documents').attach('file', Buffer.from('MZ'), { filename: 'x.exe', contentType: 'application/x-msdownload' });
    expect(exe.status).toBe(400);

    await api.delete(`/api/finance/documents/${id}`);
    expect(stored.size).toBe(0);
  });
});

describe('Phase 5: policies', () => {
  it('files a policy with members, links premiums, tracks a premium commitment, tax view', async () => {
    const me = await api.post('/api/finance/people').send({ name: 'Test Owner', relation: 'self' });
    const premium = await txn({ amountPaise: 2450000, merchant: 'CARE HEALTH INSURANCE LTD', postedAt: new Date('2026-06-10T06:00:00Z') });
    const res = await api.post('/api/finance/policies').send({
      insurer: 'Care Health Insurance', policyNumber: 'CH-1', type: 'health', planName: 'Care Supreme',
      insuredMemberIds: [me.body.person.id], sumInsuredPaise: 10_00_000_00, premiumPaise: 2450000, premiumFrequency: 'yearly',
      renewalDate: '2027-06-12', taxSection: '80D',
    });
    expect(res.status).toBe(201);
    expect(res.body.policy.premiumTransactionIds).toEqual([String(premium._id)]);
    expect((await Transaction.findById(premium._id))!.categoryId!.toString()).toBe(await cat('insurance'));
    const c = await Commitment.findOne({ ownerId: 'owner', type: 'premium' });
    expect(c!.amountPaise).toBe(2450000);

    const detail = await api.get(`/api/finance/policies/${res.body.policy.id}`);
    expect(detail.body.members[0].name).toBe('Test Owner');
    expect(detail.body.premiums).toHaveLength(1);

    const tax = await api.get('/api/finance/policies/tax?fy=2026-27');
    expect(tax.body.totals['80D']).toBe(2450000);

    const claim = await api.post('/api/finance/claims').send({ policyId: res.body.policy.id, date: '2026-11-01', reason: 'Hospitalisation', claimedPaise: 5000000 });
    expect(claim.status).toBe(201);
    expect((await other.get(`/api/finance/policies/${res.body.policy.id}`)).status).toBe(404);
  });

  it('renewal reminders fire at 30, 7 and 1 days, once each', async () => {
    await Policy.create({ ownerId: 'owner', insurer: 'Care Health', premiumPaise: 2450000, renewalDate: new Date('2026-12-14T18:30:00Z') });
    const day = (iso: string) => new Date(iso);
    expect(await renewalReminders(day('2026-11-10T03:00:00Z'))).toBe(0);
    expect(await renewalReminders(day('2026-11-15T03:00:00Z'))).toBe(1); // 30 days
    expect(await renewalReminders(day('2026-11-16T03:00:00Z'))).toBe(0); // same step, no repeat
    expect(await renewalReminders(day('2026-12-08T03:00:00Z'))).toBe(1); // 7 days
    expect(await renewalReminders(day('2026-12-14T03:00:00Z'))).toBe(1); // 1 day
    const alerts = await Alert.find({ ownerId: 'owner', type: 'renewal' }).sort({ createdAt: 1 });
    expect(alerts.map((a) => a.title)).toEqual(['Care Health policy renews in 30 days', 'Care Health policy renews in 7 days', 'Care Health policy renews in 1 day']);
    expect((await Policy.findOne({ ownerId: 'owner' }))!.status).toBe('renewal_due');
  });
});

describe('Phase 6: trips', () => {
  it('sets dates and budget, suggests payments in the window, and summarises', async () => {
    await Group.create({ id: 'trip-goa', name: 'Goa', category: 'trip', members: ['owner', 'pal'] });
    await Group.create({ id: 'not-mine', name: 'Other', category: 'trip', members: ['stranger'] });
    const set = await api.patch('/api/finance/trips/trip-goa').send({ startDate: '2026-11-20', endDate: '2026-11-23', budgetPaise: 3000000 });
    expect(set.status).toBe(200);
    expect(set.body.group).toMatchObject({ startDate: '2026-11-20', endDate: '2026-11-23', budgetPaise: 3000000 });
    expect((await api.patch('/api/finance/trips/not-mine').send({ budgetPaise: 1 })).status).toBe(404);

    const inTrip = await txn({ postedAt: new Date('2026-11-21T08:00:00Z'), amountPaise: 450000, merchant: 'Goa Resort' });
    await txn({ postedAt: new Date('2026-11-02T08:00:00Z'), amountPaise: 1000 });
    const view = await api.get('/api/finance/trips/trip-goa');
    expect(view.body.suggestions.map((t: any) => t.id)).toEqual([String(inTrip._id)]);

    await api.patch(`/api/finance/transactions/${inTrip._id}`).send({ tripId: 'trip-goa' });
    await request(app).post('/api/expenses').set('Authorization', (await makeUserAuth('owner')))
      .send({ id: 'e1', description: 'Cab', amount: 1000, paidBy: 'pal', groupId: 'trip-goa', splits: [{ userId: 'owner', amount: 500 }, { userId: 'pal', amount: 500 }] });
    const after = await api.get('/api/finance/trips/trip-goa');
    expect(after.body.summary).toMatchObject({ totalPaise: 550000, myPersonalPaise: 450000, sharedPaise: 100000, remainingPaise: 2450000 });
    expect((await api.patch(`/api/finance/transactions/${inTrip._id}`).send({ tripId: 'not-mine' })).status).toBe(400);
  });
});

async function makeUserAuth(id: string) {
  const { signToken } = await import('../../middleware/auth');
  const u = await User.findOne({ id });
  return `Bearer ${signToken(id, u!.email)}`;
}

describe('Phase 7: commitments, dashboard, alerts, jobs', () => {
  it('commitment status engine: paid rolls the due date; no payment -> missed with an alert', async () => {
    const emi = await Commitment.create({ ownerId: 'owner', type: 'emi', name: 'Kotak loan', amountPaise: 3409800, schedule: { freq: 'monthly', dayOfMonth: 10, nextDueDate: new Date('2026-11-09T18:30:00Z') } });
    const rent = await Commitment.create({ ownerId: 'owner', type: 'rent', name: 'Rent', amountPaise: 2500000, matchRule: { merchantContains: 'landlord', tolerancePct: 0 }, schedule: { freq: 'monthly', dayOfMonth: 5, nextDueDate: new Date('2026-11-04T18:30:00Z') } });
    await txn({ amountPaise: 3409800, postedAt: new Date('2026-11-10T04:00:00Z'), merchant: 'NACH KOTAK LOAN' });
    const r = await commitmentWatch(new Date('2026-11-14T03:00:00Z'));
    expect(r).toEqual({ paid: 1, missed: 1 });
    const e = await Commitment.findById(emi._id);
    expect(e!.status).toBe('paid');
    expect(e!.schedule.nextDueDate.toISOString()).toBe('2026-12-09T18:30:00.000Z');
    expect((await Commitment.findById(rent._id))!.status).toBe('missed');
    expect(await Alert.countDocuments({ ownerId: 'owner', type: 'commitment_missed' })).toBe(1);
  });

  it('suggests recurring payments seen in 2 of the last 3 months', async () => {
    for (const m of ['2026-08-05', '2026-09-05', '2026-10-06']) await txn({ merchant: 'Netflix', merchantRaw: 'NETFLIX.COM', amountPaise: 64900, postedAt: new Date(`${m}T06:00:00Z`) });
    await txn({ merchant: 'Random', amountPaise: 12300, postedAt: new Date('2026-10-01T06:00:00Z') });
    const s = await recurringSuggestions('owner', new Date('2026-11-14T06:00:00Z'));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ amountPaise: 64900, dayOfMonth: 5 });
  });

  it('dashboard spend equals the transactions list total', async () => {
    const food = await cat('food');
    await txn({ amountPaise: 50000, categoryId: food });
    const big = await txn({ amountPaise: 200000 });
    await Transaction.create({ ownerId: 'owner', accountId: kotak._id, postedAt: new Date('2026-11-13T06:00:00Z'), amountPaise: 50000, direction: 'credit', kind: 'refund', status: 'settled', linkedTransactionId: big._id });
    await txn({ amountPaise: 7500000, kind: 'self_transfer' });
    await txn({ amountPaise: 999900, status: 'declined' });
    const dash = await api.get('/api/finance/dashboard?month=2026-11');
    const list = await api.get('/api/finance/transactions?month=2026-11');
    expect(dash.body.spendPaise).toBe(200000);
    expect(dash.body.spendPaise).toBe(list.body.totals.spendPaise);
    const byCat = dash.body.byCategory.reduce((s: number, c: any) => s + c.amountPaise, 0);
    expect(byCat).toBe(dash.body.spendPaise);
  });

  it('alerts can be listed and marked read', async () => {
    await Alert.create({ ownerId: 'owner', type: 'x', title: 'Hello' });
    const list = await api.get('/api/finance/alerts');
    expect(list.body.unread).toBe(1);
    await api.post(`/api/finance/alerts/${list.body.alerts[0].id}/read`);
    expect((await api.get('/api/finance/alerts')).body.unread).toBe(0);
    expect((await other.get('/api/finance/alerts')).body.alerts).toHaveLength(0);
  });

  it('jobs endpoint needs the JOBS_SECRET', async () => {
    expect((await request(app).post('/api/finance/jobs/run?job=daily')).status).toBe(503);
    process.env.JOBS_SECRET = 'jobs-secret';
    expect((await request(app).post('/api/finance/jobs/run?job=daily').set('Authorization', 'Bearer nope')).status).toBe(401);
    const ok = await request(app).post('/api/finance/jobs/run?job=daily').set('Authorization', 'Bearer jobs-secret');
    expect(ok.status).toBe(200);
    expect(Object.keys(ok.body.result)).toEqual(expect.arrayContaining(['commitmentWatch', 'refundWatch', 'renewalReminders', 'purgeOldBodies']));
    expect((await request(app).post('/api/finance/jobs/run?job=nope').set('Authorization', 'Bearer jobs-secret')).status).toBe(400);
  });

  it('export contains my data only and no secrets', async () => {
    await api.put(`/api/finance/accounts/${kotak._id}/statement-password`).send({ password: 'SECRET-PASS' });
    await txn({});
    const res = await api.get('/api/finance/export');
    expect(res.body.transactions).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain('statementPasswordEnc');
    expect((await other.get('/api/finance/export')).body.transactions).toHaveLength(0);
  });
});
