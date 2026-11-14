import { Types } from 'mongoose';
import { IRule, ITransaction, Rule } from '../../models';
import { categoryIdsByKey } from '../categories';
import { dictionaryCategoryKey, normaliseMerchant } from './merchants';

export interface CategorizeResult {
  categoryId: Types.ObjectId | null;
  source: 'rule' | 'dictionary' | '';
  kind?: string;
  tags?: string[];
  splitTemplateId?: Types.ObjectId;
  ruleId?: Types.ObjectId;
}

export function ruleMatches(rule: IRule, t: { merchant?: string; merchantRaw?: string; sender?: string; channel?: string; amountPaise: number }): boolean {
  const m = rule.match || {};
  if (m.merchantContains) {
    const needle = m.merchantContains.toLowerCase();
    const hay = `${(t.merchant || '').toLowerCase()} ${(t.merchantRaw || '').toLowerCase()} ${normaliseMerchant(t.merchant)}`;
    if (!hay.includes(needle)) return false;
  }
  if (m.senderEquals && (t.sender || '').toLowerCase() !== m.senderEquals.toLowerCase()) return false;
  if (m.channel && t.channel !== m.channel) return false;
  if (m.amountMinPaise !== undefined && m.amountMinPaise !== null && t.amountPaise < m.amountMinPaise) return false;
  if (m.amountMaxPaise !== undefined && m.amountMaxPaise !== null && t.amountPaise > m.amountMaxPaise) return false;
  return Boolean(m.merchantContains || m.senderEquals || m.channel || m.amountMinPaise !== undefined || m.amountMaxPaise !== undefined);
}

/**
 * Category for a transaction: the owner's rules (highest priority, newest
 * first) -> built-in merchant dictionary -> uncategorised. No AI.
 */
export async function categorize(ownerId: string, t: {
  merchant?: string; merchantRaw?: string; sender?: string; channel?: string; amountPaise: number; kind: string; direction: string;
}): Promise<CategorizeResult> {
  const keys = await categoryIdsByKey(ownerId);
  if (t.kind === 'self_transfer') return { categoryId: keys.get('self_transfer') || null, source: 'dictionary' };
  if (t.kind === 'refund') return { categoryId: keys.get('refund') || null, source: 'dictionary' };
  if (t.kind === 'cc_bill_payment') return { categoryId: null, source: '' };

  const rules = await Rule.find({ ownerId }).sort({ priority: -1, updatedAt: -1 });
  const rule = rules.find((r) => ruleMatches(r, t));
  if (rule) {
    await Rule.updateOne({ _id: rule._id }, { $inc: { hits: 1 } });
    return {
      categoryId: rule.action.categoryId || null, source: 'rule', kind: rule.action.kind, tags: rule.action.tags,
      splitTemplateId: rule.action.splitTemplateId, ruleId: rule._id,
    };
  }
  if (t.direction === 'credit' && t.kind === 'income') return { categoryId: keys.get('income') || null, source: 'dictionary' };
  const key = dictionaryCategoryKey(t.merchant || t.merchantRaw || '');
  if (key && keys.get(key)) return { categoryId: keys.get(key)!, source: 'dictionary' };
  return { categoryId: null, source: '' };
}

/**
 * When the owner changes a transaction's category, remember it as a rule for
 * that merchant (or update the existing learned rule).
 */
export async function learnFromCorrection(ownerId: string, txn: ITransaction, categoryId: Types.ObjectId | string | null): Promise<void> {
  const merchant = normaliseMerchant(txn.merchant || txn.merchantRaw);
  if (!merchant || !categoryId) return;
  const needle = merchant.split(' ').slice(0, 3).join(' ');
  const existing = await Rule.findOne({ ownerId, createdFrom: 'user_correction', 'match.merchantContains': needle });
  if (existing) {
    existing.action = { ...existing.action, categoryId: new Types.ObjectId(String(categoryId)) };
    await existing.save();
  } else {
    await Rule.create({
      ownerId, createdFrom: 'user_correction', priority: 10,
      match: { merchantContains: needle }, action: { categoryId: new Types.ObjectId(String(categoryId)) },
    });
  }
}
