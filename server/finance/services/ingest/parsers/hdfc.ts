import { Parser } from '../types';
import { amount, base, channelFromText, clean, date, flat, senderIs } from './util';

// HDFC Bank alerts (alerts@hdfcbank.net / hdfcbank.bank.in). Used for credit
// card refunds settling Flipkart expected refunds (scenario S4) and spends.
export const hdfcParser: Parser = {
  name: 'hdfc',
  version: 1,
  matches: (sender) => senderIs(sender, 'hdfcbank.net', 'hdfcbank.com', 'hdfcbank.bank.in'),
  parse({ text, receivedAt }) {
    const t = flat(text);
    let m = t.match(/(?:refund|reversal) of Rs\.?\s*([\d,]+(?:\.\d+)?)(?: from (.+?))? has been credited to your HDFC Bank Credit Card ending (\d{4})(?: on (\S+))?/i);
    if (m) {
      return base({
        eventType: 'refund_credit', direction: 'credit', amountPaise: amount(m[1])!, merchant: clean(m[2]), cardHint: m[3],
        occurredAt: (m[4] && date(m[4])) || receivedAt, channel: 'card', institution: 'hdfc',
      });
    }
    m = t.match(/Rs\.?\s*([\d,]+(?:\.\d+)?) (?:has been )?(?:spent|debited) (?:on|from) (?:your )?HDFC Bank (?:Credit|Debit) Card (?:ending |x+)(\d{4}) at (.+?) on (\S+(?: [\d:]+)?)/i);
    if (m) {
      return base({
        eventType: 'transaction', direction: 'debit', amountPaise: amount(m[1])!, cardHint: m[2], merchant: clean(m[3]),
        occurredAt: date(m[4]) || receivedAt, channel: 'card', institution: 'hdfc',
      });
    }
    m = t.match(/Rs\.?\s*([\d,]+(?:\.\d+)?) has been (debited|credited) (?:from|to) (?:your )?(?:HDFC Bank )?account (?:\*+|x+)(\d{4})(?: to| by)? (.+?) on (\S+)/i);
    if (m) {
      return base({
        eventType: 'transaction', direction: m[2].toLowerCase() === 'debited' ? 'debit' : 'credit', amountPaise: amount(m[1])!,
        accountHint: m[3], merchant: clean(m[4]), occurredAt: date(m[5]) || receivedAt, channel: channelFromText(t), institution: 'hdfc',
      });
    }
    return null;
  },
};
