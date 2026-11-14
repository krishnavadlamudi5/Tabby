import request from 'supertest';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { app, as, useTestDb, makeUser } from './helpers';
import { makePdf } from './pdf';
import { extractPolicy, isUsable } from '../services/insurance/policyExtract';
import { aiExtractPolicy, maskForAi } from '../services/ai/cloudflare';
import { signIngest } from '../routes/ingest';
import { Alert, Commitment, DocPassword, FinDocument, Policy, RawEvent, Transaction } from '../models';
import { MemoryStore, setFileStore } from '../services/storage/fileStore';
import { ensureDefaultCategories } from '../services/categories';

useTestDb();

const ACKO_PDF_LINES = [
  'ACKO General Insurance Limited',
  'Two Wheeler Package Policy - Policy Schedule cum Certificate of Insurance',
  'Policy Number: DBTR00123456789',
  'Insured Name: Test Owner',
  'Vehicle Registration No: KA 05 MX 4821',
  'Make / Model: Honda Activa 6G',
  'Insured Declared Value (IDV): Rs. 58,400',
  'Period of Insurance: 18/11/2026 to 17/11/2027 midnight',
  'Total Premium Payable: Rs. 1,847.00',
  'Nominee Name: Asha Owner Relationship: Spouse',
];

const secret = 'test-ingest-secret';
function signed(body: object) {
  const raw = JSON.stringify(body);
  const ts = String(Date.now());
  return request(app).post('/api/finance/ingest/email').set('Content-Type', 'application/json')
    .set('X-Tabby-Timestamp', ts).set('X-Tabby-Signature', signIngest(secret, ts, raw)).send(raw);
}

let api: ReturnType<typeof as>;
beforeEach(async () => {
  setFileStore(new MemoryStore());
  process.env.INGEST_HMAC_SECRET = secret;
  process.env.INGEST_OWNER_EMAIL = 'owner@example.com';
  const u = await makeUser('owner', { name: 'Test Owner', email: 'owner@example.com' });
  api = as(u.auth);
  await ensureDefaultCategories('owner');
});
afterEach(() => {
  delete process.env.CF_ACCOUNT_ID;
  delete process.env.CF_AI_TOKEN;
});

describe('label-based policy reader', () => {
  it('reads an Acko two-wheeler schedule', () => {
    const x = extractPolicy(ACKO_PDF_LINES.join('\n'), 'policy@acko.com', 'Your ACKO bike insurance policy');
    expect(x).toMatchObject({
      insurer: 'Acko General Insurance', policyNumber: 'DBTR00123456789', type: 'vehicle', planName: 'Two-wheeler',
      vehicleNumber: 'KA05MX4821', sumInsuredPaise: 5840000, premiumPaise: 184700, nominee: 'Asha Owner',
    });
    expect(x.startDate!.toISOString()).toBe('2026-11-17T18:30:00.000Z');
    expect(x.endDate!.toISOString()).toBe('2027-11-16T18:30:00.000Z');
    expect(isUsable(x)).toBe(true);
  });

  it('takes the insurer from the text for aggregator emails (PolicyBazaar)', () => {
    const x = extractPolicy(
      'Congratulations! Your Care Supreme health policy from Care Health Insurance is issued.\nPolicy No.: 87654321\nSum Insured: ₹10,00,000\nPremium Paid: ₹24,500\nPolicy Start Date: 06 Dec 2026\nPolicy End Date: 05 Dec 2027',
      'noreply@policybazaar.com', 'Policy issued',
    );
    expect(x).toMatchObject({ insurer: 'Care Health Insurance', policyNumber: '87654321', type: 'health', sumInsuredPaise: 100000000, premiumPaise: 2450000 });
    expect(x.endDate!.toISOString()).toBe('2027-12-04T18:30:00.000Z');
  });
});

describe('automatic filing from Gmail', () => {
  const email = (extra: Record<string, any> = {}) => ({
    messageId: 'acko-1', from: 'ACKO <policy@acko.com>', subject: 'Your ACKO bike insurance policy is here',
    date: '2026-11-18T05:00:00Z', bodyText: 'Hi, thanks for choosing ACKO. Your policy document is attached.',
    attachments: [{ filename: 'policy.pdf', mimeType: 'application/pdf', size: 1, base64: makePdf(ACKO_PDF_LINES).toString('base64') }],
    ...extra,
  });

  it('files the policy with its PDF, schedules renewal, links the Razorpay premium, alerts', async () => {
    const pay = await Transaction.create({ ownerId: 'owner', postedAt: new Date('2026-11-18T04:50:00Z'), amountPaise: 184700, direction: 'debit', kind: 'expense', status: 'settled', merchant: 'Razorpay', merchantRaw: 'RAZ*ACKO TECHNOLOGY' });
    await Transaction.create({ ownerId: 'owner', postedAt: new Date('2026-11-18T05:10:00Z'), amountPaise: 184700, direction: 'debit', kind: 'expense', status: 'settled', merchant: 'Chai Point' });
    const res = await signed(email());
    expect(res.status).toBe(200);
    expect(res.body.policy.created).toBe(true);
    const p = await Policy.findOne({ ownerId: 'owner' });
    expect(p).toMatchObject({ insurer: 'Acko General Insurance', vehicleNumber: 'KA05MX4821', premiumPaise: 184700, autoAdded: true, needsCheck: true, status: 'active' });
    expect(p!.renewalDate!.toISOString()).toBe('2027-11-16T18:30:00.000Z');
    expect(p!.premiumTransactionIds.map(String)).toEqual([String(pay._id)]);
    expect(p!.documentIds).toHaveLength(1);
    const doc = await FinDocument.findById(p!.documentIds[0]);
    expect(doc!.type).toBe('policy');
    expect(doc!.linkedTo[0]).toMatchObject({ kind: 'policy', id: String(p!._id) });
    expect(await Commitment.countDocuments({ ownerId: 'owner', type: 'premium' })).toBe(1);
    expect(await Alert.countDocuments({ ownerId: 'owner', type: 'policy_added' })).toBe(1);
    expect((await RawEvent.findOne({ sourceId: 'acko-1' }))!.status).toBe('parsed');
  });

  it('a renewal for the same vehicle updates the policy instead of adding one', async () => {
    await signed(email());
    const renewal = ACKO_PDF_LINES.map((l) => l.replace('DBTR00123456789', 'DBTR00999999999').replace('18/11/2026 to 17/11/2027', '18/11/2027 to 17/11/2028').replace('1,847.00', '1,999.00'));
    const res = await signed(email({ messageId: 'acko-2', subject: 'Your ACKO policy has been renewed', attachments: [{ filename: 'renewal.pdf', mimeType: 'application/pdf', size: 1, base64: makePdf(renewal).toString('base64') }] }));
    expect(res.body.policy.created).toBe(false);
    const all = await Policy.find({ ownerId: 'owner' });
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ policyNumber: 'DBTR00999999999', premiumPaise: 199900 });
    expect(all[0].renewalDate!.toISOString()).toBe('2028-11-16T18:30:00.000Z');
    expect(all[0].documentIds).toHaveLength(2);
  });

  it('a scanned (image-only) PDF goes to review for on-phone OCR', async () => {
    const res = await signed(email({ messageId: 'scan-1', bodyText: 'Your policy document is attached.', attachments: [{ filename: 'scan.pdf', mimeType: 'application/pdf', size: 1, base64: makePdf([]).toString('base64') }] }));
    expect(res.status).toBe(200);
    expect(await Policy.countDocuments()).toBe(0);
    const raw = await RawEvent.findOne({ sourceId: 'scan-1' });
    expect(raw).toMatchObject({ status: 'needs_review', reviewReason: 'policy_scan_needed' });
    const review = await api.get('/api/finance/review');
    expect(review.body.events[0].attachments[0].filename).toBe('scan.pdf');
  });

  it('creating a policy from that review item links its document and clears it', async () => {
    await signed(email({ messageId: 'scan-2', bodyText: 'Your policy document is attached.', attachments: [{ filename: 'scan.pdf', mimeType: 'application/pdf', size: 1, base64: makePdf([]).toString('base64') }] }));
    const raw = await RawEvent.findOne({ sourceId: 'scan-2' });
    // The phone OCRs the scan and asks the server to read the text:
    const ex = await api.post('/api/finance/policies/extract').send({ text: ACKO_PDF_LINES.join('\n'), sender: 'policy@acko.com' });
    expect(ex.body.extraction.policyNumber).toBe('DBTR00123456789');
    const created = await api.post('/api/finance/policies').send({ insurer: ex.body.extraction.insurer, policyNumber: ex.body.extraction.policyNumber, type: 'vehicle', renewalDate: ex.body.extraction.endDate, fromRawEventId: String(raw!._id) });
    expect(created.status).toBe(201);
    expect(created.body.policy.documentIds).toHaveLength(1);
    expect((await RawEvent.findById(raw!._id))!.status).toBe('parsed');
  });
});

describe('optional AI backup (Cloudflare Workers AI)', () => {
  it('is off without a token', async () => {
    expect(await aiExtractPolicy('anything')).toBeNull();
  });

  it('sends masked text and keeps only values found in the document', async () => {
    process.env.CF_ACCOUNT_ID = 'acc';
    process.env.CF_AI_TOKEN = 'tok';
    const doc = 'Schedule\nCover holder Test Owner, phone 9876543210, test@example.com\nRef ZX-889911 issued by Navi General\nCover till 01-12-2027\nAmount 2,310';
    let sent = '';
    const fetchImpl: any = vi.fn(async (_url: string, init: any) => {
      sent = init.body;
      return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify({
        insurer: 'Navi General', policyNumber: 'ZX-889911', premium: '2,310', endDate: '01-12-2027', sumInsured: '5,00,000', nominee: 'Made Up',
      }) } }), { status: 200 });
    });
    const x = await aiExtractPolicy(doc, 'Test Owner', fetchImpl);
    expect(sent).not.toContain('9876543210');
    expect(sent).not.toContain('test@example.com');
    expect(sent).not.toContain('Owner');
    expect(x).toMatchObject({ insurer: 'Navi General', policyNumber: 'ZX-889911', premiumPaise: 231000, method: 'ai' });
    expect(x!.sumInsuredPaise).toBeUndefined(); // not in the document -> dropped
    expect(x!.nominee).toBeUndefined();
  });

  it('masks identifiers', () => {
    const m = maskForAi('PAN ABCDE1234F aadhaar 1234 5678 9012 card 4111 1111 1111 1111 call +91 98765 43210', 'Test Owner');
    expect(m).not.toMatch(/ABCDE1234F|1234 5678 9012|4111/);
  });
});

describe('PDF passwords', () => {
  it('are write-only', async () => {
    const r = await api.post('/api/finance/doc-passwords').send({ label: 'Acko (DOB)', password: '01011990' });
    expect(r.status).toBe(201);
    const list = await api.get('/api/finance/doc-passwords');
    expect(JSON.stringify(list.body)).not.toContain('01011990');
    expect((await DocPassword.findOne())!.passwordEnc).not.toContain('01011990');
  });
});
