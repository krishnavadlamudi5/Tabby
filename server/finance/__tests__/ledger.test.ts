import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { app, as, useTestDb, makeUser } from './helpers';
import { fixture, EmailFixture } from './fixtures';
import { Account, Alert, Category, Commitment, RawEvent, Statement, Transaction } from '../models';
import { ingestEmail } from '../services/ingest/pipeline';
import { signIngest } from '../routes/ingest';
import { ensureDefaultCategories } from '../services/categories';

useTestDb();

const OWNER = 'owner';
let api: ReturnType<typeof as>;

async function setupOwner() {
  const u = await makeUser(OWNER, { name: 'Test Owner', email: 'owner@example.com' });
  api = as(u.auth);
  await ensureDefaultCategories(OWNER);
  const mk = (a: Record<string, any>) => Account.create({ ownerId: OWNER, aliases: [], cardLast4s: [], ...a });
  return {
    kotak: await mk({ name: 'Kotak savings', institution: 'kotak', type: 'savings', last4: '9564', cardLast4s: ['2797'] }),
    icici: await mk({ name: 'ICICI savings', institution: 'icici', type: 'savings', last4: '1537', ifsc: 'ICIC0002386' }),
    icici2: await mk({ name: 'ICICI 1042', institution: 'icici', type: 'savings', last4: '1042' }),
    iciciCc: await mk({ name: 'ICICI credit card', institution: 'icici', type: 'credit_card', last4: '5002', cardLast4s: ['5002'] }),
    sbm: await mk({ name: 'SBM', institution: 'sbm', type: 'savings', last4: '7255' }),
    hdfcCc: await mk({ name: 'HDFC credit card', institution: 'hdfc', type: 'credit_card', last4: '1830', cardLast4s: ['1830'] }),
  };
}

function ingest(f: EmailFixture, overrides: Partial<EmailFixture> = {}) {
  const x = { ...f, ...overrides };
  return ingestEmail({
    ownerId: OWNER, source: 'gmail', sourceId: x.messageId, sender: x.sender, subject: x.subject,
    receivedAt: new Date(x.receivedAt), bodyText: x.bodyText,
  });
}

async function spendNovember() {
  const res = await api.get('/api/finance/transactions?month=2026-11');
  return res.body.totals.spendPaise as number;
}

let accts: Awaited<ReturnType<typeof setupOwner>>;
beforeEach(async () => {
  accts = await setupOwner();
});

describe('fixture ingestion', () => {
  it('F1 creates a categorised debit on Kotak 9564', async () => {
    const r = await ingest(fixture('F01'));
    expect(r.status).toBe('parsed');
    const t = await Transaction.findById(r.transactionIds[0]);
    expect(t).toMatchObject({ amountPaise: 33100, direction: 'debit', kind: 'expense', channel: 'card', merchant: 'Flipkart' });
    expect(String(t!.accountId)).toBe(String(accts.kotak._id));
    const cat = await Category.findById(t!.categoryId);
    expect(cat!.key).toBe('shopping');
  });

  it('F5 lands on the ICICI credit card, merchant from Payee, categorised as groceries', async () => {
    const r = await ingest(fixture('F05'));
    const t = await Transaction.findById(r.transactionIds[0]);
    expect(String(t!.accountId)).toBe(String(accts.iciciCc._id));
    expect((await Category.findById(t!.categoryId))!.key).toBe('groceries');
  });

  it('F6 with an unknown account goes to review and raises an alert', async () => {
    await Account.deleteOne({ _id: accts.icici2._id });
    const r = await ingest(fixture('F06'));
    expect(r.status).toBe('needs_review');
    expect(r.reviewReason).toBe('unknown_account');
    expect(await Alert.countDocuments({ ownerId: OWNER, type: 'unknown_account' })).toBe(1);
  });

  it('F7 credit on SBM is income', async () => {
    const r = await ingest(fixture('F07'));
    expect(await Transaction.findById(r.transactionIds[0])).toMatchObject({ direction: 'credit', kind: 'income', amountPaise: 1200 });
  });

  it('F9 PayU receipt without an account goes to review', async () => {
    const r = await ingest(fixture('F09'));
    expect(r.status).toBe('needs_review');
    expect(r.reviewReason).toBe('no_account');
    expect(await Transaction.countDocuments({ ownerId: OWNER })).toBe(1);
  });

  it('F11 creates an EMI commitment due on the 10th', async () => {
    await ingest(fixture('F11'));
    const c = await Commitment.findOne({ ownerId: OWNER, type: 'emi' });
    expect(c).toMatchObject({ amountPaise: 3409800, status: 'due' });
    expect(c!.schedule.nextDueDate.toISOString()).toBe('2026-11-09T18:30:00.000Z');
  });

  it('F12 marks the SIP commitment failed and alerts', async () => {
    await ingest(fixture('F12'));
    const c = await Commitment.findOne({ ownerId: OWNER, type: 'sip' });
    expect(c!.status).toBe('failed');
    expect(await Alert.countDocuments({ ownerId: OWNER, type: 'commitment_failed' })).toBe(1);
  });

  it('F13 is a USD subscription needing action, not a transaction', async () => {
    await ingest(fixture('F13'));
    expect(await Transaction.countDocuments({ ownerId: OWNER })).toBe(0);
    const c = await Commitment.findOne({ ownerId: OWNER, type: 'subscription' });
    expect(c).toMatchObject({ currency: 'USD', amountPaise: 20532, status: 'action_needed' });
  });

  it('F14, F15, F16 are ignored; the OTP body is never stored', async () => {
    for (const p of ['F14', 'F15', 'F16']) {
      const r = await ingest(fixture(p));
      expect(r.status, p).toBe('ignored');
    }
    const otp = await RawEvent.findOne({ ownerId: OWNER, sourceId: fixture('F15').messageId }).select('+bodyEnc');
    expect(otp!.bodyEnc).toBe('');
    expect(await Transaction.countDocuments({ ownerId: OWNER })).toBe(0);
  });

  it('stores email bodies encrypted', async () => {
    await ingest(fixture('F01'));
    const raw = await RawEvent.findOne({ ownerId: OWNER });
    expect(raw!.bodyEnc).toBeTruthy();
    expect(raw!.bodyEnc).not.toContain('FLIPKART');
    expect(JSON.stringify(raw!.toJSON())).not.toContain(raw!.bodyEnc);
  });
});

describe('ledger scenarios', () => {
  it('S1 Amazon ₹7,382: declined + debit + reversal -> net spend 0, one linked pair, declined excluded', async () => {
    await ingest(fixture('F02'), { receivedAt: '2026-11-10T07:59:00Z', bodyText: fixture('F02').bodyText.replace('14/11/2026 20:31:52', '10/11/2026 13:29:00') });
    await ingest(fixture('X01'));
    await ingest(fixture('F03'));
    const all = await Transaction.find({ ownerId: OWNER });
    expect(all).toHaveLength(3);
    const declined = all.find((t) => t.status === 'declined')!;
    const debit = all.find((t) => t.direction === 'debit' && t.status === 'settled')!;
    const credit = all.find((t) => t.direction === 'credit')!;
    expect(declined).toBeTruthy();
    expect(credit.kind).toBe('refund');
    expect(String(credit.linkedTransactionId)).toBe(String(debit._id));
    expect(String(debit.linkedTransactionId)).toBe(String(credit._id));
    expect(await spendNovember()).toBe(0);
    const list = await api.get('/api/finance/transactions?month=2026-11');
    expect(list.body.transactions.some((t: any) => t.status === 'declined')).toBe(false);
  });

  it('S2 Meesho ₹138: Kotak alert + Razorpay receipt -> exactly one transaction', async () => {
    await ingest(fixture('X02'));
    await ingest(fixture('F08'));
    const all = await Transaction.find({ ownerId: OWNER });
    expect(all).toHaveLength(1);
    expect(all[0].rawEventIds).toHaveLength(2);
    expect(all[0].merchant).toBe('Meesho');
    expect(all[0].merchantRaw).toBe('RAZ*Meesho technologies P');
    expect(String(all[0].accountId)).toBe(String(accts.kotak._id));
    expect(all[0].referenceIds).toEqual(expect.arrayContaining(['631309551870', 'pay_Rt8KxQ2mZr1aB9']));
    // Order doesn't matter
    await Transaction.deleteMany({});
    await RawEvent.deleteMany({});
    await ingest(fixture('F08'));
    await ingest(fixture('X02'));
    expect(await Transaction.countDocuments({ ownerId: OWNER })).toBe(1);
    expect(await RawEvent.countDocuments({ ownerId: OWNER, status: 'needs_review' })).toBe(0);
  });

  it('two separate same-amount payments from the same source are not merged', async () => {
    const f = fixture('X02');
    await ingest(f);
    await ingest(f, { messageId: 'msg-second', bodyText: f.bodyText.replace('09:45:40', '09:50:00').replace('631309551870', '631309551999') });
    expect(await Transaction.countDocuments({ ownerId: OWNER })).toBe(2);
  });

  it('S3 ₹75,000 + ₹12,000 IMPS to own ICICI are self transfers; spend unaffected', async () => {
    await ingest(fixture('F04'));
    await ingest(fixture('X03'));
    const all = await Transaction.find({ ownerId: OWNER });
    expect(all.map((t) => t.kind)).toEqual(['self_transfer', 'self_transfer']);
    expect(await spendNovember()).toBe(0);
  });

  it('S4 Flipkart refunds ₹1,099 + ₹298 -> two pending; HDFC credit settles the right one; the other flags overdue', async () => {
    await ingest(fixture('F10'));
    await ingest(fixture('X04'));
    const pending = await Transaction.find({ ownerId: OWNER, kind: 'refund', status: 'pending' });
    expect(pending.map((p) => p.amountPaise).sort((x, y) => x - y)).toEqual([29800, 109900]);
    expect(pending.every((p) => String(p.accountId) === String(accts.hdfcCc._id))).toBe(true);

    await ingest(fixture('X05'));
    const after = await Transaction.find({ ownerId: OWNER });
    expect(after).toHaveLength(2);
    expect(after.find((t) => t.amountPaise === 109900)!.status).toBe('settled');
    expect(after.find((t) => t.amountPaise === 29800)!.status).toBe('pending');

    const { refundWatch } = await import('../services/jobs/refundWatch');
    await refundWatch(new Date('2026-11-17T06:00:00Z'));
    const alerts = await Alert.find({ ownerId: OWNER, type: 'refund_overdue' });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toContain('298');
  });

  it('S5 the same email ingested twice -> one RawEvent, one transaction', async () => {
    const a = await ingest(fixture('F01'));
    const b = await ingest(fixture('F01'));
    expect(b.duplicate).toBe(true);
    expect(b.rawEventId).toBe(a.rawEventId);
    expect(await RawEvent.countDocuments({ ownerId: OWNER })).toBe(1);
    expect(await Transaction.countDocuments({ ownerId: OWNER })).toBe(1);
  });

  it('S6 + S7 statements: new UPI line creates a transaction; a missing line shows as the mismatch', async () => {
    await ingest(fixture('F01')); // ₹331 on 14 Nov, Kotak
    const csv = [
      'Kotak Mahindra Bank',
      'Account Statement for XX9564',
      '',
      'Sl. No.,Transaction Date,Description,Chq / Ref No.,Debit,Credit,Balance',
      '1,01-11-2026,Opening carry,,,,"10,000.00"',
      '2,05-11-2026,UPI/631000111/GPAY MERCHANT RAJU TEA/okaxis/Payment,631000111,250.00,,"9,750.00"',
      '3,14-11-2026,PCD/2797/FLIPKART PAYMENTS/Bangalore,631813502211,331.00,,"9,419.00"',
      '4,20-11-2026,NEFT CR-SALARY ACME,,,"50,000.00","59,419.00"',
    ].join('\n');
    const up = await api.post('/api/finance/statements/upload')
      .field('accountId', String(accts.kotak._id)).field('openingBalancePaise', '1000000')
      .attach('file', Buffer.from(csv), { filename: 'kotak.csv', contentType: 'text/csv' });
    expect(up.status).toBe(200);
    if (up.body.status !== 'reconciled') console.log(JSON.stringify(up.body));
    expect(up.body).toMatchObject({ status: 'reconciled', lineCount: 3, matchedCount: 1, createdCount: 2, mismatchPaise: 0 });
    // S6: the GPay UPI payment with no email is now a transaction
    const gpay = await Transaction.findOne({ ownerId: OWNER, amountPaise: 25000 });
    expect(gpay).toMatchObject({ source: 'statement', reconciled: true, merchant: 'Gpay Merchant Raju Tea' });
    expect((await Transaction.findOne({ ownerId: OWNER, amountPaise: 33100 }))!.reconciled).toBe(true);

    // Re-importing creates nothing new
    const again = await api.post('/api/finance/statements/upload')
      .field('accountId', String(accts.kotak._id)).field('openingBalancePaise', '1000000')
      .attach('file', Buffer.from(csv), { filename: 'kotak.csv', contentType: 'text/csv' });
    expect(again.body.createdCount).toBe(0);
    expect(await Transaction.countDocuments({ ownerId: OWNER })).toBe(3);

    // S7: drop the ₹250 line -> mismatch is exactly ₹250, and it is in the review queue
    const missing = csv.split('\n').filter((l) => !l.includes('RAJU TEA')).join('\n').replace('01-11-2026', '01-11-2026');
    await Statement.deleteMany({});
    const bad = await api.post('/api/finance/statements/upload')
      .field('accountId', String(accts.kotak._id)).field('openingBalancePaise', '1000000')
      .attach('file', Buffer.from(missing.replace('Opening carry', 'Opening carry x')), { filename: 'kotak2.csv', contentType: 'text/csv' });
    expect(bad.body.status).toBe('mismatch');
    expect(bad.body.mismatchPaise).toBe(-25000);
    expect(bad.body.issues[0].amountPaise).toBe(-25000);
    const review = await api.get('/api/finance/review');
    expect(review.body.statements).toHaveLength(1);
  });
});

describe('orders auto-split (Phase 4)', () => {
  it('a Blinkit order splits its payment into grocery sub-categories, in either order', async () => {
    await ingest(fixture('X07'));
    await ingest(fixture('X06'));
    const t = await Transaction.findOne({ ownerId: OWNER, amountPaise: 76400 });
    expect(t!.splits.length).toBeGreaterThan(3);
    expect(t!.splits.reduce((s, p) => s + p.amountPaise, 0)).toBe(76400);
    const keys = await Promise.all(t!.splits.map(async (p) => (await Category.findById(p.categoryId))!.key));
    expect(keys).toEqual(expect.arrayContaining(['groceries.vegetables', 'groceries.dairy', 'groceries.staples', 'groceries.snacks', 'groceries.household']));

    await Transaction.deleteMany({});
    await RawEvent.deleteMany({});
    await ingest(fixture('X06'));
    await ingest(fixture('X07'));
    const t2 = await Transaction.findOne({ ownerId: OWNER, amountPaise: 76400 });
    expect(t2!.splits.length).toBeGreaterThan(3);
  });
});

describe('POST /api/finance/ingest/email (Apps Script)', () => {
  const secret = 'test-ingest-secret';
  function signed(body: object, tsOverride?: string) {
    const raw = JSON.stringify(body);
    const ts = tsOverride || String(Date.now());
    return request(app).post('/api/finance/ingest/email')
      .set('Content-Type', 'application/json')
      .set('X-Tabby-Timestamp', ts)
      .set('X-Tabby-Signature', signIngest(secret, ts, raw))
      .send(raw);
  }
  const f = () => fixture('F01');
  const payload = () => ({ messageId: 'gm-1', from: `Kotak <${f().sender}>`, subject: f().subject, date: f().receivedAt, bodyText: f().bodyText, attachments: [] });

  beforeEach(() => {
    process.env.INGEST_HMAC_SECRET = secret;
    process.env.INGEST_OWNER_EMAIL = 'owner@example.com';
  });

  it('accepts a signed email, then 409s the repeat', async () => {
    const r1 = await signed(payload());
    expect(r1.status).toBe(200);
    expect(r1.body.status).toBe('parsed');
    const r2 = await signed(payload());
    expect(r2.status).toBe(409);
    expect(await Transaction.countDocuments({ ownerId: OWNER })).toBe(1);
  });

  it('rejects bad signatures and stale timestamps', async () => {
    const raw = JSON.stringify(payload());
    const bad = await request(app).post('/api/finance/ingest/email').set('Content-Type', 'application/json')
      .set('X-Tabby-Timestamp', String(Date.now())).set('X-Tabby-Signature', '00'.repeat(32)).send(raw);
    expect(bad.status).toBe(401);
    const stale = await signed(payload(), String(Date.now() - 10 * 60 * 1000));
    expect(stale.status).toBe(401);
    expect(await RawEvent.countDocuments()).toBe(0);
  });

  it('stores PDF attachments as encrypted documents', async () => {
    const pdf = Buffer.from('%PDF-1.4 fake invoice');
    const res = await signed({ ...payload(), messageId: 'gm-2', attachments: [{ filename: 'invoice.pdf', mimeType: 'application/pdf', size: pdf.length, base64: pdf.toString('base64') }] });
    expect(res.status).toBe(200);
    const raw = await RawEvent.findOne({ sourceId: 'gm-2' });
    expect(raw!.attachmentsMeta[0].documentId).toBeTruthy();
  });
});

describe('review queue', () => {
  it('confirming an unknown-format email creates the transaction and learns the sender', async () => {
    const r = await ingestEmail({
      ownerId: OWNER, source: 'manual', sourceId: 'paste-1', sender: 'alerts@newbank.example', subject: 'Debit alert',
      receivedAt: new Date('2026-11-14T10:00:00Z'), bodyText: 'Rs 450 debited from your account ending 9564 at CHAI POINT.',
    });
    expect(r.status).toBe('needs_review');
    const queue = await api.get('/api/finance/review');
    expect(queue.body.events).toHaveLength(1);
    expect(queue.body.events[0].bodyPreview).toContain('CHAI POINT');

    const food = await Category.findOne({ ownerId: OWNER, key: 'food' });
    const ok = await api.post(`/api/finance/review/${r.rawEventId}/confirm`).send({
      amountPaise: 45000, direction: 'debit', merchant: 'CHAI POINT', accountId: String(accts.kotak._id), categoryId: String(food!._id),
    });
    expect(ok.status).toBe(200);
    expect(ok.body.transactions[0]).toMatchObject({ amountPaise: 45000, merchant: 'Chai Point' });
    expect((await api.get('/api/finance/review')).body.events).toHaveLength(0);
    // The correction became a rule: the next Chai Point payment is categorised
    const rule = await api.get('/api/finance/rules');
    expect(rule.body.rules[0].match.merchantContains).toBe('chai point');
  });

  it('ignore-sender ignores future emails from that sender', async () => {
    const r = await ingestEmail({ ownerId: OWNER, source: 'manual', sourceId: 'p1', sender: 'noise@x.example', subject: 'Bill', receivedAt: new Date(), bodyText: 'Your bill of Rs 99 is generated' });
    await api.post(`/api/finance/review/${r.rawEventId}/ignore-sender`);
    const next = await ingestEmail({ ownerId: OWNER, source: 'manual', sourceId: 'p2', sender: 'noise@x.example', subject: 'Bill', receivedAt: new Date(), bodyText: 'Your bill of Rs 98 is generated' });
    expect(next.status).toBe('ignored');
  });

  it('changing a category teaches a rule used for the next payment', async () => {
    const r = await ingest(fixture('F06'));
    const txnId = r.transactionIds[0];
    const gifts = await Category.findOne({ ownerId: OWNER, key: 'gifts' });
    await api.patch(`/api/finance/transactions/${txnId}`).send({ categoryId: String(gifts!._id) });
    const f = fixture('F06');
    const r2 = await ingest(f, { messageId: 'msg-f06-2', bodyText: f.bodyText.replace('631715233016', '631715233099').replace('₹10', '₹20') });
    const t2 = await Transaction.findById(r2.transactionIds[0]);
    expect(String(t2!.categoryId)).toBe(String(gifts!._id));
    expect(t2!.categorySource).toBe('rule');
  });
});
