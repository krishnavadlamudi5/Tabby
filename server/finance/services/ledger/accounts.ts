import { Account, IAccount } from '../../models';

/**
 * Finds the owner's account an email refers to, by masked account number
 * (last 4 / aliases) or card last 4. Returns `unknown: true` when the email
 * named a number that matches none of the owner's accounts.
 */
export async function resolveAccount(
  ownerId: string,
  hints: { accountHint?: string; cardHint?: string; institution?: string },
): Promise<{ account: IAccount | null; unknown: boolean; hint?: string }> {
  const { accountHint, cardHint } = hints;
  if (!accountHint && !cardHint) return { account: null, unknown: false };
  const accounts = await Account.find({ ownerId, isActive: true });
  const matchNumber = (acc: IAccount, n: string) =>
    acc.last4 === n || acc.aliases.some((a) => a.replace(/\D/g, '').endsWith(n)) || acc.cardLast4s.includes(n);

  if (accountHint) {
    const acc = accounts.find((a) => matchNumber(a, accountHint));
    if (acc) return { account: acc, unknown: false };
  }
  if (cardHint) {
    const acc = accounts.find((a) => a.cardLast4s.includes(cardHint)) || accounts.find((a) => a.last4 === cardHint && a.type === 'credit_card');
    if (acc) return { account: acc, unknown: false };
  }
  return { account: null, unknown: true, hint: accountHint || cardHint };
}
