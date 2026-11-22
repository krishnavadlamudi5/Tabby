import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'web' }, registerPlugin: () => ({}) }));

import { looksLikeBankAlert } from '../sms';

const at = (address: string, body: string) => looksLikeBankAlert({ address, body, date: 0 });

describe('looksLikeBankAlert (what may leave the phone)', () => {
  it('keeps bank debit/credit alerts', () => {
    expect(at('VM-HDFCBK-S', 'Sent Rs.250.00 From HDFC Bank A/C *1234 To SWIGGY On 20/11/26')).toBe(true);
    expect(at('AD-ICICIT', 'ICICI Bank Acct XX901 debited for Rs 2,000.00 on 18-Nov-26')).toBe(true);
    expect(at('SBIINB', 'Your A/C XXXXX6789 has a credit by NEFT of Rs 85,000.00')).toBe(true);
  });
  it('never sends OTPs', () => {
    expect(at('VM-HDFCBK', '123456 is your OTP for txn of Rs.1,499.00 at AMAZON. Do not share.')).toBe(false);
  });
  it('never sends SMS from phone numbers', () => {
    expect(at('+919876543210', 'I sent you Rs 500, received?')).toBe(false);
  });
  it('skips non-money messages', () => {
    expect(at('VM-AIRTEL', 'Your data pack expires today')).toBe(false);
  });
});
