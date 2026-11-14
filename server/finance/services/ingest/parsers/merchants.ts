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
    return orderParser.parse({ sender: 'no-reply@flipkart.com', subject: '', text, receivedAt });
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

// ---------------------------------------------------------------- shop orders

const SHOPS: { match: string[]; name: string; grocery: boolean }[] = [
  { match: ['blinkit.com', 'grofers'], name: 'Blinkit', grocery: true },
  { match: ['bigbasket.com', 'bbnow'], name: 'BigBasket', grocery: true },
  { match: ['zeptonow.com', 'zepto.co'], name: 'Zepto', grocery: true },
  { match: ['swiggy.in', 'swiggy.com'], name: 'Swiggy Instamart', grocery: true },
  { match: ['jiomart.com'], name: 'JioMart', grocery: true },
  { match: ['dmart.in', 'dmartready'], name: 'DMart', grocery: true },
  { match: ['amazon.in', 'amazon.com'], name: 'Amazon', grocery: false },
  { match: ['flipkart.com'], name: 'Flipkart', grocery: false },
  { match: ['myntra.com'], name: 'Myntra', grocery: false },
  { match: ['meesho.com'], name: 'Meesho', grocery: false },
  { match: ['ajio.com'], name: 'AJIO', grocery: false },
  { match: ['nykaa.com'], name: 'Nykaa', grocery: false },
  { match: ['tatacliq.com'], name: 'Tata CLiQ', grocery: false },
  { match: ['croma.com'], name: 'Croma', grocery: false },
  { match: ['decathlon.in'], name: 'Decathlon', grocery: false },
];

export function shopFor(sender: string) {
  const s = sender.toLowerCase();
  return SHOPS.find((shop) => shop.match.some((m) => s.includes(m)));
}

const TOTAL_LABELS = [
  'grand total', 'order total', 'total amount paid', 'amount paid', 'total paid', 'you paid', 'bill total', 'total payable',
  'net amount', 'order amount', 'total amount', 'item total', 'total',
];
const SKIP_ITEM = /total|charge|fee|discount|savings|saved|delivery|shipping|cashback|coupon|tax|gst|tip|donation|wallet|paid|refund|payable/i;
const AMT = '(?:₹|rs\\.?|inr)\\s*([\\d,]+(?:\\.\\d{1,2})?)';

/** The order's total: the first label (in priority order) followed by an amount. */
export function orderTotal(text: string): number | null {
  for (const label of TOTAL_LABELS) {
    const m = text.match(new RegExp(`${label.replace(/ /g, '\\s+')}\\s*(?:\\(.*?\\))?\\s*:?\\s*${AMT}`, 'i'));
    if (m) return amount(m[1]);
  }
  return null;
}

/** "Item ... x 2 ₹56", "Item  Qty: 1  ₹499.00", "Item ₹299" lines. */
export function orderItems(text: string): { name: string; qty?: number; amountPaise?: number }[] {
  const items: { name: string; qty?: number; amountPaise?: number }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    let m = line.match(new RegExp(`^(.{3,120}?)\\s+(?:x|×|qty:?|quantity:?)\\s*(\\d+)\\s+${AMT}\\s*$`, 'i'));
    if (!m) {
      const single = line.match(new RegExp(`^(.{3,120}?)\\s*[:\\-]?\\s+${AMT}\\s*$`, 'i'));
      if (single) m = [single[0], single[1], '1', single[2]] as unknown as RegExpMatchArray;
    }
    if (!m || SKIP_ITEM.test(m[1]) || /^[\d\s.,₹-]+$/.test(m[1])) continue;
    items.push({ name: m[1].replace(/\s+/g, ' ').trim(), qty: Number(m[2]), amountPaise: amount(m[3])! });
  }
  return items;
}

/**
 * Order / invoice emails from shops (Amazon, Flipkart, Instamart, Zepto,
 * BigBasket, Blinkit, Myntra, Meesho…). Reads the total and item lines and
 * hands them to the ledger, which attaches them to the matching payment.
 * Shipping/delivery updates without a total are ignored. Formats vary by
 * shop; anything unread falls back to the review queue.
 */
export const orderParser: Parser = {
  name: 'shop-order',
  version: 2,
  matches: (sender) => Boolean(shopFor(sender)),
  parse({ sender, subject, text, receivedAt }) {
    const shop = shopFor(sender)!;
    if (/refund/i.test(subject) || /refund amount/i.test(text)) return null; // Flipkart refunds: own parser
    const total = orderTotal(text);
    const isOrder = /order|invoice|receipt|purchase|placed|confirmed|bill/i.test(`${subject} ${text.slice(0, 400)}`);
    if (!total || !isOrder || /out for delivery|has been delivered|shipped|dispatched|arriving/i.test(subject)) {
      return base({ eventType: 'info', merchant: shop.name, sourceKind: 'merchant' });
    }
    const orderId = text.match(/Order (?:ID|No\.?|Number|#)\s*:?\s*#?\s*([A-Z0-9-]{6,})/i)?.[1];
    return base({
      eventType: 'order', amountPaise: total, merchant: shop.name, lineItems: orderItems(text), orderId,
      referenceIds: orderId ? [orderId] : [], occurredAt: receivedAt, sourceKind: 'merchant', direction: 'debit',
      notes: shop.grocery ? 'grocery' : 'shopping',
    });
  },
};

/** Kept for existing imports. */
export const groceryOrderParser = orderParser;
