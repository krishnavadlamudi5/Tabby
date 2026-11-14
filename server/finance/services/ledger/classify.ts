import { IAccount } from '../../models';
import { normaliseMerchant } from './merchants';

function nameTokens(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((t) => t.length > 1);
}

/** True when two person names share all tokens of the shorter one ("TEST OWNER" ~ "Test K Owner"). */
export function sameName(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((t) => long.includes(t));
}

/**
 * IMPS/NEFT/UPI between the owner's own accounts: the counterparty is the
 * owner by name, or its account number / IFSC matches another owned account.
 */
export function isSelfTransfer(input: {
  channel?: string;
  counterparty?: { name?: string; account?: string; ifsc?: string };
  ownerName: string;
  accounts: IAccount[];
  accountId: string | null;
}): boolean {
  const cp = input.counterparty;
  if (!cp) return false;
  if (!['imps', 'neft', 'rtgs', 'upi', 'netbanking', 'other'].includes(input.channel || 'other')) return false;
  const others = input.accounts.filter((a) => String(a._id) !== input.accountId);
  if (cp.account && others.some((a) => a.last4 === cp.account || a.aliases.some((x) => x.replace(/\D/g, '').endsWith(cp.account!)))) return true;
  if (cp.ifsc && cp.account && others.some((a) => a.ifsc === cp.ifsc)) return true;
  return sameName(cp.name, input.ownerName) || input.accounts.some((a) => sameName(cp.name, a.holderName));
}

const CC_BILL_RE = /(credit ?card|cc) (bill|payment|pymt)|card ?payment|billdesk.*card|\bcred\b|cred club|cheq|payment to .*card|autopay.*card/i;

/** Paying a credit card bill moves money, it isn't spending. */
export function isCreditCardBillPayment(input: {
  direction: 'debit' | 'credit';
  merchant?: string;
  description?: string;
  counterpartyAccount?: string;
  account: IAccount | null;
  accounts: IAccount[];
}): boolean {
  const text = `${input.merchant || ''} ${input.description || ''}`;
  if (input.direction === 'debit') {
    if (CC_BILL_RE.test(text)) return true;
    if (input.counterpartyAccount && input.accounts.some((a) => a.type === 'credit_card' && (a.last4 === input.counterpartyAccount || a.cardLast4s.includes(input.counterpartyAccount!)))) return true;
    return false;
  }
  // A credit on a credit card that isn't a refund is the bill being paid.
  return input.account?.type === 'credit_card' && /payment (received|credited)|thank you for (your )?payment/i.test(text);
}

export function merchantKey(m: string | undefined): string {
  return normaliseMerchant(m).split(' ').slice(0, 3).join(' ');
}
