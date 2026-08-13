/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Expense, Debt } from '../types';

/**
 * Calculates the net balance of each user in a list of members, based on a list of expenses.
 * A positive balance means the user is owed money overall.
 * A negative balance means the user owes money overall.
 */
export function calculateNetBalances(
  expenses: Expense[],
  memberIds: string[]
): Record<string, number> {
  const balances: Record<string, number> = {};

  // Initialize all balances to 0
  memberIds.forEach((id) => {
    balances[id] = 0;
  });

  // Process each expense
  expenses.forEach((expense) => {
    const { paidBy, amount, splits } = expense;

    // The person who paid gets a credit of the full amount
    if (balances[paidBy] !== undefined) {
      balances[paidBy] = Number((balances[paidBy] + amount).toFixed(2));
    }

    // Each person involved in the split owes their split amount
    splits.forEach((split) => {
      if (balances[split.userId] !== undefined) {
        balances[split.userId] = Number(
          (balances[split.userId] - split.amount).toFixed(2)
        );
      }
    });
  });

  return balances;
}

/**
 * Simplifies a map of net balances into the minimal set of direct debts.
 * For example, if A owes B $10, and B owes C $10, the simplified result is A owes C $10.
 */
export function simplifyDebts(netBalances: Record<string, number>): Debt[] {
  const debts: Debt[] = [];

  // Filter out users who are already settled, and separate into debtors and creditors
  const participants = Object.entries(netBalances)
    .map(([id, balance]) => ({ id, balance: Number(balance.toFixed(2)) }))
    .filter((p) => Math.abs(p.balance) > 0.01);

  const debtors = participants
    .filter((p) => p.balance < 0)
    .sort((a, b) => a.balance - b.balance); // Most negative first (owes the most)

  const creditors = participants
    .filter((p) => p.balance > 0)
    .sort((a, b) => b.balance - a.balance); // Most positive first (is owed the most)

  let debtorIdx = 0;
  let creditorIdx = 0;

  while (debtorIdx < debtors.length && creditorIdx < creditors.length) {
    const debtor = debtors[debtorIdx];
    const creditor = creditors[creditorIdx];

    const oweAmount = -debtor.balance;
    const creditAmount = creditor.balance;

    const settledAmount = Number(Math.min(oweAmount, creditAmount).toFixed(2));

    if (settledAmount > 0.01) {
      debts.push({
        from: debtor.id,
        to: creditor.id,
        amount: settledAmount,
      });
    }

    // Update balances
    debtor.balance = Number((debtor.balance + settledAmount).toFixed(2));
    creditor.balance = Number((creditor.balance - settledAmount).toFixed(2));

    if (Math.abs(debtor.balance) < 0.01) {
      debtorIdx++;
    }
    if (Math.abs(creditor.balance) < 0.01) {
      creditorIdx++;
    }
  }

  return debts;
}
