import { parseAmountToPaise } from '../../../lib/money';
import { parseIndianDate } from '../../../lib/time';
import { Extraction } from '../types';
import { flat, last4 } from '../text';

export { flat, last4, parseAmountToPaise as amount, parseIndianDate as date };

export function senderIs(sender: string, ...patterns: (string | RegExp)[]): boolean {
  const s = sender.toLowerCase();
  return patterns.some((p) => (typeof p === 'string' ? s.includes(p) : p.test(s)));
}

export function base(partial: Partial<Extraction> & Pick<Extraction, 'eventType'>): Extraction {
  return { referenceIds: [], sourceKind: 'bank', confidence: 1, currency: 'INR', ...partial };
}

export function clean(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.replace(/\s+/g, ' ').replace(/^[\s:,-]+|[\s.,:-]+$/g, '').trim();
  return t || undefined;
}

export function channelFromText(s: string): Extraction['channel'] {
  const t = s.toLowerCase();
  if (/\bupi\b/.test(t)) return 'upi';
  if (/\bimps\b/.test(t)) return 'imps';
  if (/\bneft\b/.test(t)) return 'neft';
  if (/\brtgs\b/.test(t)) return 'rtgs';
  if (/net ?banking/.test(t)) return 'netbanking';
  if (/auto ?debit|nach|e-?mandate|si\b/.test(t)) return 'autodebit';
  if (/\bcard\b/.test(t)) return 'card';
  return 'other';
}
