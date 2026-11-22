import { describe, expect, it, beforeEach } from 'vitest';
import { as, useTestDb, makeUser } from './helpers';
import { Account, RawEvent, Transaction } from '../models';
import { ensureDefaultCategories } from '../services/categories';

useTestDb();

let api: ReturnType<typeof as>;

beforeEach(async () => {
  const u = await makeUser('smsowner', { name: 'SMS Owner', email: 'sms@example.com' });
  api = as(u.auth);
  await ensureDefaultCategories('smsowner');
  await Account.create({ ownerId: 'smsowner', name: 'HDFC savings', institution: 'hdfc', type: 'savings', last4: '1234', aliases: [], cardLast4s: [] });
});

const swiggy = { address: 'VM-HDFCBK-S', body: 'Sent Rs.250.00 From HDFC Bank A/C *1234 To SWIGGY On 20/11/26 Ref 432198765432 Not You? Call 18002586161', date: '2026-11-20T13:05:00+05:30' };

describe('POST /api/finance/ingest/sms', () => {
  it('turns a bank SMS into a categorised transaction and skips personal SMS', async () => {
    const res = await api.post('/api/finance/ingest/sms').send({
      messages: [
        swiggy,
        { address: '+919876543210', body: 'Hey, lunch tomorrow? I owe you Rs 200', date: '2026-11-20T14:00:00+05:30' },
        { address: 'AD-SWIGGY', body: 'Your order of Rs 250 is out for delivery', date: '2026-11-20T13:10:00+05:30' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: 3, parsed: 1, skipped: 2 });

    const txns = await Transaction.find({ ownerId: 'smsowner' });
    expect(txns).toHaveLength(1);
    expect(txns[0].amountPaise).toBe(25000);
    expect(txns[0].direction).toBe('debit');
    expect(txns[0].categoryId).toBeTruthy();

    // Personal SMS are never stored, not even as raw events.
    expect(await RawEvent.countDocuments({ ownerId: 'smsowner' })).toBe(1);
  });

  it('still records SMS for an account you have not added, flagged for review', async () => {
    const res = await api.post('/api/finance/ingest/sms').send({
      messages: [{ ...swiggy, body: swiggy.body.replace('*1234', '*9999') }],
    });
    expect(res.body).toMatchObject({ review: 1 });
    expect(await Transaction.countDocuments({ ownerId: 'smsowner' })).toBe(1);
  });

  it('is idempotent when the phone resends the same SMS', async () => {
    await api.post('/api/finance/ingest/sms').send({ messages: [swiggy] });
    const again = await api.post('/api/finance/ingest/sms').send({ messages: [swiggy] });
    expect(again.body).toMatchObject({ duplicate: 1, parsed: 0 });
    expect(await Transaction.countDocuments({ ownerId: 'smsowner' })).toBe(1);
  });

  it('drops OTP SMS without storing the body', async () => {
    const res = await api.post('/api/finance/ingest/sms').send({
      messages: [{ address: 'VM-HDFCBK', body: '123456 is your OTP for txn of Rs.1,499.00 at AMAZON on HDFC Bank Card 5678.', date: '2026-11-20T13:00:00+05:30' }],
    });
    expect(res.body.ignored).toBe(1);
    const raw = await RawEvent.findOne({ ownerId: 'smsowner' });
    expect(raw!.bodyEnc).toBe('');
  });

  it('requires sign-in', async () => {
    const { default: request } = await import('supertest');
    const { app } = await import('./helpers');
    const res = await request(app).post('/api/finance/ingest/sms').send({ messages: [swiggy] });
    expect(res.status).toBe(401);
  });
});
