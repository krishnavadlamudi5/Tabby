import { Parser } from '../types';
import { amount, base, channelFromText, clean, date, flat, last4, senderIs } from './util';

// ICICI Bank alerts (customernotification@icici.bank.in, credit_cards@icicibank.com ...). F5, F6.
export const iciciParser: Parser = {
  name: 'icici',
  version: 1,
  matches: (sender) => senderIs(sender, 'icici.bank.in', 'icicibank.com'),
  parse({ text, receivedAt }) {
    const t = flat(text);

    // F5: UPI payment charged to an ICICI credit card
    let m = t.match(/UPI payment of ₹\s*([\d,]+(?:\.\d+)?)/i);
    const card = t.match(/Credit Card\s*:?\s*ICICI Bank Credit Card X*(\d{4})/i);
    if (m && card) {
      const payee = t.match(/Payee\s*:?\s*(.+?)\s+Date and Time/i)?.[1];
      const when = t.match(/Date and Time\s*:?\s*(.+?)\s+Transaction ID/i)?.[1];
      const txnId = t.match(/Transaction ID\s*:?\s*(\w+)/i)?.[1];
      return base({
        eventType: 'transaction', direction: 'debit', amountPaise: amount(m[1])!, cardHint: card[1], merchant: clean(payee),
        occurredAt: (when && date(when)) || receivedAt, channel: 'upi', institution: 'icici', referenceIds: txnId ? [txnId] : [],
      });
    }

    // F6: UPI payment from an ICICI bank account
    m = t.match(/UPI payment of ₹\s*([\d,]+(?:\.\d+)?) using the iMobile app to (.+?)\. The payment was initiated from your ICICI bank account X*(\d{4})(?: through transaction ID (\w+))?(?: on (.+?\d{4}))?/i);
    if (m) {
      return base({
        eventType: 'transaction', direction: 'debit', amountPaise: amount(m[1])!, merchant: clean(m[2]), accountHint: m[3],
        referenceIds: m[4] ? [m[4]] : [], occurredAt: (m[5] && date(m[5])) || receivedAt, channel: 'upi', institution: 'icici',
      });
    }

    // Credit card spend: "ICICI Bank Credit Card XX5002 has been used for a transaction of INR 1,234.00 on Nov 14, 2026 at 10:00:00. Info: AMAZON"
    m = t.match(/Credit Card X*(\d{4}) has been used for a transaction of (?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d+)?) on (.+?\d{4})(?: at ([\d:]+))?\.? Info:?\s*(.+?)\./i);
    if (m) {
      return base({
        eventType: 'transaction', direction: 'debit', amountPaise: amount(m[2])!, cardHint: m[1], merchant: clean(m[5]),
        occurredAt: date(`${m[3]} ${m[4] || ''}`) || receivedAt, channel: 'card', institution: 'icici',
      });
    }

    // Account debit/credit: "ICICI Bank Account XX1042 debited/credited with Rs/INR 500.00 on 14-Nov-26 ..."
    m = t.match(/Account X*(\d{4}) (?:is |has been )?(debited|credited) (?:with|for|by) (?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d+)?)(?: on (\S+))?/i);
    if (m) {
      const info = t.match(/Info:?\s*(.+?)(?:\.|$)/i)?.[1];
      const ref = t.match(/(?:UPI|IMPS|NEFT)?\s*Ref(?:erence)?(?: No)?\.?\s*:?\s*(\d{6,})/i)?.[1];
      return base({
        eventType: 'transaction', direction: m[2].toLowerCase() === 'debited' ? 'debit' : 'credit', amountPaise: amount(m[3])!,
        accountHint: m[1], occurredAt: (m[4] && date(m[4])) || receivedAt, channel: channelFromText(t), merchant: clean(info),
        institution: 'icici', referenceIds: ref ? [ref] : [],
      });
    }
    void last4;
    return null;
  },
};
