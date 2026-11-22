import { Extraction, Parser } from '../types';
import { amount, base, channelFromText, clean, date, flat } from './util';

// Bank and card alert SMS read from the phone's inbox (see
// src/features/finance/sms). The app sends each one with sender
// "<header>@sms", where <header> is the DLT sender ID without its
// operator prefix ("VM-HDFCBK-S" -> "hdfcbk@sms").

/** DLT sender IDs -> institution. Prefix match, so HDFCBK covers HDFCBN too via its own entry. */
const BANK_SENDERS: [RegExp, string][] = [
  [/^hdfc(bk|bn|cc)?/, 'hdfc'],
  [/^icici[a-z]?/, 'icici'],
  [/^kotak[a-z]?/, 'kotak'],
  [/^(sbiinb|sbipsg|sbmsms|atmsbi|cbssbi|sbiupi|sbiotp|sbicrd|sbicard)/, 'sbi'],
  [/^sbmbnk|^sbmind|^sbmbank/, 'sbm'],
  [/^axis(bk|bn)?/, 'axis'],
  [/^yesbnk|^yesbank/, 'yes'],
  [/^idfcfb|^idfcbk/, 'idfc'],
  [/^indusb|^induslnd/, 'indusind'],
  [/^pnbsms|^punbnk/, 'pnb'],
  [/^boiind|^bobtxn|^bobsms/, 'bob'],
  [/^canbnk/, 'canara'],
  [/^unionb|^ubinmb/, 'union'],
  [/^federl|^fedbnk/, 'federal'],
  [/^rblbnk|^rblcrd/, 'rbl'],
  [/^aubank|^aubnk/, 'au'],
  [/^amexin/, 'amex'],
  [/^pytmbk|^paytmb/, 'paytm'],
  [/^onecrd/, 'onecard'],
  [/^idbibk/, 'idbi'],
];

/**
 * "VM-HDFCBK-S" / "AD-ICICIT" / "HDFCBK" -> "hdfcbk@sms". Returns '' for
 * phone numbers: bank alerts always come from an alphanumeric header.
 */
export function smsSenderFromAddress(address: string): string {
  const a = address.trim().toUpperCase().replace(/\s+/g, '');
  if (!/[A-Z]/.test(a)) return '';
  const parts = a.split('-').filter(Boolean);
  // Strip the 2-letter operator/circle prefix and the 1-letter DLT suffix.
  if (parts.length > 1 && /^[A-Z]{2}$/.test(parts[0])) parts.shift();
  if (parts.length > 1 && /^[A-Z]$/.test(parts[parts.length - 1])) parts.pop();
  const header = parts.join('').toLowerCase();
  return header ? `${header}@sms` : '';
}

export function smsHeader(sender: string): string {
  return sender.toLowerCase().replace(/@sms$/, '');
}

export function institutionForSms(sender: string): string | undefined {
  const h = smsHeader(sender);
  return BANK_SENDERS.find(([re]) => re.test(h))?.[1];
}

const AMT = String.raw`(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)`;
const DEBIT_RE = /\b(debited|spent|sent|paid|withdrawn|deducted|used for|charged|purchase of|txn of|transaction of)\b/i;
const CREDIT_RE = /\b(credited|received|deposited|refunded|credit (?:by|of))\b/i;

function firstIndex(re: RegExp, s: string): number {
  const m = s.match(re);
  return m && m.index !== undefined ? m.index : -1;
}

/** The transaction amount: the first amount that isn't a balance or limit. */
function txnAmount(t: string): number | null {
  const re = new RegExp(AMT, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const before = t.slice(Math.max(0, m.index - 25), m.index).toLowerCase();
    if (/(bal(ance)?|avl|available|limit|outstanding|due)[\s:.-]*$/.test(before)) continue;
    const p = amount(m[1]);
    if (p && p > 0) return p;
  }
  return null;
}

function accountHint(t: string): string | undefined {
  const m = t.match(/\b(?:a\/c|acct|account|ac)\b\.?\s*(?:no\.?\s*)?(?:ending\s*(?:with)?\s*)?[x*]*\s*(\d{3,6})\b/i);
  return m ? m[1].slice(-4) : undefined;
}

function cardHint(t: string): string | undefined {
  const m = t.match(/\bcard\b[^.\d]{0,30}?(?:(?:ending\s*(?:with)?|no\.?|x+|\*+)\s*)?[x*]*\s*(\d{4})\b/i);
  return m ? m[1] : undefined;
}

function merchantOf(t: string, direction: 'debit' | 'credit'): string | undefined {
  const stop = String.raw`(?=\s+(?:on|ref|upi|avl|bal|txn|via|using|from|not you|if not|for|-\s)|[.(]|$)`;
  const tries: RegExp[] = direction === 'debit'
    ? [
        new RegExp(String.raw`\bat\s+(.+?)${stop}`, 'i'),
        new RegExp(String.raw`\bto\s+vpa\s+(\S+?)${stop}`, 'i'),
        new RegExp(String.raw`\b(?:trf|transfer(?:red)?|paid|sent)?\s*to\s+(.+?)${stop}`, 'i'),
        new RegExp(String.raw`\btowards\s+(.+?)${stop}`, 'i'),
        new RegExp(String.raw`\binfo[:\s]+(.+?)${stop}`, 'i'),
      ]
    : [
        new RegExp(String.raw`\bfrom\s+vpa\s+(\S+?)${stop}`, 'i'),
        new RegExp(String.raw`\b(?:by|from)\s+(?!a\/c|your|account)(.+?)${stop}`, 'i'),
        new RegExp(String.raw`\binfo[:\s]+(.+?)${stop}`, 'i'),
      ];
  for (const re of tries) {
    for (const m of t.matchAll(new RegExp(re.source, 'gi'))) {
      const name = clean(m[1]);
      if (!name) continue;
      if (/^(a\/c|your|account|xx|\*|neft|imps|rtgs|upi\b)/i.test(name)) continue;
      if (/^[x*\d\s]+$/i.test(name) || /(?:rs\.?|inr|₹)\s*\d/i.test(name)) continue;
      return name.slice(0, 80);
    }
  }
  return undefined;
}

function occurredAt(t: string, receivedAt: Date): Date {
  const m = t.match(/\bon\s+([0-9]{1,4}[-/][0-9A-Za-z]{1,9}[-/][0-9]{2,4}(?:[: ,]+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?|\d{1,2}\s+[A-Za-z]{3,9},?\s+\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);
  const d = m ? date(m[1].replace(/^(\d{4}-\d{2}-\d{2}):/, '$1 ')) : null;
  // Ignore dates that are clearly wrong (more than a day in the future).
  if (d && d.getTime() <= receivedAt.getTime() + 86_400_000) return d;
  return receivedAt;
}

function references(t: string): string[] {
  const out: string[] = [];
  const re = /\b(?:upi\s*ref(?:erence)?(?:\s*no)?|ref(?:erence)?(?:\s*no)?|rrn|txn\s*id|utr)[\s.:#-]*([A-Za-z0-9]{6,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

export const smsParser: Parser = {
  name: 'sms',
  version: 1,
  matches: (sender) => sender.toLowerCase().endsWith('@sms') && Boolean(institutionForSms(sender)),
  parse({ sender, text, receivedAt }): Extraction | null {
    const t = flat(text);
    const institution = institutionForSms(sender);
    const paise = txnAmount(t);
    if (!paise) return null;

    const card = cardHint(t);
    const account = card ? undefined : accountHint(t);
    if (!card && !account && !/\bupi\b|\bvpa\b/i.test(t)) return null;

    let channel = channelFromText(t);
    if (/\bvpa\b|@[a-z]+\b/i.test(t) && channel === 'other') channel = 'upi';
    if (card && channel === 'other') channel = 'card';

    const common = {
      amountPaise: paise, accountHint: account, cardHint: card, institution, channel,
      occurredAt: occurredAt(t, receivedAt), referenceIds: references(t),
    };

    if (/\b(declined|failed|unsuccessful|could not be processed)\b/i.test(t)) {
      return base({ eventType: 'declined', direction: 'debit', ...common, merchant: merchantOf(t, 'debit') });
    }
    if (/\b(refund|reversal|reversed)\b/i.test(t) && CREDIT_RE.test(t)) {
      return base({ eventType: 'refund_credit', direction: 'credit', ...common, merchant: merchantOf(t, 'credit') });
    }

    const d = firstIndex(DEBIT_RE, t);
    const c = firstIndex(CREDIT_RE, t);
    if (d < 0 && c < 0) return null;
    // "A/c X debited ... and A/c Y credited" (a transfer) reads as a debit
    // for the owner; whichever verb comes first wins.
    const direction: 'debit' | 'credit' = d >= 0 && (c < 0 || d < c) ? 'debit' : 'credit';
    return base({ eventType: 'transaction', direction, ...common, merchant: merchantOf(t, direction) });
  },
};
