import { Parser } from '../types';
import { amount, base, channelFromText, date, flat, senderIs } from './util';

// SBM Bank India (info@sbmbank.co.in), incl. Niyo cards. F7. (F15 OTPs are
// dropped by detectType before parsers run.)
export const sbmParser: Parser = {
  name: 'sbm',
  version: 1,
  matches: (sender) => senderIs(sender, 'sbmbank.co.in'),
  parse({ text, receivedAt }) {
    const t = flat(text);
    let m = t.match(/account X*(\d{4}) is (credited|debited) (?:with|for|by) (?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d+)?)(?: on (\S+))?/i);
    if (m) {
      return base({
        eventType: 'transaction', direction: m[2].toLowerCase() === 'credited' ? 'credit' : 'debit', amountPaise: amount(m[3])!,
        accountHint: m[1], occurredAt: (m[4] && date(m[4])) || receivedAt, channel: channelFromText(t), institution: 'sbm',
      });
    }
    m = t.match(/(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d+)?) (?:spent|debited) on your .*?card (?:ending )?X*(\d{4}) at (.+?) on (\S+)/i);
    if (m) {
      return base({
        eventType: 'transaction', direction: 'debit', amountPaise: amount(m[1])!, cardHint: m[2], merchant: m[3].trim(),
        occurredAt: date(m[4]) || receivedAt, channel: 'card', institution: 'sbm',
      });
    }
    return null;
  },
};
