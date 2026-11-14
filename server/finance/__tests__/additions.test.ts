import { describe, expect, it, beforeEach } from 'vitest';
import { as, useTestDb, makeUser } from './helpers';
import { fixture } from './fixtures';
import { Account, Category, Person, Policy, Transaction } from '../models';
import { ensureDefaultCategories } from '../services/categories';
import { ingestEmail } from '../services/ingest/pipeline';
import { orderItems } from '../services/ingest/parsers/merchants';

useTestDb();
let api: ReturnType<typeof as>;
beforeEach(async () => {
  const u = await makeUser('owner', { name: 'Test Owner' });
  api = as(u.auth);
  await ensureDefaultCategories('owner');
  await Account.create({ ownerId: 'owner', name: 'ICICI CC', institution: 'icici', type: 'credit_card', last4: '5002', cardLast4s: ['5002'] });
});
const ingest = (p: string, extra: Record<string, any> = {}) => {
  const f = { ...fixture(p), ...extra };
  return ingestEmail({ ownerId: 'owner', source: 'gmail', sourceId: f.messageId, sender: f.sender, subject: f.subject, receivedAt: new Date(f.receivedAt), bodyText: f.bodyText });
};
const catKey = async (id: unknown) => (await Category.findById(id))?.key;

describe('shop orders (Amazon, Flipkart, Instamart)', () => {
  it('reads Amazon items and attaches them to the card payment as Shopping', async () => {
    const pay = await Transaction.create({ ownerId: 'owner', postedAt: new Date('2026-11-11T08:58:00Z'), amountPaise: 239800, direction: 'debit', kind: 'expense', status: 'settled', merchant: 'Razorpay', merchantRaw: 'AMAZON PAY INDIA' });
    const r = await ingest('X08');
    expect(r.transactionIds).toEqual([String(pay._id)]);
    const t = await Transaction.findById(pay._id);
    expect(t!.merchant).toBe('Amazon');
    expect(t!.description).toContain('boAt Airdopes');
    expect(await catKey(t!.categoryId)).toBe('shopping');
    expect(t!.splits).toHaveLength(0);
  });

  it('Instamart orders split into grocery sub-categories; delivery fee spread', async () => {
    const pay = await Transaction.create({ ownerId: 'owner', postedAt: new Date('2026-11-13T10:59:00Z'), amountPaise: 43900, direction: 'debit', kind: 'expense', status: 'settled', merchant: 'Swiggy' });
    await ingest('X10');
    const t = await Transaction.findById(pay._id);
    expect(t!.splits.reduce((s, p) => s + p.amountPaise, 0)).toBe(43900);
    const keys = await Promise.all(t!.splits.map((p) => catKey(p.categoryId)));
    expect(keys.sort()).toEqual(['groceries.dairy', 'groceries.household', 'groceries.vegetables']);
  });

  it('shipping updates are ignored, not sent to review', async () => {
    const r = await ingest('X11');
    expect(r.status).toBe('ignored');
  });

  it('item line reader skips totals and fees', () => {
    expect(orderItems('Widget Qty: 2 ₹100\nDelivery Fee ₹25\nGrand Total ₹225\nGadget ₹99').map((i) => i.name)).toEqual(['Widget', 'Gadget']);
  });
});

describe('insurance totals per year, members, manual payments, renew link', () => {
  it('summarises premiums by year, type and person', async () => {
    const dad = await Person.create({ ownerId: 'owner', name: 'Dad', relation: 'father' });
    const mom = await Person.create({ ownerId: 'owner', name: 'Mom', relation: 'mother' });
    const health = await api.post('/api/finance/policies').send({ insurer: 'Care Health Insurance', type: 'health', premiumPaise: 4000000, insuredMemberIds: [String(dad._id), String(mom._id)], renewUrl: 'https://www.careinsurance.com/' });
    const bike = await api.post('/api/finance/policies').send({ insurer: 'Acko General Insurance', type: 'vehicle', planName: 'Two-wheeler', premiumPaise: 184700 });
    expect(health.body.policy.renewUrl).toBe('https://www.careinsurance.com/');
    expect((await api.post('/api/finance/policies').send({ insurer: 'X', renewUrl: 'javascript:alert(1)' })).status).toBe(400);

    await api.post(`/api/finance/policies/${health.body.policy.id}/payments`).send({ amountPaise: 3800000, date: '2025-06-10' });
    await api.post(`/api/finance/policies/${health.body.policy.id}/payments`).send({ amountPaise: 4000000, date: '2026-06-10' });
    await api.post(`/api/finance/policies/${bike.body.policy.id}/payments`).send({ amountPaise: 184700, date: '2026-11-18' });

    const fy = (await api.get('/api/finance/policies/premium-summary?basis=fy&years=3')).body;
    expect(fy.years).toEqual(['2024-25', '2025-26', '2026-27']);
    expect(fy.totalsByYear).toEqual({ '2024-25': 0, '2025-26': 3800000, '2026-27': 4184700 });
    expect(fy.byType.health['2026-27']).toBe(4000000);
    expect(fy.byType.vehicle['2026-27']).toBe(184700);
    expect(fy.byPerson['Dad (father)']['2026-27']).toBe(2000000);
    expect(fy.byPerson['Not set']['2026-27']).toBe(184700);

    const cal = (await api.get('/api/finance/policies/premium-summary?basis=calendar&years=2')).body;
    expect(cal.totalsByYear).toEqual({ 2025: 3800000, 2026: 4184700 });

    const p = await Policy.findById(health.body.policy.id);
    const txn = await Transaction.findById(p!.premiumTransactionIds[0]);
    expect(await catKey(txn!.categoryId)).toBe('insurance');
  });
});

describe('year report', () => {
  it('matches the monthly dashboard and compares previous years', async () => {
    const food = await Category.findOne({ ownerId: 'owner', key: 'food' });
    const mk = (iso: string, amountPaise: number, extra: Record<string, any> = {}) => Transaction.create({ ownerId: 'owner', postedAt: new Date(iso), amountPaise, direction: 'debit', kind: 'expense', status: 'settled', categoryId: food!._id, ...extra });
    await mk('2026-04-05T06:00:00Z', 10000);
    await mk('2026-11-05T06:00:00Z', 25000);
    await mk('2027-02-05T06:00:00Z', 5000);
    await mk('2025-05-05T06:00:00Z', 7000);
    await mk('2026-11-06T06:00:00Z', 99999, { kind: 'self_transfer' });
    const r = (await api.get('/api/finance/reports/year?year=2026&basis=fy')).body;
    expect(r.label).toBe('2026-27');
    expect(r.months).toHaveLength(12);
    expect(r.months[0].key).toBe('2026-04');
    expect(r.totalSpendPaise).toBe(40000);
    expect(r.categories[0]).toMatchObject({ name: 'Food & dining', total: 40000 });
    expect(r.years.map((y: any) => [y.label, y.spendPaise])).toEqual([['2023-24', 0], ['2024-25', 0], ['2025-26', 7000], ['2026-27', 40000]]);
    const nov = (await api.get('/api/finance/dashboard?month=2026-11')).body;
    expect(r.months.find((m: any) => m.key === '2026-11').spendPaise).toBe(nov.spendPaise);
    const cal = (await api.get('/api/finance/reports/year?year=2026&basis=calendar')).body;
    expect(cal.totalSpendPaise).toBe(35000);
    expect((await api.get('/api/finance/reports/year?year=abc')).status).toBe(400);
  });
});

describe('documents with an expiry date', () => {
  it('remind 30 and 7 days before and on the day', async () => {
    const { FinDocument } = await import('../models');
    const { documentExpiryReminders } = await import('../services/jobs/reminders');
    const { Alert } = await import('../models');
    await FinDocument.create({ ownerId: 'owner', title: 'Activa PUC', type: 'other', mimeType: 'application/pdf', sizeBytes: 1, sha256: 'x', storageKey: 'k', expiresAt: new Date('2026-12-14T18:30:00Z') });
    expect(await documentExpiryReminders(new Date('2026-11-01T03:00:00Z'))).toBe(0);
    expect(await documentExpiryReminders(new Date('2026-11-15T03:00:00Z'))).toBe(1);
    expect(await documentExpiryReminders(new Date('2026-11-16T03:00:00Z'))).toBe(0);
    expect(await documentExpiryReminders(new Date('2026-12-08T03:00:00Z'))).toBe(1);
    expect(await documentExpiryReminders(new Date('2026-12-15T03:00:00Z'))).toBe(1);
    expect((await Alert.find({ type: 'document_expiry' })).map((a) => a.title)).toEqual(['Activa PUC expires in 30 days', 'Activa PUC expires in 7 days', 'Activa PUC expires today']);
  });
});

describe('order tagging', () => {
  it('payments with an order get the online-order tag', async () => {
    const pay = await Transaction.create({ ownerId: 'owner', postedAt: new Date('2026-11-12T06:59:00Z'), amountPaise: 299900, direction: 'debit', kind: 'expense', status: 'settled', merchant: 'Flipkart' });
    await ingest('X09');
    expect((await Transaction.findById(pay._id))!.tags).toContain('online-order');
    const res = await api.get('/api/finance/transactions?month=2026-11&tag=online-order');
    expect(res.body.transactions).toHaveLength(1);
  });
});

describe('PATCH only changes the fields that were sent (regression)', () => {
  it('keeps every other field of a policy, account, category and commitment', async () => {
    const pol = (await api.post('/api/finance/policies').send({ insurer: 'Care Health Insurance', type: 'health', premiumPaise: 2450000, sumInsuredPaise: 100000000, status: 'renewal_due', taxSection: '80D' })).body.policy;
    const dad = (await api.post('/api/finance/people').send({ name: 'Dad', relation: 'father' })).body.person;
    const patched = (await api.patch(`/api/finance/policies/${pol.id}`).send({ insuredMemberIds: [dad.id] })).body.policy;
    expect(patched).toMatchObject({ premiumPaise: 2450000, sumInsuredPaise: 100000000, status: 'renewal_due', taxSection: '80D', type: 'health', insuredMemberIds: [dad.id] });

    const acc = (await api.post('/api/finance/accounts').send({ name: 'Kotak', last4: '9564', cardLast4s: ['2797'], type: 'savings', openingBalancePaise: 500000 })).body.account;
    const acc2 = (await api.patch(`/api/finance/accounts/${acc.id}`).send({ name: 'Kotak salary' })).body.account;
    expect(acc2).toMatchObject({ name: 'Kotak salary', last4: '9564', cardLast4s: ['2797'], openingBalancePaise: 500000 });

    const cat = (await api.post('/api/finance/categories').send({ name: 'Pets', color: '#123456', budgetPaise: 300000 })).body.category;
    const cat2 = (await api.patch(`/api/finance/categories/${cat.id}`).send({ name: 'Pet care' })).body.category;
    expect(cat2).toMatchObject({ name: 'Pet care', color: '#123456', budgetPaise: 300000 });

    const c = (await api.post('/api/finance/commitments').send({ type: 'sip', name: 'SIP', amountPaise: 500000, schedule: { freq: 'quarterly', nextDueDate: '2026-12-05' }, matchRule: { merchantContains: 'coin', tolerancePct: 2 } })).body.commitment;
    const c2 = (await api.patch(`/api/finance/commitments/${c.id}`).send({ schedule: { nextDueDate: '2027-03-05' } })).body.commitment;
    expect(c2.schedule.freq).toBe('quarterly');
    expect(c2.matchRule).toMatchObject({ merchantContains: 'coin', tolerancePct: 2 });
    expect(c2.amountPaise).toBe(500000);
  });
});
