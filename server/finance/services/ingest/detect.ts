import { EventType } from './types';

const OTP_RE = /\b(otp|one[\s-]?time[\s-]?password|verification code)\b/i;
const MARKETING_RE = /(cashback|offer|discount|% off|sale\b|deal|reward points?|win\b|hurry|limited period|unsubscribe|pre-?approved|apply now|upgrade now|exclusive)/i;
const MONEY_RE = /(?:₹|rs\.?|inr|\$|₨)\s*[\d,]+(?:\.\d+)?/i;
const ACCOUNT_RE = /\b(?:a\/c|account|card)\b[^.]{0,40}?x{2,}\d{3,4}/i;

/**
 * Cheap first pass on sender/subject/body. Parsers decide the details; this
 * decides what to ignore and where unparsed emails should go.
 */
export function detectType(sender: string, subject: string, text: string): EventType {
  const s = `${subject}\n${text}`;
  if (OTP_RE.test(subject) || OTP_RE.test(text.slice(0, 500))) return 'otp';

  const hasAccount = ACCOUNT_RE.test(s);
  const transactional = /(debited|credited|spent|paid|payment of|transaction of|refund|reversal|declined|installment|emi\b)/i.test(s);
  if (MARKETING_RE.test(subject) && !(hasAccount && transactional)) return 'marketing';

  if (/declined|failed transaction/i.test(subject)) return 'declined';
  if (/statement/i.test(subject) && !transactional) return 'statement';
  if (/\b(policy|renewal|premium|insurance|insured)\b/i.test(subject)) return 'policy';
  if (/installment|emi\b/i.test(subject)) return 'emi_due';
  if (/\bsip\b|order report/i.test(subject)) return 'sip_report';
  if (/subscription|renew(s|al)? (on|soon)|confirm your .*payment/i.test(subject)) return 'subscription';
  if (/refund/i.test(s)) return 'refund_credit';
  if (/order (summary|confirmed|placed|delivered)|invoice|receipt/i.test(subject)) return 'order';
  if (transactional && MONEY_RE.test(s)) return 'transaction';
  if (MARKETING_RE.test(text)) return 'marketing';
  return 'unknown';
}

export function hasMoneyAmount(text: string): boolean {
  return MONEY_RE.test(text);
}
