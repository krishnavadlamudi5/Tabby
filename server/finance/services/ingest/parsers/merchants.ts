import { Parser } from '../types';
import { amount, base, clean, date, flat, senderIs } from './util';

// Payment gateways and shops. These never name the bank account, so they
// are 'merchant' evidence: merged with the bank alert by dedupe, or left for
// review / the statement to place on an account.

export const razorpayParser: Parser = {
  name: 'razorpay',
  version: 1,
  matches: (sender) => senderIs(sender, 'razorpay.com'),
  parse({ subject, text, receivedAt }) {
    const t = flat(text);
    const m = t.match(/₹\s*([\d,]+(?:\.\d+)?)\s+Paid Successfully/i);
    if (!m) return null;
    const merchant = clean(subject.match(/Payment successful for (.+)$/i)?.[1]) || clean(t.split('₹')[0]);
    const payId = t.match(/Payment Id\s*:?\s*(pay_\w+)/i)?.[1];
    const method = t.match(/Method\s*:?\s*(\w+)/i)?.[1]?.toLowerCase();
    const paidOn = t.match(/Paid On\s*:?\s*(.+?(?:AM|PM))/i)?.[1];
    return base({
      eventType: 'transaction', direction: 'debit', amountPaise: amount(m[1])!, merchant,
      channel: method === 'upi' ? 'upi' : method === 'netbanking' ? 'netbanking' : method === 'card' ? 'card' : 'other',
      referenceIds: payId ? [payId] : [], occurredAt: (paidOn && date(paidOn)) || receivedAt, sourceKind: 'merchant',
    });
  },
};

export const payuParser: Parser = {
  name: 'payu',
  version: 1,
  matches: (sender) => senderIs(sender, 'payu.in'),
  parse({ text, receivedAt }) {
    const t = flat(text);
    const m = t.match(/completed a payment of Rs\.?\s*([\d,]+(?:\.\d+)?) to (.+?)(?:\.\s|\s+Transaction|\s+Payment Mode|$)/i);
    if (!m) return null;
    const mode = t.match(/Payment Mode\s*:?\s*(\w+)/i)?.[1]?.toLowerCase();
    const txnId = t.match(/Transaction Id\s*:?\s*(\w+)/i)?.[1];
    return base({
      eventType: 'transaction', direction: 'debit', amountPaise: amount(m[1])!, merchant: clean(m[2]),
      channel: mode === 'upi' ? 'upi' : mode && /card/.test(mode) ? 'card' : mode === 'netbanking' ? 'netbanking' : 'other',
      referenceIds: txnId ? [txnId] : [], occurredAt: receivedAt, sourceKind: 'merchant',
    });
  },
};

export const flipkartParser: Parser = {
  name: 'flipkart',
  version: 1,
  matches: (sender) => senderIs(sender, 'flipkart.com'),
  parse({ text, receivedAt }) {
    const t = flat(text);
    const refund = t.match(/Refund amount\s*(?:₨|Rs|₹)\.?\s*([\d,]+(?:\.\d+)?)/i);
    if (refund) {
      const bank = t.match(/Bank name\s*:?\s*([A-Za-z]+)/i)?.[1];
      const card = t.match(/Card number\s*:?\s*[*xX]+(\d{4})/i)?.[1];
      const by = t.match(/added to your (?:card|account|bank account) by (.+?\d{4})/i)?.[1];
      const orderId = t.match(/Order ID\s*:?\s*(OD\w+)/i)?.[1];
      return base({
        eventType: 'expected_refund', direction: 'credit', amountPaise: amount(refund[1])!, merchant: 'Flipkart',
        cardHint: card, institution: bank?.toLowerCase(), expectedAt: (by && date(by)) || undefined,
        referenceIds: orderId ? [orderId] : [], orderId, occurredAt: receivedAt, sourceKind: 'merchant', channel: card ? 'card' : 'other',
      });
    }
    return null;
  },
};

export const zerodhaParser: Parser = {
  name: 'zerodha',
  version: 1,
  matches: (sender) => senderIs(sender, 'zerodha.net', 'zerodha.com'),
  parse({ text, receivedAt }) {
    const t = text;
    const value = t.match(/Order value\s*:?\s*₹\s*([\d,]+(?:\.\d+)?)/i);
    if (!value) return null;
    const fund = clean(t.match(/\n([A-Z0-9 &().-]+(?:FUND|PLAN)[A-Z0-9 &().-]*)\n/)?.[1]) || 'SIP order';
    const failed = /order failed|payment not initiated|rejected/i.test(t);
    const reason = clean(t.match(/(Payment not initiated[^\n]*|Insufficient[^\n]*|Rejected[^\n]*)/i)?.[1]);
    return base({
      eventType: 'sip_report', amountPaise: amount(value[1])!, merchant: fund, occurredAt: receivedAt, institution: 'zerodha',
      commitment: {
        type: 'sip', name: fund, externalKey: `sip:${fund.toLowerCase()}`, status: failed ? 'failed' : 'paid', note: reason,
      },
    });
  },
};

export const stripeParser: Parser = {
  name: 'stripe',
  version: 1,
  matches: (sender) => senderIs(sender, 'stripe.com'),
  parse({ subject, text, receivedAt }) {
    const s = `${subject} ${flat(text)}`;
    const m = s.match(/Confirm your \$([\d,]+(?:\.\d+)?) payment to (.+?)(?:\.|$)/i)
      || s.match(/confirm your payment of \$([\d,]+(?:\.\d+)?)/i);
    if (!m) return null;
    const to = clean(m[2]) || clean(s.match(/\n?(.+?) needs you to confirm/i)?.[1]) || 'Subscription';
    return base({
      eventType: 'subscription', amountPaise: amount(m[1])!, currency: 'USD', merchant: to, occurredAt: receivedAt, sourceKind: 'merchant',
      commitment: { type: 'subscription', name: to, externalKey: `sub:${to.toLowerCase()}`, status: 'action_needed', note: 'Payment needs confirmation' },
    });
  },
};

/**
 * Grocery / quick-commerce orders (Blinkit, BigBasket, Zepto, Swiggy
 * Instamart). Reads "Item name ... x 2 ₹56" lines and the grand total.
 * Synthetic fixture (X06); real layouts may need tuning - unmatched emails
 * fall back to the review queue.
 */
export const groceryOrderParser: Parser = {
  name: 'grocery-order',
  version: 1,
  matches: (sender) => senderIs(sender, 'blinkit.com', 'bigbasket.com', 'zeptonow.com', 'zepto.co', 'swiggy.in'),
  parse({ sender, text, receivedAt }) {
    const total = text.match(/(?:Grand total|Order total|Total paid|Amount paid|Bill total)\s*:?\s*(?:₹|Rs\.?)\s*([\d,]+(?:\.\d+)?)/i);
    if (!total) return null;
    const items: { name: string; qty?: number; amountPaise?: number }[] = [];
    for (const line of text.split('\n')) {
      const im = line.match(/^(.+?)\s+(?:x|×|qty:?)\s*(\d+)\s+(?:₹|Rs\.?)\s*([\d,]+(?:\.\d+)?)\s*$/i);
      if (im && !/total|charge|fee|discount|savings/i.test(im[1])) {
        items.push({ name: im[1].trim(), qty: Number(im[2]), amountPaise: amount(im[3])! });
      }
    }
    const merchant = /blinkit/i.test(sender) ? 'Blinkit' : /bigbasket/i.test(sender) ? 'BigBasket' : /zepto/i.test(sender) ? 'Zepto' : 'Swiggy Instamart';
    const orderId = text.match(/Order (?:ID|No\.?|#)\s*:?\s*(\w+)/i)?.[1];
    return base({
      eventType: 'order', amountPaise: amount(total[1])!, merchant, lineItems: items, orderId,
      referenceIds: orderId ? [orderId] : [], occurredAt: receivedAt, sourceKind: 'merchant', direction: 'debit',
    });
  },
};
