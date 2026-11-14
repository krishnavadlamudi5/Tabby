import { Parser } from '../types';
import { amount, base, channelFromText, clean, date, flat, last4, senderIs } from './util';

// Kotak Mahindra Bank alerts (bankalerts@kotak.bank.in, BankAlerts@kotak.com,
// bankloanalerts@kotak.bank.in). Formats F1-F4, F11, F14.
function refs(t: string): string[] {
  const r = t.match(/reference No\.?(?: is)?\s*:?\s*(\w+)/i)?.[1];
  return r ? [r] : [];
}

export const kotakParser: Parser = {
  name: 'kotak',
  version: 1,
  matches: (sender) => senderIs(sender, 'kotak.bank.in', 'kotak.com'),
  parse({ subject, text, receivedAt }) {
    const t = flat(text);

    // F1: card transaction successful
    let m = t.match(/transaction of Rs\.?\s*([\d,]+(?:\.\d+)?) on (.+?) using Kotak Bank (Debit|Credit) Card X+(\d{4}) on (\d{1,2}\/\d{1,2}\/\d{4}(?: [\d:]+)?)(?: from your account X+(\d{4}))?/i);
    if (m && !/declined/i.test(subject + t)) {
      return base({
        eventType: 'transaction', direction: 'debit', amountPaise: amount(m[1])!, merchant: clean(m[2]),
        cardHint: m[4], accountHint: m[6], occurredAt: date(m[5]) || receivedAt, channel: 'card',
        institution: 'kotak', referenceIds: refs(t),
      });
    }

    // F2: card transaction declined
    m = t.match(/Card X+(\d{4}) transaction of Rs\.?\s*([\d,]+(?:\.\d+)?) at (.+?), on (\d{1,2}\/\d{1,2}\/\d{4}(?: [\d:]+)?) is declined(?: as (.+?)\.)?/i);
    if (m) {
      return base({
        eventType: 'declined', direction: 'debit', amountPaise: amount(m[2])!, merchant: clean(m[3]),
        cardHint: m[1], occurredAt: date(m[4]) || receivedAt, channel: 'card', institution: 'kotak', notes: clean(m[5]),
      });
    }

    // F3: credit against an earlier card transaction (reversal / refund)
    m = t.match(/amount of Rs\.?\s*([\d,]+(?:\.\d+)?) has been credited to your Kotak Bank Account X+(\d{4}) against your recent (?:Debit|Credit) Card transaction(?: with RRN (\d+))?/i);
    if (m) {
      return base({
        eventType: 'refund_credit', direction: 'credit', amountPaise: amount(m[1])!, accountHint: m[2],
        referenceIds: m[3] ? [m[3]] : [], occurredAt: receivedAt, channel: 'card', institution: 'kotak',
      });
    }

    // F11: loan installment due
    m = t.match(/Installment of Rs\.?\s*([\d,]+(?:\.\d+)?) towards your (.+?Loan) Account No\.?\s*:?\s*(\S+?) is due on (\S+)/i);
    if (m) {
      const acct = last4(m[3]) || m[3].slice(-4);
      return base({
        eventType: 'emi_due', amountPaise: amount(m[1])!, dueDate: date(m[4]) || undefined, institution: 'kotak',
        commitment: { type: 'emi', name: `${clean(m[2])} ••${acct}`, externalKey: `kotak-loan:${acct}`, status: 'due' },
      });
    }

    // F4 and other account debits/credits (IMPS / NEFT / UPI)
    m = t.match(/(?:Account|A\/c) x+(\d{4}) is (debited|credited) (?:for|with|by) Rs\.?\s*([\d,]+(?:\.\d+)?)(?: on (\S+))?(?: towards (\w+))?/i);
    if (m) {
      const benName = t.match(/Beneficiary Name\s*:?\s*(.+?)\s+Beneficiary Account/i)?.[1];
      const benAcct = t.match(/Beneficiary Account No\.?\s*:?\s*(\S+)/i)?.[1];
      const benIfsc = t.match(/Beneficiary IFSC\s*:?\s*([A-Z]{4}0[A-Z0-9]{6})/i)?.[1];
      const ref = t.match(/(?:IMPS|NEFT|UPI|RTGS) Reference No\.?\s*:?\s*(\w+)/i)?.[1]
        || t.match(/(?:UPI Ref(?:erence)?(?: No)?|Ref(?:erence)? No)\.?\s*:?\s*(\w+)/i)?.[1];
      const via = m[5] || t;
      return base({
        eventType: 'transaction', direction: m[2].toLowerCase() === 'debited' ? 'debit' : 'credit',
        amountPaise: amount(m[3])!, accountHint: m[1], occurredAt: (m[4] && date(m[4])) || receivedAt,
        channel: channelFromText(via), institution: 'kotak', referenceIds: ref ? [ref] : [],
        counterparty: benName || benAcct ? { name: clean(benName), account: last4(benAcct), ifsc: benIfsc?.toUpperCase() } : undefined,
        merchant: clean(benName) || clean(t.match(/(?:to|from) VPA (\S+)/i)?.[1]),
      });
    }

    // F14 and similar: account/card setting changes, no money moved
    if (/limit modification|limit has been|modified|changed|registered|activated|blocked/i.test(subject + ' ' + t)) {
      return base({ eventType: 'info', institution: 'kotak' });
    }
    return null;
  },
};
