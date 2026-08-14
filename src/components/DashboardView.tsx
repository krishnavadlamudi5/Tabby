/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { User, Expense, Debt, Activity } from '../types';
import { calculateNetBalances, simplifyDebts } from '../utils/debtSimplifier';
import { formatAmount } from '../utils/currency';
import { TrendingDown, TrendingUp, DollarSign, Wallet, ArrowRight, UserCheck, Bell, MessageSquare, Clock, BarChart3 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DashboardViewProps {
  currentUser: User;
  allUsers: User[];
  expenses: Expense[];
  activities: Activity[];
  currency?: string;
  onSettleDebt: (fromUserId: string, toUserId: string, amount: number, groupId: string | null) => void;
  onNavigateToFriend: (friendId: string) => void;
}

export default function DashboardView({
  currentUser,
  allUsers,
  expenses,
  activities,
  currency = 'USD',
  onSettleDebt,
  onNavigateToFriend,
}: DashboardViewProps) {
  const memberMap = React.useMemo(() => {
    const map: Record<string, User> = {};
    allUsers.forEach((u) => {
      map[u.id] = u;
    });
    return map;
  }, [allUsers]);

  // Monthly Spending Trends data (Last 6 Months)
  const monthlyTrendsData = React.useMemo(() => {
    const monthsMap: Record<string, { label: string; paid: number; share: number; timestamp: number }> = {};
    
    // Generate last 6 calendar months
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString(undefined, { month: 'short' });
      monthsMap[key] = { label, paid: 0, share: 0, timestamp: d.getTime() };
    }

    expenses.forEach((e) => {
      if (e.isSettlement) return;
      const d = new Date(e.date || e.createdAt);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      
      if (monthsMap[key]) {
        if (e.paidBy === currentUser.id) {
          monthsMap[key].paid += e.amount;
        }
        const mySplit = e.splits.find((s) => s.userId === currentUser.id);
        if (mySplit) {
          monthsMap[key].share += mySplit.amount;
        }
      }
    });

    return Object.values(monthsMap).sort((a, b) => a.timestamp - b.timestamp);
  }, [expenses, currentUser.id]);

  // Calculate global net balances and debts
  const { netBalances, globalDebts, totalYouOwe, totalYouAreOwed, netBalance } = React.useMemo(() => {
    const userIds = allUsers.map((u) => u.id);
    const balances = calculateNetBalances(expenses, userIds);
    const debts = simplifyDebts(balances);

    // Filter debts involving the current user
    const userOwes = debts.filter((d) => d.from === currentUser.id);
    const userIsOwed = debts.filter((d) => d.to === currentUser.id);

    const oweSum = userOwes.reduce((acc, d) => acc + d.amount, 0);
    const owedSum = userIsOwed.reduce((acc, d) => acc + d.amount, 0);
    const net = Number((balances[currentUser.id] || 0).toFixed(2));

    return {
      netBalances: balances,
      globalDebts: debts,
      totalYouOwe: oweSum,
      totalYouAreOwed: owedSum,
      netBalance: net,
    };
  }, [expenses, allUsers, currentUser.id]);

  // Separate debts involving currentUser
  const myDebtsToOthers = globalDebts.filter((d) => d.from === currentUser.id);
  const othersDebtsToMe = globalDebts.filter((d) => d.to === currentUser.id);

  // Helper to humanize timestamp relative activity displays
  const humanizeTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex flex-col gap-6" id="dashboard-view-main">
      
      {/* 3-Card Summary Financial Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="dashboard-stats-grid">
        {/* Card 1: Net Balance */}
        <div className="bg-white border border-[#E6E1DA] rounded-2xl p-5 shadow-xs flex items-center justify-between" id="stat-total-balance">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-[#736F6A] uppercase tracking-wider">Total Net Position</span>
            <span className={`text-xl md:text-2xl font-black ${netBalance > 0.01 ? 'text-[#2E7D52]' : netBalance < -0.01 ? 'text-[#C86D51]' : 'text-[#736F6A]'}`}>
              {formatAmount(netBalance, currency, true)}
            </span>
            <span className="text-xs text-[#736F6A]">across all groups & friends</span>
          </div>
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${netBalance > 0.01 ? 'bg-[#EEF7F2] text-[#2E7D52]' : netBalance < -0.01 ? 'bg-[#FDF3F0] text-[#C86D51]' : 'bg-[#F8F5F2] text-[#736F6A]'}`}>
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: You Owe */}
        <div className="bg-white border border-[#E6E1DA] rounded-2xl p-5 shadow-xs flex items-center justify-between" id="stat-you-owe">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-[#736F6A] uppercase tracking-wider">You Owe Overall</span>
            <span className="text-xl md:text-2xl font-black text-[#C86D51]">
              {formatAmount(totalYouOwe, currency)}
            </span>
            <span className="text-xs text-[#736F6A]">payments you need to make</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-[#FDF3F0] text-[#C86D51] flex items-center justify-center">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: You Are Owed */}
        <div className="bg-white border border-[#E6E1DA] rounded-2xl p-5 shadow-xs flex items-center justify-between" id="stat-you-are-owed">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-[#736F6A] uppercase tracking-wider">You Are Owed</span>
            <span className="text-xl md:text-2xl font-black text-[#2E7D52]">
              {formatAmount(totalYouAreOwed, currency)}
            </span>
            <span className="text-xs text-[#736F6A]">outstanding paybacks due</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-[#EEF7F2] text-[#2E7D52] flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Two-Column Panel Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="dashboard-panels-container">
        
        {/* Left Column: Monthly Trends & Balances (7/12 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-5" id="dashboard-left-panel">

          {/* Monthly Spending Trends Chart Card */}
          <div className="bg-white border border-[#E6E1DA] rounded-2xl p-5 shadow-xs flex flex-col gap-3" id="monthly-spending-trends-card">
            <div className="flex items-center justify-between border-b border-[#E6E1DA] pb-3">
              <div>
                <h3 className="font-bold text-[#2C2B29] text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#3C5A48]" />
                  Monthly Spending Trends
                </h3>
                <p className="text-xs text-[#736F6A]">Your total money paid vs your calculated split share</p>
              </div>
            </div>

            <div className="h-56 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrendsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E6E1DA" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#736F6A' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#736F6A' }} axisLine={false} tickLine={false} />
                  <ReTooltip
                    formatter={(val: number) => [formatAmount(val, currency), '']}
                    contentStyle={{
                      backgroundColor: '#2C2B29',
                      borderRadius: '12px',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="paid" name="You Paid Out" fill="#3C5A48" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="share" name="Your Split Share" fill="#D9A05B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-[#E6E1DA] rounded-2xl p-5 shadow-xs flex flex-col gap-4">
            <h2 className="text-base font-bold text-[#2C2B29] tracking-tight">Active Balances Breakdown</h2>

            {/* Sub-Section: You Owe */}
            <div className="flex flex-col gap-2.5" id="sub-you-owe-section">
              <span className="text-xs font-bold text-[#736F6A] uppercase tracking-wider block">You Owe These People</span>
              {myDebtsToOthers.length === 0 ? (
                <div className="p-4 border border-[#E6E1DA] rounded-xl bg-[#FAF8F5]/50 text-[#736F6A] text-xs flex items-center gap-2">
                  <span>✓</span>
                  <span>You do not owe anyone money overall! Awesome job.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {myDebtsToOthers.map((debt, idx) => {
                    const creditor = memberMap[debt.to];
                    return (
                      <div
                        key={idx}
                        className="border border-[#E6E1DA] hover:border-[#3C5A48]/40 rounded-xl p-3 flex items-center justify-between gap-3 bg-white transition-all"
                        id={`my-debt-${debt.to}`}
                      >
                        <button
                          onClick={() => onNavigateToFriend(debt.to)}
                          className="flex items-center gap-3 text-left hover:opacity-85 cursor-pointer"
                          type="button"
                        >
                          <img
                            src={creditor?.avatar}
                            alt={creditor?.name}
                            className="w-8 h-8 rounded-full object-cover border border-[#E6E1DA]"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <h4 className="text-sm font-bold text-[#2C2B29]">{creditor?.name}</h4>
                            <p className="text-xs text-[#736F6A]">You owe them <strong className="text-[#C86D51] font-bold">{formatAmount(debt.amount, currency)}</strong></p>
                          </div>
                        </button>
                        <button
                          onClick={() => onSettleDebt(currentUser.id, debt.to, debt.amount, null)}
                          className="px-3 py-1.5 border border-[#3C5A48] hover:bg-[#EBF1ED] text-[#3C5A48] font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1"
                          type="button"
                          id={`settle-creditor-${debt.to}`}
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          Settle
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sub-Section: You are owed */}
            <div className="flex flex-col gap-2.5 mt-2" id="sub-you-owed-section">
              <span className="text-xs font-bold text-[#736F6A] uppercase tracking-wider block">These People Owe You</span>
              {othersDebtsToMe.length === 0 ? (
                <div className="p-4 border border-[#E6E1DA] rounded-xl bg-[#FAF8F5]/50 text-[#736F6A] text-xs flex items-center gap-2">
                  <span>ℹ</span>
                  <span>Nobody owes you any money right now.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {othersDebtsToMe.map((debt, idx) => {
                    const debtor = memberMap[debt.from];
                    return (
                      <div
                        key={idx}
                        className="border border-[#E6E1DA] hover:border-[#3C5A48]/40 rounded-xl p-3 flex items-center justify-between gap-3 bg-white transition-all"
                        id={`other-debt-${debt.from}`}
                      >
                        <button
                          onClick={() => onNavigateToFriend(debt.from)}
                          className="flex items-center gap-3 text-left hover:opacity-85 cursor-pointer"
                          type="button"
                        >
                          <img
                            src={debtor?.avatar}
                            alt={debtor?.name}
                            className="w-8 h-8 rounded-full object-cover border border-[#E6E1DA]"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <h4 className="text-sm font-bold text-[#2C2B29]">{debtor?.name}</h4>
                            <p className="text-xs text-[#736F6A]">They owe you <strong className="text-[#2E7D52] font-bold">{formatAmount(debt.amount, currency)}</strong></p>
                          </div>
                        </button>
                        <button
                          onClick={() => onSettleDebt(debt.from, currentUser.id, debt.amount, null)}
                          className="px-3 py-1.5 border border-[#3C5A48] hover:bg-[#EBF1ED] text-[#3C5A48] font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1"
                          type="button"
                          id={`settle-debtor-${debt.from}`}
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          Settle
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Recent Activity Feed (5/12 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-5" id="dashboard-right-panel">
          <div className="bg-white border border-[#E6E1DA] rounded-2xl p-5 shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between" id="activity-header">
              <h2 className="text-base font-bold text-[#2C2B29] tracking-tight">Recent Activity</h2>
              <Clock className="w-4 h-4 text-[#736F6A]" />
            </div>

            <div className="flex flex-col gap-4 max-h-[380px] overflow-y-auto pr-1" id="activity-timeline">
              {activities.length === 0 ? (
                <div className="p-8 text-center text-[#736F6A] text-xs flex items-center justify-center">
                  No activity recorded yet.
                </div>
              ) : (
                activities
                  .slice()
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .map((act) => {
                    const actUser = memberMap[act.userId];
                    return (
                      <div key={act.id} className="flex items-start gap-3 text-xs border-l-2 border-[#E6E1DA] pb-4 pl-4 relative last:pb-0 last:border-transparent" id={`activity-item-${act.id}`}>
                        {/* Dot indicator */}
                        <div className="absolute -left-[6px] top-1 w-2.5 h-2.5 bg-[#3C5A48] rounded-full border-2 border-white"></div>
                        
                        <img
                          src={actUser?.avatar}
                          alt={actUser?.name || 'User'}
                          className="w-6 h-6 rounded-full object-cover mt-0.5 border border-[#E6E1DA] flex-shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                          <p className="text-[#736F6A] leading-normal">
                            <strong className="text-[#2C2B29] font-semibold">{actUser?.id === currentUser.id ? 'You' : actUser?.name}</strong>{' '}
                            {act.description}
                          </p>
                          <span className="text-[10px] text-[#736F6A]/80 font-medium">
                            {humanizeTime(act.timestamp)}
                          </span>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
