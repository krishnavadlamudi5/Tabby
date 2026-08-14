/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Group, Expense, User, Debt } from '../types';
import { calculateNetBalances, simplifyDebts } from '../utils/debtSimplifier';
import { formatAmount } from '../utils/currency';
import {
  Plus,
  Home,
  MapPin,
  Heart,
  Landmark,
  ChevronDown,
  ChevronUp,
  Trash2,
  Edit2,
  CheckCircle,
  Info,
  DollarSign,
  Wallet,
  TrendingUp,
  TrendingDown,
  PieChart as PieIcon,
  BarChart2,
  Users,
} from 'lucide-react';
import {
  PieChart as RePieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

interface GroupViewProps {
  group: Group;
  expenses: Expense[];
  currentUser: User;
  allUsers: User[];
  currency?: string;
  onAddExpenseClick: (groupId: string) => void;
  onEditExpense?: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => void;
  onSettleDebt: (fromUserId: string, toUserId: string, amount: number, groupId: string | null) => void;
}

export default function GroupView({
  group,
  expenses,
  currentUser,
  allUsers,
  currency = 'USD',
  onAddExpenseClick,
  onEditExpense,
  onDeleteExpense,
  onSettleDebt,
}: GroupViewProps) {
  const [activeTab, setActiveTab] = useState<'analytics' | 'expenses' | 'balances'>('analytics');
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);

  // Filter expenses associated with this group
  const groupExpenses = expenses.filter((e) => e.groupId === group.id && !e.isSettlement);
  const groupSettlements = expenses.filter((e) => e.groupId === group.id && e.isSettlement);
  const allGroupTx = expenses.filter((e) => e.groupId === group.id).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Get user details for group members
  const members = allUsers.filter((u) => group.members.includes(u.id));
  const memberMap = React.useMemo(() => {
    const map: Record<string, User> = {};
    allUsers.forEach((u) => {
      map[u.id] = u;
    });
    return map;
  }, [allUsers]);

  // Calculations for group net balances and simplified group debts
  const groupNetBalances = React.useMemo(() => {
    return calculateNetBalances(expenses.filter((e) => e.groupId === group.id), group.members);
  }, [expenses, group.id, group.members]);

  const groupDebts = React.useMemo(() => {
    return simplifyDebts(groupNetBalances);
  }, [groupNetBalances]);

  // Group Dashboard metrics calculation
  const totalGroupSpend = React.useMemo(() => {
    return groupExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [groupExpenses]);

  const userTotalPaid = React.useMemo(() => {
    return groupExpenses
      .filter((e) => e.paidBy === currentUser.id)
      .reduce((sum, e) => sum + e.amount, 0);
  }, [groupExpenses, currentUser.id]);

  const userTotalShare = React.useMemo(() => {
    return groupExpenses.reduce((sum, e) => {
      const split = e.splits.find((s) => s.userId === currentUser.id);
      return sum + (split ? split.amount : 0);
    }, 0);
  }, [groupExpenses, currentUser.id]);

  const userGroupBalance = groupNetBalances[currentUser.id] || 0;

  // Member spending summary for group dashboard
  const memberSpendingList = React.useMemo(() => {
    return members.map((member) => {
      const paid = groupExpenses
        .filter((e) => e.paidBy === member.id)
        .reduce((sum, e) => sum + e.amount, 0);

      const share = groupExpenses.reduce((sum, e) => {
        const split = e.splits.find((s) => s.userId === member.id);
        return sum + (split ? split.amount : 0);
      }, 0);

      const net = groupNetBalances[member.id] || 0;

      return {
        user: member,
        paid,
        share,
        net,
      };
    });
  }, [members, groupExpenses, groupNetBalances]);

  const CHART_COLORS = ['#3C5A48', '#2E7D52', '#82A791', '#C86D51', '#D9A05B', '#5B7B9A', '#8E7CC3', '#B45F06'];

  // Categorized spending data for Pie Chart
  const categoryChartData = React.useMemo(() => {
    const categories: Record<string, number> = {};

    groupExpenses.forEach((e) => {
      let cat = 'General';
      if (e.category) {
        const catMap: Record<string, string> = {
          food: 'Food & Dining',
          groceries: 'Groceries',
          rent: 'Rent & Stay',
          transport: 'Transportation',
          utilities: 'Utilities',
          entertainment: 'Entertainment',
          other: 'General',
        };
        cat = catMap[e.category] || 'General';
      } else {
        const desc = (e.description || '').toLowerCase();
        if (
          desc.includes('din') ||
          desc.includes('food') ||
          desc.includes('rest') ||
          desc.includes('lunch') ||
          desc.includes('meal') ||
          desc.includes('cafe') ||
          desc.includes('coffee') ||
          desc.includes('🍔')
        ) {
          cat = 'Food & Dining';
        } else if (
          desc.includes('grocer') ||
          desc.includes('supermarket') ||
          desc.includes('mart') ||
          desc.includes('🛒')
        ) {
          cat = 'Groceries';
        } else if (
          desc.includes('rent') ||
          desc.includes('stay') ||
          desc.includes('hotel') ||
          desc.includes('airbnb') ||
          desc.includes('🏠')
        ) {
          cat = 'Rent & Stay';
        } else if (
          desc.includes('taxi') ||
          desc.includes('cab') ||
          desc.includes('uber') ||
          desc.includes('flight') ||
          desc.includes('bus') ||
          desc.includes('fuel') ||
          desc.includes('🚕')
        ) {
          cat = 'Transportation';
        } else if (
          desc.includes('util') ||
          desc.includes('electric') ||
          desc.includes('water') ||
          desc.includes('wifi') ||
          desc.includes('⚡')
        ) {
          cat = 'Utilities';
        } else if (
          desc.includes('movi') ||
          desc.includes('ticket') ||
          desc.includes('concert') ||
          desc.includes('🎬')
        ) {
          cat = 'Entertainment';
        }
      }

      categories[cat] = (categories[cat] || 0) + e.amount;
    });

    return Object.keys(categories).map((catName, index) => ({
      name: catName,
      value: categories[catName],
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
  }, [groupExpenses]);

  // Member paid vs share comparison data for Bar Chart
  const memberBarChartData = React.useMemo(() => {
    return memberSpendingList.map(({ user, paid, share }) => ({
      name: user.name.split(' ')[0],
      fullName: user.name,
      'Paid Out': paid,
      'Total Share': share,
    }));
  }, [memberSpendingList]);

  // Member payer distribution data for Pie Chart
  const memberPayerPieData = React.useMemo(() => {
    return memberSpendingList
      .filter((m) => m.paid > 0)
      .map(({ user, paid }, index) => ({
        name: user.name,
        value: paid,
        color: CHART_COLORS[index % CHART_COLORS.length],
      }));
  }, [memberSpendingList]);

  // Icons based on group category
  const getCategoryIcon = () => {
    switch (group.category) {
      case 'home':
        return <Home className="w-5 h-5 text-[#3C5A48]" />;
      case 'trip':
        return <MapPin className="w-5 h-5 text-[#3C5A48]" />;
      case 'couple':
        return <Heart className="w-5 h-5 text-[#3C5A48]" />;
      default:
        return <Landmark className="w-5 h-5 text-[#3C5A48]" />;
    }
  };

  const getCategoryLabel = () => {
    return group.category.charAt(0).toUpperCase() + group.category.slice(1);
  };

  return (
    <div className="flex flex-col gap-6" id={`group-view-${group.id}`}>
      {/* Group Hero Header */}
      <div className="bg-white border border-[#E6E1DA] rounded-2xl p-5 md:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4" id="group-hero-header">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#EBF1ED] flex items-center justify-center border border-[#E6E1DA]" id="group-icon-frame">
            {getCategoryIcon()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold text-[#2C2B29] tracking-tight">{group.name}</h1>
              <span className="text-[11px] font-bold bg-[#F8F5F2] text-[#736F6A] px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-[#E6E1DA]">
                {getCategoryLabel()}
              </span>
            </div>
            <p className="text-sm text-[#736F6A] mt-1">
              {members.length} members • Created {new Date(group.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Members Avatars and Button */}
        <div className="flex flex-wrap items-center gap-4" id="group-header-actions">
          <div className="flex -space-x-2 overflow-hidden" id="group-avatars-row">
            {members.map((member) => (
              <img
                key={member.id}
                src={member.avatar}
                alt={member.name}
                title={member.name}
                className="inline-block h-8 w-8 rounded-full ring-2 ring-white object-cover border border-[#E6E1DA]"
                referrerPolicy="no-referrer"
              />
            ))}
          </div>

          <button
            onClick={() => onAddExpenseClick(group.id)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#3C5A48] hover:bg-[#2E4738] text-white font-semibold text-sm rounded-xl transition-colors shadow-xs focus:outline-none cursor-pointer"
            type="button"
            id="add-expense-group-btn"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            Add Expense
          </button>
        </div>
      </div>

      {/* Group Dashboard Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4" id="group-dashboard-stats">
        {/* Card 1: Total Group Spent */}
        <div className="bg-white border border-[#E6E1DA] rounded-2xl p-4 shadow-xs flex items-center justify-between" id="group-stat-total-spend">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-[#736F6A] uppercase tracking-wider">Total Group Spend</span>
            <span className="text-lg md:text-xl font-extrabold text-[#2C2B29]">
              {formatAmount(totalGroupSpend, currency)}
            </span>
            <span className="text-[11px] text-[#736F6A]">{groupExpenses.length} total bill{groupExpenses.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FAF8F5] border border-[#E6E1DA] flex items-center justify-center text-[#3C5A48]">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: You Paid in Group */}
        <div className="bg-white border border-[#E6E1DA] rounded-2xl p-4 shadow-xs flex items-center justify-between" id="group-stat-you-paid">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-[#736F6A] uppercase tracking-wider">You Paid</span>
            <span className="text-lg md:text-xl font-extrabold text-[#2C2B29]">
              {formatAmount(userTotalPaid, currency)}
            </span>
            <span className="text-[11px] text-[#736F6A]">
              {totalGroupSpend > 0 ? `${((userTotalPaid / totalGroupSpend) * 100).toFixed(0)}% of group total` : '0% of total'}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FAF8F5] border border-[#E6E1DA] flex items-center justify-center text-[#3C5A48]">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Your Share */}
        <div className="bg-white border border-[#E6E1DA] rounded-2xl p-4 shadow-xs flex items-center justify-between" id="group-stat-your-share">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-[#736F6A] uppercase tracking-wider">Your Share</span>
            <span className="text-lg md:text-xl font-extrabold text-[#2C2B29]">
              {formatAmount(userTotalShare, currency)}
            </span>
            <span className="text-[11px] text-[#736F6A]">Your share of expenses</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FAF8F5] border border-[#E6E1DA] flex items-center justify-center text-[#3C5A48]">
            <PieIcon className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Your Group Standing */}
        <div className="bg-white border border-[#E6E1DA] rounded-2xl p-4 shadow-xs flex items-center justify-between" id="group-stat-standing">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-[#736F6A] uppercase tracking-wider">Your Standing</span>
            <span className={`text-lg md:text-xl font-extrabold ${userGroupBalance > 0.01 ? 'text-[#2E7D52]' : userGroupBalance < -0.01 ? 'text-[#C86D51]' : 'text-[#736F6A]'}`}>
              {formatAmount(userGroupBalance, currency, true)}
            </span>
            <span className="text-[11px] text-[#736F6A]">
              {userGroupBalance > 0.01 ? 'You are owed in group' : userGroupBalance < -0.01 ? 'You owe in group' : 'Settled up'}
            </span>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${userGroupBalance > 0.01 ? 'bg-[#EEF7F2] text-[#2E7D52]' : userGroupBalance < -0.01 ? 'bg-[#FDF3F0] text-[#C86D51]' : 'bg-[#FAF8F5] text-[#736F6A]'}`}>
            {userGroupBalance > 0.01 ? <TrendingUp className="w-5 h-5" /> : userGroupBalance < -0.01 ? <TrendingDown className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
          </div>
        </div>
      </div>

      {/* Primary Tabs */}
      <div className="border-b border-[#E6E1DA] flex gap-4 overflow-x-auto pb-0.5" id="group-tabs-row">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all px-1 focus:outline-none cursor-pointer whitespace-nowrap ${activeTab === 'analytics' ? 'border-[#3C5A48] text-[#3C5A48]' : 'border-transparent text-[#736F6A] hover:text-[#2C2B29]'}`}
          type="button"
          id="tab-group-analytics"
        >
          Group Dashboard & Analytics
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all px-1 focus:outline-none cursor-pointer whitespace-nowrap ${activeTab === 'expenses' ? 'border-[#3C5A48] text-[#3C5A48]' : 'border-transparent text-[#736F6A] hover:text-[#2C2B29]'}`}
          type="button"
          id="tab-group-expenses"
        >
          Expenses ({groupExpenses.length})
        </button>
        <button
          onClick={() => setActiveTab('balances')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all px-1 focus:outline-none cursor-pointer whitespace-nowrap ${activeTab === 'balances' ? 'border-[#3C5A48] text-[#3C5A48]' : 'border-transparent text-[#736F6A] hover:text-[#2C2B29]'}`}
          type="button"
          id="tab-group-balances"
        >
          Group Balances & Debts
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'expenses' ? (
        <div className="flex flex-col gap-3" id="expenses-tab-content">
          {allGroupTx.length === 0 ? (
            <div className="bg-white border border-[#E6E1DA] rounded-2xl p-10 text-center flex flex-col items-center justify-center gap-3" id="group-expenses-empty">
              <div className="w-12 h-12 bg-[#FAF8F5] border border-[#E6E1DA] rounded-full flex items-center justify-center text-[#736F6A]">
                <Info className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#2C2B29]">No expenses recorded yet</h3>
              <p className="text-sm text-[#736F6A] max-w-xs">
                Keep track of rent, trips, or dining splits! Click "Add Expense" to record the first group bill.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5" id="group-expenses-list">
              {allGroupTx.map((tx) => {
                const isExpanded = expandedExpenseId === tx.id;
                const paidUser = memberMap[tx.paidBy];
                const wasCreatedByMe = tx.createdBy === currentUser.id || tx.paidBy === currentUser.id;

                // Settlement custom styling
                if (tx.isSettlement) {
                  const toUser = memberMap[tx.splits[0]?.userId] || currentUser;
                  return (
                    <div
                      key={tx.id}
                      className="bg-[#FAF8F5] border border-[#E6E1DA] rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs"
                      id={`tx-settle-${tx.id}`}
                    >
                      <div className="flex items-center gap-2.5 text-[#736F6A]">
                        <CheckCircle className="w-4 h-4 text-[#3C5A48] flex-shrink-0" />
                        <span>
                          <strong className="text-[#2C2B29]">{paidUser?.id === currentUser.id ? 'You' : paidUser?.name}</strong> settled up with{' '}
                          <strong className="text-[#2C2B29]">{toUser.id === currentUser.id ? 'You' : toUser.name}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-3 font-semibold text-[#3C5A48]">
                        <span>{formatAmount(tx.amount, currency)}</span>
                        <button
                          onClick={() => onDeleteExpense(tx.id)}
                          className="p-1 rounded-lg text-[#736F6A]/50 hover:text-[#C86D51] hover:bg-[#FDF3F0] transition-all focus:outline-none cursor-pointer"
                          title="Delete Settlement record"
                          type="button"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                }

                // Standard Expense row
                const userSplit = tx.splits.find((s) => s.userId === currentUser.id);
                const userOwesAmount = userSplit ? userSplit.amount : 0;
                const userPaid = tx.paidBy === currentUser.id;

                let actionLabel = '';
                let actionAmount = 0;
                let textClass = 'text-[#736F6A]';

                if (userPaid) {
                  const othersSplitsSum = tx.splits
                    .filter((s) => s.userId !== currentUser.id)
                    .reduce((acc, s) => acc + s.amount, 0);
                  actionLabel = 'you lent';
                  actionAmount = othersSplitsSum;
                  textClass = 'text-[#2E7D52]';
                } else if (userOwesAmount > 0) {
                  actionLabel = 'you owe';
                  actionAmount = userOwesAmount;
                  textClass = 'text-[#C86D51]';
                } else {
                  actionLabel = 'not involved';
                  actionAmount = 0;
                  textClass = 'text-[#736F6A]/70';
                }

                return (
                  <div
                    key={tx.id}
                    className="bg-white border border-[#E6E1DA] hover:border-[#3C5A48]/40 rounded-xl shadow-xs transition-all overflow-hidden"
                    id={`expense-row-${tx.id}`}
                  >
                    {/* Compact Top Header */}
                    <button
                      onClick={() => setExpandedExpenseId(isExpanded ? null : tx.id)}
                      className="w-full text-left p-4 flex items-center justify-between gap-4 focus:outline-none cursor-pointer"
                      type="button"
                    >
                      <div className="flex items-center gap-3.5 flex-1 min-w-0">
                        {/* Date badge */}
                        <div className="flex flex-col items-center justify-center w-11 h-11 bg-[#FAF8F5] border border-[#E6E1DA] rounded-lg flex-shrink-0 text-center">
                          <span className="text-[10px] uppercase font-bold text-[#736F6A]">
                            {new Date(tx.date).toLocaleDateString(undefined, { month: 'short' })}
                          </span>
                          <span className="text-sm font-bold text-[#2C2B29] leading-none mt-0.5">
                            {new Date(tx.date).getDate()}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold text-[#2C2B29] truncate">{tx.description}</h4>
                          <p className="text-xs text-[#736F6A] mt-0.5 truncate">
                            Paid by <strong className="text-[#2C2B29]">{userPaid ? 'You' : paidUser?.name}</strong> • {formatAmount(tx.amount, currency)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <div className="min-w-[80px]">
                          <div className={`text-[11px] font-bold uppercase tracking-wider ${textClass}`}>
                            {actionLabel}
                          </div>
                          <div className={`text-sm font-bold ${textClass}`}>
                            {actionAmount > 0 ? formatAmount(actionAmount, currency) : '--'}
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-[#736F6A]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#736F6A]" />
                        )}
                      </div>
                    </button>

                    {/* Detailed Accordion Content */}
                    {isExpanded && (
                      <div className="bg-[#FAF8F5] border-t border-[#E6E1DA] p-4 text-xs text-[#736F6A] flex flex-col md:flex-row md:items-start justify-between gap-4 animate-slideDown">
                        <div className="flex flex-col gap-2 flex-1">
                          <div className="flex items-center gap-1 font-semibold text-[#2C2B29] mb-1">
                            <span>Splits breakdown ({tx.splitMethod === 'equally' ? 'Split equally' : tx.splitMethod === 'exactly' ? 'Exact splits' : 'Split by percentage'}):</span>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-md">
                            {tx.splits.map((s) => {
                              const splitUser = memberMap[s.userId];
                              return (
                                <div key={s.userId} className="flex items-center gap-2 bg-white px-2.5 py-1.5 border border-[#E6E1DA] rounded-lg">
                                  <img
                                    src={splitUser?.avatar}
                                    alt={splitUser?.name}
                                    className="w-5 h-5 rounded-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                  <span className="font-medium text-[#2C2B29] flex-1 truncate">
                                    {splitUser?.id === currentUser.id ? 'You' : splitUser?.name}
                                  </span>
                                  <span className="font-bold text-[#2C2B29]">{formatAmount(s.amount, currency)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Control buttons inside accordion */}
                        <div className="flex items-center gap-2 self-end md:self-auto pt-2 md:pt-0">
                          <span className="text-[10px] text-[#736F6A] font-medium">
                            Added {new Date(tx.createdAt).toLocaleDateString()}
                          </span>
                          {onEditExpense && (
                            <button
                              onClick={() => onEditExpense(tx)}
                              className="p-1.5 rounded-lg border border-[#E6E1DA] text-[#3C5A48] hover:bg-[#EBF1ED] hover:border-[#3C5A48]/30 transition-all flex items-center justify-center gap-1 font-semibold text-[11px] bg-white cursor-pointer"
                              type="button"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              Edit
                            </button>
                          )}
                          <button
                            onClick={() => onDeleteExpense(tx.id)}
                            className="p-1.5 rounded-lg border border-[#E6E1DA] text-[#736F6A] hover:text-[#C86D51] hover:bg-[#FDF3F0] hover:border-[#C86D51]/30 transition-all flex items-center justify-center gap-1 font-semibold text-[11px] bg-white cursor-pointer"
                            type="button"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : activeTab === 'balances' ? (
        /* BALANCES TAB CONTENT */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="balances-tab-content">
          
          {/* Members Standings List */}
          <div className="bg-white border border-[#E6E1DA] rounded-2xl p-5 flex flex-col gap-4" id="members-standing-card">
            <h3 className="font-bold text-[#2C2B29] text-base">Group Standing</h3>
            <div className="flex flex-col gap-3" id="member-standings-list">
              {members.map((m) => {
                const bal = groupNetBalances[m.id] || 0;
                let standingClass = 'bg-[#FAF8F5] text-[#736F6A]';
                let amountClass = 'text-[#2C2B29]';

                if (bal > 0.01) {
                  standingClass = 'bg-[#EEF7F2] text-[#2E7D52] border-[#2E7D52]/20';
                  amountClass = 'text-[#2E7D52]';
                } else if (bal < -0.01) {
                  standingClass = 'bg-[#FDF3F0] text-[#C86D51] border-[#C86D51]/20';
                  amountClass = 'text-[#C86D51]';
                }

                return (
                  <div
                    key={m.id}
                    className={`flex items-center justify-between p-3 border rounded-xl ${standingClass} transition-colors`}
                    id={`standing-item-${m.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={m.avatar}
                        alt={m.name}
                        className="w-8 h-8 rounded-full object-cover border border-[#E6E1DA]"
                        referrerPolicy="no-referrer"
                      />
                      <div>
                        <h4 className="text-sm font-bold text-[#2C2B29]">
                          {m.id === currentUser.id ? 'You' : m.name}
                        </h4>
                        <p className="text-xs text-[#736F6A]">{m.email}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-bold ${amountClass}`}>
                      {formatAmount(bal, currency, true)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Simplified Direct Settling Actions */}
          <div className="bg-white border border-[#E6E1DA] rounded-2xl p-5 flex flex-col gap-4" id="simplified-settling-card">
            <h3 className="font-bold text-[#2C2B29] text-base">Simplified Debts</h3>
            {groupDebts.length === 0 ? (
              <div className="p-8 text-center border border-[#E6E1DA] rounded-xl bg-[#FAF8F5]/50 flex flex-col items-center justify-center gap-2" id="simplified-debts-empty">
                <span className="text-2xl">🎉</span>
                <h4 className="font-bold text-[#2C2B29] text-sm">Everyone is settled up!</h4>
                <p className="text-xs text-[#736F6A]">No transactions needed to settle bills inside this group.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3" id="simplified-debts-list">
                {groupDebts.map((debt, idx) => {
                  const fromUser = memberMap[debt.from];
                  const toUser = memberMap[debt.to];
                  const isIowThisDebt = debt.from === currentUser.id;
                  const isOwedToMe = debt.to === currentUser.id;

                  return (
                    <div
                      key={idx}
                      className="border border-[#E6E1DA] hover:border-[#3C5A48]/40 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white"
                      id={`group-debt-row-${idx}`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="flex items-center -space-x-1.5 flex-shrink-0">
                          <img
                            src={fromUser?.avatar}
                            alt={fromUser?.name}
                            className="w-7 h-7 rounded-full border border-white object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <img
                            src={toUser?.avatar}
                            alt={toUser?.name}
                            className="w-7 h-7 rounded-full border border-white object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="text-xs leading-relaxed text-[#736F6A]">
                          <strong className="text-[#2C2B29]">{fromUser?.id === currentUser.id ? 'You' : fromUser?.name}</strong>{' '}
                          owe{' '}
                          <strong className="text-[#2C2B29]">{toUser?.id === currentUser.id ? 'You' : toUser?.name}</strong>{' '}
                          <span className="font-extrabold text-[#2C2B29] text-sm block sm:inline sm:ml-1">{formatAmount(debt.amount, currency)}</span>
                        </div>
                      </div>

                      {/* Settlement Action Button */}
                      {(isIowThisDebt || isOwedToMe) && (
                        <button
                          onClick={() => onSettleDebt(debt.from, debt.to, debt.amount, group.id)}
                          className="px-3 py-1.5 border border-[#3C5A48] hover:bg-[#EBF1ED] text-[#3C5A48] font-bold text-xs rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
                          type="button"
                          id={`settle-group-btn-${idx}`}
                        >
                          Record Settlement
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ANALYTICS & DASHBOARD TAB CONTENT */
        <div className="flex flex-col gap-6" id="analytics-tab-content">
          {/* Charts Grid: Pie Charts & Bar Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" id="group-charts-grid">
            {/* Pie Chart 1: Expense Breakdown by Category */}
            <div className="bg-white border border-[#E6E1DA] rounded-2xl p-5 shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-[#E6E1DA] pb-3">
                <div>
                  <h3 className="font-bold text-[#2C2B29] text-sm md:text-base flex items-center gap-2">
                    <PieIcon className="w-4 h-4 text-[#3C5A48]" />
                    Expenses by Category
                  </h3>
                  <p className="text-xs text-[#736F6A]">Where the group spends money</p>
                </div>
                <span className="text-xs font-extrabold text-[#3C5A48] bg-[#EBF1ED] px-2.5 py-1 rounded-lg">
                  {formatAmount(totalGroupSpend, currency)}
                </span>
              </div>

              {categoryChartData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-xs text-[#736F6A]">
                  No expense category data recorded yet
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={categoryChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {categoryChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <ReTooltip
                        formatter={(val: number) => [formatAmount(val, currency), 'Total Spent']}
                        contentStyle={{
                          backgroundColor: '#2C2B29',
                          borderRadius: '12px',
                          color: '#FFFFFF',
                          border: 'none',
                          fontSize: '12px',
                        }}
                      />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Pie Chart 2: Who Paid How Much (Payer Donut Chart) */}
            <div className="bg-white border border-[#E6E1DA] rounded-2xl p-5 shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-[#E6E1DA] pb-3">
                <div>
                  <h3 className="font-bold text-[#2C2B29] text-sm md:text-base flex items-center gap-2">
                    <PieIcon className="w-4 h-4 text-[#3C5A48]" />
                    Payer Share Distribution
                  </h3>
                  <p className="text-xs text-[#736F6A]">Who paid for the bills upfront</p>
                </div>
                <span className="text-xs font-bold text-[#736F6A] bg-[#FAF8F5] px-2.5 py-1 rounded-lg border border-[#E6E1DA]">
                  {memberPayerPieData.length} Payers
                </span>
              </div>

              {memberPayerPieData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-xs text-[#736F6A]">
                  No payer data available
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={memberPayerPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {memberPayerPieData.map((entry, index) => (
                          <Cell key={`cell-payer-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <ReTooltip
                        formatter={(val: number) => [formatAmount(val, currency), 'Paid Out']}
                        contentStyle={{
                          backgroundColor: '#2C2B29',
                          borderRadius: '12px',
                          color: '#FFFFFF',
                          border: 'none',
                          fontSize: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Bar Chart: Paid vs Share Comparison per Member */}
          <div className="bg-white border border-[#E6E1DA] rounded-2xl p-5 md:p-6 shadow-xs flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E6E1DA] pb-3">
              <div>
                <h3 className="font-bold text-[#2C2B29] text-base flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-[#3C5A48]" />
                  Paid Out vs Total Share
                </h3>
                <p className="text-xs text-[#736F6A]">Comparison of actual money paid out versus each member's split share</p>
              </div>
            </div>

            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={memberBarChartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6E1DA" />
                  <XAxis dataKey="name" stroke="#736F6A" fontSize={12} tickLine={false} />
                  <YAxis stroke="#736F6A" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}`} />
                  <ReTooltip
                    formatter={(val: number) => [formatAmount(val, currency)]}
                    contentStyle={{
                      backgroundColor: '#2C2B29',
                      borderRadius: '12px',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Bar dataKey="Paid Out" fill="#3C5A48" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Total Share" fill="#82A791" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Member Spending Table & Contribution Bars */}
          <div className="bg-white border border-[#E6E1DA] rounded-2xl p-5 md:p-6 flex flex-col gap-5 shadow-xs" id="group-analytics-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E6E1DA] pb-4">
              <div>
                <h3 className="font-bold text-[#2C2B29] text-base">Group Member Breakdown</h3>
                <p className="text-xs text-[#736F6A] mt-0.5">Summary of total paid vs share across all {members.length} members</p>
              </div>
              <div className="text-xs font-semibold bg-[#FAF8F5] text-[#736F6A] px-3 py-1.5 rounded-xl border border-[#E6E1DA] self-start sm:self-auto">
                Avg per member: <strong className="text-[#2C2B29]">{formatAmount(totalGroupSpend / (members.length || 1), currency)}</strong>
              </div>
            </div>

            <div className="flex flex-col gap-4" id="member-analytics-list">
              {memberSpendingList.map(({ user, paid, share, net }) => {
                const paidPct = totalGroupSpend > 0 ? (paid / totalGroupSpend) * 100 : 0;
                const isCurrentUser = user.id === currentUser.id;

                return (
                  <div
                    key={user.id}
                    className={`p-4 border rounded-xl flex flex-col gap-3 transition-colors ${isCurrentUser ? 'bg-[#FAF8F5] border-[#3C5A48]/30' : 'bg-white border-[#E6E1DA]'}`}
                    id={`analytics-member-${user.id}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="w-9 h-9 rounded-full object-cover border border-[#E6E1DA]"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#2C2B29]">
                              {isCurrentUser ? 'You' : user.name}
                            </span>
                            {isCurrentUser && (
                              <span className="text-[10px] font-extrabold bg-[#3C5A48] text-white px-2 py-0.2 rounded-md">YOU</span>
                            )}
                          </div>
                          <span className="text-xs text-[#736F6A]">{user.email}</span>
                        </div>
                      </div>

                      {/* Financial badges for member */}
                      <div className="flex items-center gap-4 text-xs font-semibold">
                        <div>
                          <span className="text-[10px] uppercase text-[#736F6A] block">Paid Out</span>
                          <span className="text-[#2C2B29] font-bold">{formatAmount(paid, currency)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-[#736F6A] block">Total Share</span>
                          <span className="text-[#2C2B29] font-bold">{formatAmount(share, currency)}</span>
                        </div>
                        <div className="text-right min-w-[75px]">
                          <span className="text-[10px] uppercase text-[#736F6A] block">Standing</span>
                          <span className={`font-bold ${net > 0.01 ? 'text-[#2E7D52]' : net < -0.01 ? 'text-[#C86D51]' : 'text-[#736F6A]'}`}>
                            {formatAmount(net, currency, true)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar of total group paid */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[11px] text-[#736F6A]">
                        <span>Paid {paidPct.toFixed(1)}% of total group bills</span>
                        <span>{formatAmount(paid, currency)} / {formatAmount(totalGroupSpend, currency)}</span>
                      </div>
                      <div className="w-full h-2 bg-[#E6E1DA]/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#3C5A48] transition-all duration-300 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(0, paidPct))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
