/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User, Expense, Group } from '../types';
import { calculateNetBalances, simplifyDebts } from '../utils/debtSimplifier';
import { formatAmount } from '../utils/currency';
import { Plus, UserCheck, ArrowRight, Trash2, Edit2, CheckCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';

interface FriendViewProps {
  friend: User;
  expenses: Expense[];
  groups?: Group[];
  currentUser: User;
  allUsers: User[];
  currency?: string;
  onAddExpenseClick: (groupId: string | null, friendId: string) => void;
  onEditExpense?: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => void;
  onSettleDebt: (fromUserId: string, toUserId: string, amount: number, groupId: string | null) => void;
}

export default function FriendView({
  friend,
  expenses,
  groups = [],
  currentUser,
  allUsers,
  currency = 'USD',
  onAddExpenseClick,
  onEditExpense,
  onDeleteExpense,
  onSettleDebt,
}: FriendViewProps) {
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);

  // Filter expenses where both current user and this friend are involved
  const commonExpenses = expenses.filter((e) => {
    // Expense must have splits involving both users, or paid by one and split by another
    const involvesMe = e.paidBy === currentUser.id || e.splits.some((s) => s.userId === currentUser.id);
    const involvesFriend = e.paidBy === friend.id || e.splits.some((s) => s.userId === friend.id);
    return involvesMe && involvesFriend;
  });

  // Calculate the net debt balance specifically between the current user and this friend.
  // We can do this by running calculateNetBalances with just current user and friend IDs, over the commonExpenses.
  const netBalances = React.useMemo(() => {
    return calculateNetBalances(commonExpenses, [currentUser.id, friend.id]);
  }, [commonExpenses, currentUser.id, friend.id]);

  const friendBalance = netBalances[friend.id] || 0; // Negative means friend owes current user, positive means friend is credited

  // Wait, let's understand:
  // if friendBalance is positive, friend has net positive balance, meaning we owe the friend.
  // if friendBalance is negative, friend has net negative balance, meaning friend owes us.
  const iOweFriend = friendBalance > 0.01;
  const friendOwesMe = friendBalance < -0.01;
  const absBalance = Math.abs(friendBalance);

  const handleSettleUp = () => {
    if (iOweFriend) {
      // Current user pays friend
      onSettleDebt(currentUser.id, friend.id, absBalance, null);
    } else if (friendOwesMe) {
      // Friend pays current user
      onSettleDebt(friend.id, currentUser.id, absBalance, null);
    }
  };

  const memberMap = React.useMemo(() => {
    const map: Record<string, User> = {};
    allUsers.forEach((u) => {
      map[u.id] = u;
    });
    return map;
  }, [allUsers]);

  return (
    <div className="flex flex-col gap-5 sm:gap-6" id={`friend-view-${friend.id}`}>
      {/* Friend Header Card */}
      <div className="bg-white border border-[#E6E1DA] rounded-2xl p-4 sm:p-5 md:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4" id="friend-profile-card">
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
          <img
            src={friend.avatar}
            alt={friend.name}
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-full object-cover border border-[#E6E1DA] ring-2 ring-[#E6E1DA] shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-[#2C2B29] tracking-tight truncate">{friend.name}</h1>
            <p className="text-xs text-[#736F6A] mt-0.5 truncate">{friend.email}</p>
          </div>
        </div>

        {/* Quick Balance Readout and Settle Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E6E1DA]" id="friend-header-actions">
          <div className="text-left sm:text-right" id="relationship-balance-display">
            <span className="text-[10px] font-bold text-[#736F6A] uppercase tracking-wider block">Standing</span>
            {iOweFriend ? (
              <span className="text-xs sm:text-sm font-bold text-[#C86D51] block mt-0.5">
                You owe {friend.name.split(' ')[0]} <strong className="text-sm sm:text-base">{formatAmount(absBalance, currency)}</strong>
              </span>
            ) : friendOwesMe ? (
              <span className="text-xs sm:text-sm font-bold text-[#2E7D52] block mt-0.5">
                {friend.name.split(' ')[0]} owes you <strong className="text-sm sm:text-base">{formatAmount(absBalance, currency)}</strong>
              </span>
            ) : (
              <span className="text-xs sm:text-sm font-bold text-[#736F6A] block mt-0.5">
                Settled up!
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0" id="friend-buttons-row">
            {(iOweFriend || friendOwesMe) && (
              <button
                onClick={handleSettleUp}
                className="flex items-center gap-1 px-3.5 py-2 sm:px-4 bg-white border border-[#3C5A48] hover:bg-[#EBF1ED] active:scale-95 text-[#3C5A48] font-bold text-xs sm:text-sm rounded-xl transition-all focus:outline-none cursor-pointer shadow-2xs"
                type="button"
                id="settle-friend-btn"
              >
                <UserCheck className="w-4 h-4" />
                <span>Settle Up</span>
              </button>
            )}

            <button
              onClick={() => onAddExpenseClick(null, friend.id)}
              className="flex items-center gap-1.5 px-3.5 py-2 sm:px-4 bg-[#3C5A48] hover:bg-[#2E4738] active:scale-95 text-white font-semibold text-xs sm:text-sm rounded-xl transition-all shadow-xs focus:outline-none cursor-pointer shrink-0"
              type="button"
              id="add-expense-friend-btn"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add Bill</span>
            </button>
          </div>
        </div>
      </div>

      {/* Expenses list specifically with this friend */}
      <div className="flex flex-col gap-3" id="friend-expenses-section">
        <h3 className="font-bold text-[#2C2B29] text-sm sm:text-base">Shared Expenses History ({commonExpenses.length})</h3>

        {commonExpenses.length === 0 ? (
          <div className="bg-white border border-[#E6E1DA] rounded-2xl p-8 sm:p-10 text-center flex flex-col items-center justify-center gap-3" id="friend-expenses-empty">
            <div className="w-12 h-12 bg-[#FAF8F5] border border-[#E6E1DA] rounded-full flex items-center justify-center text-[#736F6A]">
              <Info className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-[#2C2B29]">No shared bills</h3>
            <p className="text-xs sm:text-sm text-[#736F6A] max-w-xs">
              No bills recorded between you and {friend.name} yet. Click "Add Bill" to split something!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5" id="friend-expenses-list">
            {commonExpenses
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((tx) => {
                const isExpanded = expandedExpenseId === tx.id;
                const paidUser = memberMap[tx.paidBy];
                const isPaidByMe = tx.paidBy === currentUser.id;

                // Settlement Row
                if (tx.isSettlement) {
                  const toUser = memberMap[tx.splits[0]?.userId] || currentUser;
                  return (
                    <div
                      key={tx.id}
                      className="bg-[#FAF8F5] border border-[#E6E1DA] rounded-xl px-3.5 py-3 flex items-center justify-between gap-2.5 text-xs shadow-2xs"
                      id={`tx-settle-${tx.id}`}
                    >
                      <div className="flex items-center gap-2.5 text-[#736F6A] min-w-0 flex-1">
                        <CheckCircle className="w-4 h-4 text-[#3C5A48] shrink-0" />
                        <span className="truncate">
                          <strong className="text-[#2C2B29]">{paidUser?.id === currentUser.id ? 'You' : paidUser?.name}</strong> settled with{' '}
                          <strong className="text-[#2C2B29]">{toUser.id === currentUser.id ? 'You' : toUser.name}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 font-semibold text-[#3C5A48] shrink-0">
                        <span className="font-bold">{formatAmount(tx.amount, currency)}</span>
                        <button
                          onClick={() => onDeleteExpense(tx.id)}
                          className="p-1.5 rounded-lg text-[#736F6A]/60 hover:text-[#C86D51] hover:bg-[#FDF3F0] transition-all cursor-pointer"
                          title="Delete Settlement record"
                          type="button"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                }

                // Standard Expense calculations between US TWO
                const mySplit = tx.splits.find((s) => s.userId === currentUser.id);
                const friendSplit = tx.splits.find((s) => s.userId === friend.id);

                const mySplitAmount = mySplit ? mySplit.amount : 0;
                const friendSplitAmount = friendSplit ? friendSplit.amount : 0;

                let relLabel = '';
                let relAmount = 0;
                let relClass = 'text-[#736F6A]';

                if (isPaidByMe) {
                  if (friendSplitAmount > 0) {
                    relLabel = 'you lent them';
                    relAmount = friendSplitAmount;
                    relClass = 'text-[#2E7D52]';
                  } else {
                    relLabel = 'you paid (alone)';
                    relAmount = 0;
                    relClass = 'text-[#736F6A]';
                  }
                } else if (tx.paidBy === friend.id) {
                  if (mySplitAmount > 0) {
                    relLabel = 'you owe them';
                    relAmount = mySplitAmount;
                    relClass = 'text-[#C86D51]';
                  } else {
                    relLabel = 'they paid (alone)';
                    relAmount = 0;
                    relClass = 'text-[#736F6A]';
                  }
                } else {
                  relLabel = 'third-party';
                  relAmount = mySplitAmount;
                  relClass = 'text-[#736F6A]';
                }

                return (
                  <div
                    key={tx.id}
                    className="bg-white border border-[#E6E1DA] hover:border-[#3C5A48]/40 rounded-xl shadow-xs transition-all overflow-hidden"
                    id={`friend-expense-row-${tx.id}`}
                  >
                    {/* Top Brief Area */}
                    <button
                      onClick={() => setExpandedExpenseId(isExpanded ? null : tx.id)}
                      className="w-full text-left p-3.5 sm:p-4 flex items-center justify-between gap-2.5 sm:gap-4 focus:outline-none cursor-pointer"
                      type="button"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* Date badge */}
                        <div className="flex flex-col items-center justify-center w-10 h-10 sm:w-11 sm:h-11 bg-[#FAF8F5] border border-[#E6E1DA] rounded-lg shrink-0 text-center">
                          <span className="text-[9px] sm:text-[10px] uppercase font-bold text-[#736F6A]">
                            {new Date(tx.date).toLocaleDateString(undefined, { month: 'short' })}
                          </span>
                          <span className="text-xs sm:text-sm font-bold text-[#2C2B29] leading-none mt-0.5">
                            {new Date(tx.date).getDate()}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs sm:text-sm font-bold text-[#2C2B29] truncate">{tx.description}</h4>
                          <p className="text-[11px] sm:text-xs text-[#736F6A] mt-0.5 truncate">
                            {tx.groupId ? `In group "${groups.find((g) => g.id === tx.groupId)?.name || 'Group'}"` : 'Direct Split'} • Paid by {isPaidByMe ? 'You' : paidUser?.name}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 sm:gap-4 text-right shrink-0">
                        <div className="min-w-[65px] sm:min-w-[90px]">
                          <div className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider ${relClass}`}>
                            {relLabel}
                          </div>
                          <div className={`text-xs sm:text-sm font-bold ${relClass}`}>
                            {relAmount > 0 ? formatAmount(relAmount, currency) : '--'}
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-[#736F6A] shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#736F6A] shrink-0" />
                        )}
                      </div>
                    </button>

                    {/* Detailed Accordion breakdown */}
                    {isExpanded && (
                      <div className="bg-[#FAF8F5] border-t border-[#E6E1DA] p-3.5 sm:p-4 text-xs text-[#736F6A] flex flex-col gap-3 animate-fadeIn">
                        <div className="flex flex-col gap-2">
                          <div className="font-semibold text-[#2C2B29]">
                            Total bill: <strong className="text-[#2C2B29]">{formatAmount(tx.amount, currency)}</strong>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md">
                            {tx.splits.map((s) => {
                              const splitUser = memberMap[s.userId];
                              return (
                                <div key={s.userId} className="flex items-center gap-2 bg-white px-2.5 py-1.5 border border-[#E6E1DA] rounded-lg shadow-2xs">
                                  <img
                                    src={splitUser?.avatar}
                                    alt={splitUser?.name}
                                    className="w-5 h-5 rounded-full object-cover shrink-0"
                                    referrerPolicy="no-referrer"
                                  />
                                  <span className="font-medium text-[#2C2B29] flex-1 truncate">
                                    {splitUser?.id === currentUser.id ? 'You' : splitUser?.name}
                                  </span>
                                  <span className="font-bold text-[#2C2B29] shrink-0">{formatAmount(s.amount, currency)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-[#E6E1DA]/60">
                          <span className="text-[10px] text-[#736F6A] font-medium">
                            Added {new Date(tx.createdAt).toLocaleDateString()}
                          </span>
                          <div className="flex items-center gap-2">
                            {onEditExpense && (
                              <button
                                onClick={() => onEditExpense(tx)}
                                className="px-2.5 py-1.5 rounded-lg border border-[#E6E1DA] text-[#3C5A48] hover:bg-[#EBF1ED] active:scale-95 transition-all flex items-center justify-center gap-1 font-bold text-[11px] bg-white cursor-pointer"
                                type="button"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                Edit
                              </button>
                            )}
                            <button
                              onClick={() => onDeleteExpense(tx.id)}
                              className="px-2.5 py-1.5 rounded-lg border border-[#E6E1DA] text-[#736F6A] hover:text-[#C86D51] hover:bg-[#FDF3F0] active:scale-95 transition-all flex items-center justify-center gap-1 font-bold text-[11px] bg-white cursor-pointer"
                              type="button"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
