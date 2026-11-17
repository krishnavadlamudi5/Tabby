import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { AlertTriangle, Bell, CalendarClock, ChevronRight, ClipboardCheck, RotateCcw, Shield, TrendingUp, Wallet } from 'lucide-react';
import { financeApi } from '../api';
import { useFinanceStore } from '../store';
import { Badge, Button, Card, Empty, ErrorBlock, Money, ProgressBar, SectionTitle, Spinner, currentMonth, fmtDate, monthLabel, toastError, useAsync } from '../components/ui';
import { formatPaise } from '../../../utils/currency';
import { usePrefsStore } from '../../../store/usePrefsStore';
import type { FinanceTab } from '../types';

/**
 * Money overview: one card per page (Spending, Insurance, Investments) with
 * the numbers that matter, plus what's due soon and alerts.
 */
export default function FinanceHome({ onNavigate }: { onNavigate: (tab: FinanceTab, params?: Record<string, string>) => void }) {
  const month = currentMonth();
  const basis = usePrefsStore((s) => s.prefs.reportBasis) || 'fy';
  const monthlyBudget = usePrefsStore((s) => s.prefs.monthlyBudgetPaise) || 0;
  const { data, error, loading, reload } = useAsync(() => financeApi.dashboard(month), [month]);
  const policies = useAsync(() => financeApi.policies(), []);
  const premiums = useAsync(() => financeApi.premiumSummary(basis, 1), [basis]);
  const investments = useAsync(() => financeApi.investments(), []);
  const alerts = useAsync(() => financeApi.alerts(), []);
  const reviewCount = useFinanceStore((s) => s.reviewCount);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const change = data.previousSpendPaise ? Math.round(((data.spendPaise - data.previousSpendPaise) / data.previousSpendPaise) * 100) : null;
  const donut = data.byCategory.filter((c) => c.amountPaise > 0);
  const unread = (alerts.data?.alerts || []).filter((a) => !a.readAt).slice(0, 5);
  const used = monthlyBudget ? Math.round((data.spendPaise / monthlyBudget) * 100) : 0;

  const pol = policies.data?.policies || [];
  const activePol = pol.filter((p) => p.status === 'active' || p.status === 'renewal_due');
  const nextRenewal = activePol.filter((p) => p.renewalDate).sort((a, b) => new Date(a.renewalDate!).getTime() - new Date(b.renewalDate!).getTime())
    .find((p) => new Date(p.renewalDate!).getTime() > Date.now() - 30 * 86_400_000);
  const renewDays = nextRenewal ? Math.ceil((new Date(nextRenewal.renewalDate!).getTime() - Date.now()) / 86_400_000) : null;
  const premiumYear = premiums.data?.years[premiums.data.years.length - 1];
  const inv = investments.data?.totals;

  return (
    <div className="flex flex-col gap-4" id="money-overview">
      {reviewCount > 0 && (
        <button type="button" onClick={() => onNavigate('review')}
          className="flex items-center gap-3 p-3 rounded-2xl bg-[#FFF8E6] border border-[#E9C46A]/60 text-left cursor-pointer hover:border-[#E9C46A]">
          <ClipboardCheck className="w-5 h-5 text-[#8A5A00] shrink-0" />
          <span className="flex-1 text-xs"><b>{reviewCount} {reviewCount === 1 ? 'item needs' : 'items need'} your check</b> <span className="text-[#736F6A]">· payments or emails Tabby couldn't sort</span></span>
          <ChevronRight className="w-4 h-4 text-[#8A5A00]" />
        </button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <SectionCard icon={<Wallet className="w-4 h-4" />} title={`Spending · ${monthLabel(month).split(' ')[0]}`} onOpen={() => onNavigate('transactions')}>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-2xl font-extrabold tabular-nums">{formatPaise(data.spendPaise)}</div>
              <div className="text-[11px] text-[#736F6A]">
                {change === null ? 'Nothing spent last month' : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}% vs last month`}
              </div>
            </div>
            {donut.length > 0 && (
              <div className="w-16 h-16 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donut} dataKey="amountPaise" innerRadius={18} outerRadius={30} paddingAngle={2} isAnimationActive={false}>
                      {donut.map((c, i) => <Cell key={i} fill={c.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          {monthlyBudget > 0 ? (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]"><span className="text-[#736F6A]">Budget</span><span className={used >= 100 ? 'text-[#C86D51] font-bold' : used >= 80 ? 'text-[#8A5A00] font-bold' : 'text-[#736F6A]'}>{used}% of {formatPaise(monthlyBudget)}</span></div>
              <ProgressBar value={data.spendPaise} max={monthlyBudget} color={used >= 80 ? '#E9A23B' : '#3C5A48'} />
            </div>
          ) : <span className="text-[11px] text-[#3C5A48] font-bold">Set a monthly budget →</span>}
          <div className="flex flex-col gap-0.5">
            {donut.slice(0, 3).map((c) => (
              <div key={c.name} className="flex items-center gap-2 text-[11px]">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                <span className="flex-1 truncate text-[#736F6A]">{c.name}</span>
                <span className="font-bold tabular-nums">{formatPaise(c.amountPaise)}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard icon={<Shield className="w-4 h-4" />} title="Insurance" onOpen={() => onNavigate('insurance')}>
          {pol.length === 0 ? <span className="text-xs text-[#736F6A]">No policies yet. Policies emailed to you are added automatically.</span> : (
            <>
              <div>
                <div className="text-2xl font-extrabold tabular-nums">{formatPaise(premiumYear ? premiums.data!.totalsByYear[premiumYear] || 0 : 0)}</div>
                <div className="text-[11px] text-[#736F6A]">premiums paid {premiumYear ? (basis === 'fy' ? `in FY ${premiumYear}` : `in ${premiumYear}`) : 'this year'} · {activePol.length} active</div>
              </div>
              {nextRenewal && renewDays !== null && (
                <div className={`text-[11px] rounded-lg px-2 py-1.5 ${renewDays <= 30 ? 'bg-[#FFF8E6] text-[#8A5A00]' : 'bg-[#FAF8F5] text-[#736F6A]'}`}>
                  <b>Next renewal:</b> {nextRenewal.insurer}{nextRenewal.vehicleNumber ? ` · ${nextRenewal.vehicleNumber}` : ''} · {renewDays < 0 ? `overdue ${-renewDays}d` : `in ${renewDays} days`} · {formatPaise(nextRenewal.premiumPaise)}
                </div>
              )}
            </>
          )}
        </SectionCard>

        <SectionCard icon={<TrendingUp className="w-4 h-4" />} title="Investments" onOpen={() => onNavigate('investments')}>
          {!inv || (inv.valuePaise === 0 && inv.putInLast12Paise === 0 && !investments.data?.sips.length) ? (
            <span className="text-xs text-[#736F6A]">Add mutual funds, stocks, FDs, PPF or gold to see what they're worth.</span>
          ) : (
            <>
              <div>
                <div className="text-2xl font-extrabold tabular-nums">{formatPaise(inv.valuePaise)}</div>
                <div className={`text-[11px] ${inv.gainPaise >= 0 ? 'text-[#2D6A4F]' : 'text-[#C86D51]'}`}>
                  {inv.gainPaise >= 0 ? '+' : '−'}{formatPaise(Math.abs(inv.gainPaise))}{inv.gainPct !== null ? ` (${inv.gainPct}%)` : ''} on {formatPaise(inv.investedPaise)}
                </div>
              </div>
              <div className="text-[11px] text-[#736F6A]">SIPs {formatPaise(inv.sipMonthlyPaise)}/month · {formatPaise(inv.putInThisMonthPaise)} invested this month</div>
            </>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => onNavigate('commitments')}>Bills & EMIs</Button>}>
            <span className="inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Due in 14 days</span>
          </SectionTitle>
          {data.upcoming.length === 0 ? <span className="text-xs text-[#736F6A]">Nothing due in the next two weeks.</span> : (
            <div className="flex flex-col divide-y divide-[#F2EFEA]">
              {data.upcoming.map((u) => {
                const overdue = new Date(u.dueDate) < new Date() && u.status !== 'paid';
                return (
                  <button key={`${u.kind}-${u.id}`} type="button" onClick={() => onNavigate(u.kind === 'policy' || u.type === 'premium' ? 'insurance' : u.type === 'sip' ? 'investments' : 'commitments')}
                    className="flex items-center gap-2 py-2 text-xs text-left cursor-pointer hover:bg-[#FAF8F5] -mx-1 px-1 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{u.name}</div>
                      <div className={`text-[11px] ${overdue ? 'text-[#C86D51] font-bold' : 'text-[#736F6A]'}`}>{fmtDate(u.dueDate)} · {u.type.replace('_', ' ')}</div>
                    </div>
                    <StatusBadge status={u.status} />
                    <Money paise={u.amountPaise} currency={u.currency} />
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle action={unread.length > 0 && <Button size="sm" variant="ghost" onClick={async () => { try { await financeApi.readAllAlerts(); alerts.reload(); } catch (e) { toastError(e); } }}>Mark all read</Button>}>
            <span className="inline-flex items-center gap-1"><Bell className="w-3.5 h-3.5" /> Alerts</span>
          </SectionTitle>
          {unread.length === 0 ? <span className="text-xs text-[#736F6A]">You're all caught up.</span> : (
            <div className="flex flex-col gap-2">
              {unread.map((a) => (
                <div key={a.id} className="flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#C86D51] mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{a.title}</div>
                    {a.body && <div className="text-[11px] text-[#736F6A] whitespace-pre-line">{a.body}</div>}
                  </div>
                  <button type="button" className="text-[10px] text-[#3C5A48] font-bold cursor-pointer" onClick={async () => { await financeApi.readAlert(a.id); alerts.reload(); }}>Dismiss</button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {data.pendingRefunds.length > 0 && (
        <Card>
          <SectionTitle><span className="inline-flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Refunds on the way</span></SectionTitle>
          <div className="flex flex-col divide-y divide-[#F2EFEA]">
            {data.pendingRefunds.map((r) => (
              <div key={r.id} className="flex items-center gap-2 py-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{r.merchant || 'Refund'}</div>
                  <div className={`text-[11px] ${r.overdue ? 'text-[#C86D51] font-bold' : 'text-[#736F6A]'}`}>
                    {r.expectedAt ? `${r.overdue ? 'Overdue since' : 'Expected by'} ${fmtDate(r.expectedAt)}` : 'Expected soon'}
                  </div>
                </div>
                <Money paise={r.amountPaise} direction="credit" />
              </div>
            ))}
          </div>
        </Card>
      )}

      {data.unreconciledAccounts.some((a) => a.lastStatementStatus === 'mismatch') && (
        <Card className="!bg-[#FDF3F0] !border-[#C86D51]/30">
          <div className="flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-[#C86D51]" />
            <span className="flex-1">A bank statement doesn't add up with what Tabby recorded.</span>
            <Button size="sm" variant="secondary" onClick={() => onNavigate('accounts')}>Check</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function SectionCard({ icon, title, onOpen, children }: { icon: React.ReactNode; title: string; onOpen: () => void; children: React.ReactNode }) {
  return (
    <Card onClick={onOpen} className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#736F6A] uppercase tracking-wider">
          <span className="w-6 h-6 rounded-lg bg-[#EBF1ED] text-[#3C5A48] flex items-center justify-center">{icon}</span>{title}
        </span>
        <ChevronRight className="w-4 h-4 text-[#A39E98]" />
      </div>
      {children}
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone = status === 'paid' ? 'green' : status === 'missed' || status === 'failed' ? 'red' : status === 'action_needed' || status === 'renewal_due' ? 'amber' : 'neutral';
  return <Badge tone={tone as any}>{status.replace('_', ' ')}</Badge>;
}

export { Empty };
