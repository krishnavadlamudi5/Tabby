import { describe, expect, it, beforeEach } from 'vitest';
import { as, useTestDb, makeUser } from './helpers';
import { Alert, Category, Commitment, Holding, Transaction } from '../models';
import { ensureDefaultCategories } from '../services/categories';
import { budgetFactor, budgetWatch, parseDay } from '../services/spending';
import { User } from '../../models/User';

useTestDb();
let api: ReturnType<typeof as>;
let food: string;
let groceries: string;
let veg: string;
let invest: string;
beforeEach(async () => {
  const u = await makeUser('owner', { name: 'Test Owner' });
  api = as(u.auth);
  await ensureDefaultCategories('owner');
  const id = async (key: string) => String((await Category.findOne({ ownerId: 'owner', key }))!._id);
  food = await id('food');
  groceries = await id('groceries');
  veg = await id('groceries.vegetables');
  invest = await id('investments');
});

const pay = (date: string, rupees: number, categoryId: string | null, extra: Record<string, any> = {}) =>
  Transaction.create({ ownerId: 'owner', postedAt: new Date(date), amountPaise: rupees * 100, direction: 'debit', kind: 'expense', status: 'settled', merchant: extra.merchant || 'Shop', categoryId, ...extra });

describe('spending summary', () => {
  it('totals a period, compares with the previous one and groups sub-categories', async () => {
    await pay('2026-11-03T06:00:00Z', 500, food, { merchant: 'Zomato' });
    await pay('2026-11-04T06:00:00Z', 300, veg);
    await pay('2026-11-05T06:00:00Z', 200, groceries);
    await pay('2026-10-20T06:00:00Z', 400, food);
    await pay('2026-11-06T06:00:00Z', 999, null, { kind: 'self_transfer' });
    const r = await api.get('/api/finance/spending?from=2026-11-01&to=2026-11-30');
    expect(r.status).toBe(200);
    expect(r.body.spendPaise).toBe(100000);
    expect(r.body.previous).toMatchObject({ from: '2026-10-02', to: '2026-10-31', spendPaise: 40000 });
    expect(r.body.granularity).toBe('day');
    expect(r.body.trend).toHaveLength(30);
    expect(r.body.trend.find((t: any) => t.key === '2026-11-04').spendPaise).toBe(30000);
    const g = r.body.byCategory.find((c: any) => c.categoryId === groceries);
    expect(g.amountPaise).toBe(50000);
    expect(g.children.map((c: any) => [c.name, c.amountPaise])).toEqual([['Vegetables & fruits', 30000], ['Other groceries', 20000]]);
    expect(r.body.topMerchants[0]).toMatchObject({ name: 'Zomato', amountPaise: 50000 });
  });

  it('long periods trend by month and scale budgets', async () => {
    await Category.updateOne({ _id: food }, { $set: { budgetPaise: 100000 } });
    await User.updateOne({ id: 'owner' }, { $set: { 'preferences.monthlyBudgetPaise': 2000000 } });
    await pay('2026-02-10T06:00:00Z', 700, food);
    const r = await api.get('/api/finance/spending?from=2026-01-01&to=2026-03-31');
    expect(r.body.granularity).toBe('month');
    expect(r.body.trend.map((t: any) => t.key)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(r.body.budget).toMatchObject({ budgetPaise: 6000000, spentPaise: 70000 });
    expect(r.body.categoryBudgets[0]).toMatchObject({ categoryId: food, budgetPaise: 300000, spentPaise: 70000 });
  });

  it('validates the period', async () => {
    expect((await api.get('/api/finance/spending?from=2026-11-30&to=2026-11-01')).status).toBe(400);
    expect((await api.get('/api/finance/spending?from=nov')).status).toBe(400);
  });

  it('transactions can be listed by date range (India days, inclusive)', async () => {
    await pay('2026-10-31T19:00:00Z', 100, food); // 1 Nov 00:30 IST
    await pay('2026-11-30T18:00:00Z', 100, food); // 30 Nov 23:30 IST
    await pay('2026-11-30T19:00:00Z', 100, food); // 1 Dec IST
    const r = await api.get('/api/finance/transactions?from=2026-11-01&to=2026-11-30');
    expect(r.body.transactions).toHaveLength(2);
  });

  it('budget factor counts whole months, else days', () => {
    expect(budgetFactor(parseDay('2026-01-01'), parseDay('2026-04-01'))).toBe(3);
    expect(budgetFactor(parseDay('2026-01-01'), parseDay('2026-01-16'))).toBeCloseTo(0.49, 2);
  });
});

describe('budget alerts', () => {
  it('alerts once at 80% and once at 100%, per budget and month', async () => {
    await Category.updateOne({ _id: food }, { $set: { budgetPaise: 100000 } });
    const now = new Date('2026-11-20T06:00:00Z');
    await pay('2026-11-05T06:00:00Z', 850, food);
    expect(await budgetWatch(now)).toBe(1);
    expect(await budgetWatch(now)).toBe(0);
    await pay('2026-11-06T06:00:00Z', 200, food);
    expect(await budgetWatch(now)).toBe(1);
    const alerts = await Alert.find({ ownerId: 'owner', type: 'budget' }).sort({ createdAt: 1 });
    expect(alerts.map((a) => a.title)).toEqual(['85% of Food & dining budget used', 'Over Food & dining budget for November']);
  });

  it('respects the overall monthly budget and the "off" setting', async () => {
    await User.updateOne({ id: 'owner' }, { $set: { 'preferences.monthlyBudgetPaise': 100000 } });
    await pay('2026-11-05T06:00:00Z', 1200, food);
    await User.updateOne({ id: 'owner' }, { $set: { 'preferences.alerts.budgets': 'off' } });
    expect(await budgetWatch(new Date('2026-11-20T06:00:00Z'))).toBe(0);
    await User.updateOne({ id: 'owner' }, { $set: { 'preferences.alerts.budgets': 'app' } });
    expect(await budgetWatch(new Date('2026-11-20T06:00:00Z'))).toBe(1);
  });

  it('the monthly budget is saved with the preferences', async () => {
    const r = await api.put('/api/users/me/preferences').send({ monthlyBudgetPaise: 5000000 });
    expect(r.status).toBe(200);
    expect(r.body.preferences.monthlyBudgetPaise).toBe(5000000);
  });
});

describe('investments', () => {
  it('adds holdings, keeps value history and summarises by type', async () => {
    const created = await api.post('/api/finance/investments').send({ name: 'Parag Parikh Flexi Cap', type: 'mutual_fund', investedPaise: 10000000, currentValuePaise: 11500000, valueAsOf: '2026-09-15' });
    expect(created.status).toBe(201);
    const id = created.body.holding.id;
    await api.post('/api/finance/investments').send({ name: 'SBI FD', type: 'fd', investedPaise: 5000000, currentValuePaise: 5000000, valueAsOf: '2026-09-01' });
    const upd = await api.patch(`/api/finance/investments/${id}`).send({ currentValuePaise: 12000000, investedPaise: 10500000, valueAsOf: '2026-11-10' });
    expect(upd.body.holding.history).toHaveLength(2);

    await pay('2026-11-05T04:00:00Z', 5000, invest, { merchant: 'Groww SIP' });
    await Commitment.create({ ownerId: 'owner', type: 'sip', name: 'Flexi cap SIP', amountPaise: 500000, schedule: { freq: 'monthly', nextDueDate: new Date('2026-12-05') } });

    const r = await api.get('/api/finance/investments');
    expect(r.body.totals).toMatchObject({ investedPaise: 15500000, valuePaise: 17000000, gainPaise: 1500000, gainPct: 9.7, sipMonthlyPaise: 500000 });
    expect(r.body.byType.map((t: any) => t.type)).toEqual(['mutual_fund', 'fd']);
    expect(r.body.sips).toHaveLength(1);
    const tl = Object.fromEntries(r.body.timeline.map((t: any) => [t.month, t]));
    expect(tl['2026-09'].valuePaise).toBe(16500000);
    expect(tl['2026-10'].valuePaise).toBe(16500000);
    expect(tl['2026-11']).toMatchObject({ valuePaise: 17000000, putInPaise: 500000 });
  });

  it('is private to the owner and checks the linked SIP', async () => {
    const other = await makeUser('other');
    const h = await Holding.create({ ownerId: 'owner', name: 'Gold', type: 'gold' });
    const o = as(other.auth);
    expect((await o.get('/api/finance/investments')).body.holdings).toHaveLength(0);
    expect((await o.patch(`/api/finance/investments/${h._id}`).send({ currentValuePaise: 1 })).status).toBe(404);
    expect((await api.post('/api/finance/investments').send({ name: 'X', commitmentId: String(h._id) })).status).toBe(400);
  });
});
