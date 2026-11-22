import { describe, expect, it } from 'vitest';
import { detectType } from '../services/ingest/detect';
import { findParser } from '../services/ingest/parsers';
import { institutionForSms } from '../services/ingest/parsers/sms';
import { normaliseBody } from '../services/ingest/text';

const received = new Date('2026-11-20T12:00:00+05:30');

function parse(sender: string, body: string) {
  const text = normaliseBody(body);
  const detected = detectType(sender, '', text);
  const parser = findParser(sender, '');
  const ext = parser?.parse({ sender, subject: '', text, receivedAt: received }) || null;
  return { detected, parser: parser?.name, ext };
}

describe('bank SMS parser', () => {
  it('maps DLT sender IDs to banks', () => {
    expect(institutionForSms('hdfcbk@sms')).toBe('hdfc');
    expect(institutionForSms('icicit@sms')).toBe('icici');
    expect(institutionForSms('sbiinb@sms')).toBe('sbi');
    expect(institutionForSms('axisbk@sms')).toBe('axis');
    expect(institutionForSms('swiggy@sms')).toBeUndefined();
  });

  it('HDFC UPI debit', () => {
    const { parser, ext } = parse('hdfcbk@sms', 'Sent Rs.250.00 From HDFC Bank A/C *1234 To SWIGGY On 20/11/26 Ref 432198765432 Not You? Call 18002586161/SMS BLOCK UPI to 7308080808');
    expect(parser).toBe('sms');
    expect(ext).toMatchObject({ eventType: 'transaction', direction: 'debit', amountPaise: 25000, accountHint: '1234', merchant: 'SWIGGY', institution: 'hdfc' });
    expect(ext!.referenceIds).toContain('432198765432');
  });

  it('HDFC credit card spend', () => {
    const { ext } = parse('hdfcbk@sms', 'Spent Rs.1,499.00 On HDFC Bank Card 5678 At AMAZON PAY INDIA On 2026-11-19:18:22:10.Not You? To Block+Reissue Call 18002586161');
    expect(ext).toMatchObject({ eventType: 'transaction', direction: 'debit', amountPaise: 149900, cardHint: '5678', channel: 'card', merchant: 'AMAZON PAY INDIA' });
    expect(ext!.occurredAt!.toISOString()).toBe('2026-11-19T12:52:10.000Z');
  });

  it('ICICI account debit ignores the balance amount', () => {
    const { ext } = parse('icicit@sms', 'ICICI Bank Acct XX901 debited for Rs 2,000.00 on 18-Nov-26; ZOMATO credited. UPI:432112345678. Call 18002662 for dispute. Avl Bal Rs 45,000.00');
    expect(ext).toMatchObject({ direction: 'debit', amountPaise: 200000, accountHint: '901', channel: 'upi' });
  });

  it('SBI salary credit', () => {
    const { ext } = parse('sbiinb@sms', 'Dear Customer, Your A/C XXXXX6789 has a credit by NEFT of Rs 85,000.00 on 01/11/26 by ACME TECHNOLOGIES PVT LTD. Avl Bal Rs 1,20,000.50 -SBI');
    expect(ext).toMatchObject({ direction: 'credit', amountPaise: 8500000, accountHint: '6789', channel: 'neft', merchant: 'ACME TECHNOLOGIES PVT LTD' });
  });

  it('Kotak credit with "received"', () => {
    const { ext } = parse('kotakb@sms', 'Received Rs.500.00 in your Kotak Bank a/c XX4321 from rahul@okaxis on 19-11-26.UPI Ref:987654321098.');
    expect(ext).toMatchObject({ direction: 'credit', amountPaise: 50000, accountHint: '4321', channel: 'upi', merchant: 'rahul@okaxis' });
  });

  it('declined card transaction', () => {
    const { ext } = parse('axisbk@sms', 'Transaction of INR 3,200.00 on Axis Bank Credit Card XX2222 at FLIPKART has been declined due to insufficient limit.');
    expect(ext).toMatchObject({ eventType: 'declined', amountPaise: 320000, cardHint: '2222' });
  });

  it('refund credit', () => {
    const { ext } = parse('hdfcbk@sms', 'Refund of Rs.799.00 from MYNTRA has been credited to your HDFC Bank Card ending 5678 on 20-11-26.');
    expect(ext).toMatchObject({ eventType: 'refund_credit', direction: 'credit', amountPaise: 79900, cardHint: '5678' });
  });

  it('OTP SMS is dropped before parsing', () => {
    expect(parse('hdfcbk@sms', '123456 is your OTP for txn of Rs.1,499.00 at AMAZON on HDFC Bank Card 5678. Valid for 5 mins.').detected).toBe('otp');
  });

  it('loan offers are marketing, not money', () => {
    expect(parse('hdfcbk@sms', 'Get a pre-approved personal loan of Rs 5,00,000 instantly! Apply now: hdfc.bank/x').detected).toBe('marketing');
  });

  it('balance-only messages are not transactions', () => {
    expect(parse('sbiinb@sms', 'Avl Bal in your A/C XX6789 is Rs 12,000.00 as on 20/11/26.').ext).toBeNull();
  });

  it('does not claim SMS from unknown senders', () => {
    expect(parse('swiggy@sms', 'Your order of Rs 250 is on the way').parser).toBeUndefined();
  });
});

import { smsSenderFromAddress } from '../services/ingest/parsers/sms';

describe('SMS sender IDs', () => {
  it('normalises operator prefixes and DLT suffixes', () => {
    expect(smsSenderFromAddress('VM-HDFCBK-S')).toBe('hdfcbk@sms');
    expect(smsSenderFromAddress('AD-ICICIT')).toBe('icicit@sms');
    expect(smsSenderFromAddress('HDFCBK')).toBe('hdfcbk@sms');
    expect(smsSenderFromAddress('+919876543210')).toBe('');
  });
});
