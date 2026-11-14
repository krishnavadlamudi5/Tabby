import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, CalendarClock, ClipboardCheck, RotateCcw, ShoppingBasket } from 'lucide-react';
import { financeApi } from '../api';
import { Badge, Button, Card, Empty, ErrorBlock, Money, MonthSwitcher, ProgressBar, SectionTitle, Spinner, currentMonth, fmtDate, monthLabel, toastError, useAsync } from '../components/ui';
import { formatPaise } from '../../../utils/currency';
import type { FinanceTab } from '../types';

export default function FinanceHome({ onNavigate }: { onNavigate: (tab: FinanceTab, params?: Record<string, string>) => void }) {
  const [month, setMonth] = useState(currentMonth());
  const { data, error, loading, reload } = useAsync(() => financeApi.dashboard(month), [month]);
  const alerts = useAsync(() => financeApi.alerts(), []);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const change = data.previousSpendPaise ? Math.round(((data.spendPaise - data.previousSpendPaise) / data.previousSpendPaise) * 100) : null;
  const donut = data.byCategory.filter((c) => c.amountPaise > 0);
  const unread = (alerts.data?.alerts || []).filter((a) => !a.readAt).slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <MonthSwitcher month={month} onChange={setMonth} />
        {data.review.total > 0 && (
          <Button variant="secondary" size="sm" onClick={() => onNavigate('review')}>
            <ClipboardCheck className="w-3.5 h-3.5" /> {data.review.total} to review
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="md:col-span-1 flex flex-col gap-1" onClick={() => onNavigate('transactions', { month })}>
          <span className="text-[11px] font-bold text-[#736F6A] uppercase tracking-wider">Spent in {monthLabel(month).split(' ')[0]}</span>
          <span className="text-2xl font-extrabold tabular-nums">{formatPaise(data.spendPaise)}</span>
          <span className="text-[11px] text-[#736F6A] flex items-center gap-1">
            {change === null ? 'No spend last month' : (
              <>
                {change >= 0 ? <ArrowUpRight className="w-3.5 h-3.5 text-[#C86D51]" /> : <ArrowDownRight className="w-3.5 h-3.5 text-[#2D6A4F]" />}
                {Math.abs(change)}% vs {formatPaise(data.previousSpendPaise)} in {monthLabel(data.previousMonth).split(' ')[0]}
              </>
            )}
          </span>
          <span className="text-[10px] text-[#A39E98]">Excludes self transfers, card bill payments and declined payments; refunds are subtracted.</span>
        </Card>

        <Card className="md:col-span-2">
          <SectionTitle>Where it went</SectionTitle>
          {donut.length === 0 ? <span className="text-xs text-[#736F6A]">No spending yet this month.</span> : (
            <div className="flex flex-col sm:flex-row gap-3 items-center">
              <div className="w-40 h-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donut} dataKey="amountPaise" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2} isAnimationActive={false}>
                      {donut.map((c, i) => <Cell key={i} fill={c.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatPaise(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 w-full flex flex-col gap-1.5">
                {data.byCategory.slice(0, 7).map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => onNavigate('transactions', { month, categoryId: c.categoryId || 'none' })}
                    className="flex items-center gap-2 text-xs hover:bg-[#FAF8F5] rounded-lg px-1.5 py-1 cursor-pointer text-left"
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="font-bold tabular-nums">{formatPaise(c.amountPaise)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {data.budgets.length > 0 && (
        <Card>
          <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => onNavigate('categories')}>Edit budgets</Button>}>Budgets</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.budgets.map((b) => (
              <div key={b.categoryId} className="flex flex-col gap-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold">{b.name}</span>
                  <span className={`tabular-nums ${b.spentPaise > b.budgetPaise ? 'text-[#C86D51] font-bold' : 'text-[#736F6A]'}`}>
                    {formatPaise(b.spentPaise)} / {formatPaise(b.budgetPaise)}
                  </span>
                </div>
                <ProgressBar value={b.spentPaise} max={b.budgetPaise} color={b.color} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => onNavigate('commitments')}>All</Button>}>
            <span className="inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Next 14 days</span>
          </SectionTitle>
          {data.upcoming.length === 0 ? <span className="text-xs text-[#736F6A]">Nothing due. Add EMIs, SIPs and subscriptions under Commitments.</span> : (
            <div className="flex flex-col divide-y divide-[#F2EFEA]">
              {data.upcoming.map((u) => {
                const overdue = new Date(u.dueDate) < new Date() && u.status !== 'paid';
                return (
                  <div key={`${u.kind}-${u.id}`} className="flex items-center gap-2 py-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{u.name}</div>
                      <div className={`text-[11px] ${overdue ? 'text-[#C86D51] font-bold' : 'text-[#736F6A]'}`}>{fmtDate(u.dueDate)} · {u.type.replace('_', ' ')}</div>
                    </div>
                    <StatusBadge status={u.status} />
                    <Money paise={u.amountPaise} currency={u.currency} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle><span className="inline-flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Pending refunds</span></SectionTitle>
          {data.pendingRefunds.length === 0 ? <span className="text-xs text-[#736F6A]">No refunds waiting.</span> : (
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
          )}
        </Card>
      </div>

      {data.groceries && (data.groceries.totalPaise !== 0 || data.groceries.trend.some((t) => t.amountPaise)) && (
        <Card>
          <SectionTitle><span className="inline-flex items-center gap-1"><ShoppingBasket className="w-3.5 h-3.5" /> Groceries · {formatPaise(data.groceries.totalPaise)}</span></SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              {data.groceries.breakdown.length === 0 && <span className="text-xs text-[#736F6A]">No grocery spend this month.</span>}
              {data.groceries.breakdown.sort((a, b) => b.amountPaise - a.amountPaise).map((g) => (
                <div key={g.id} className="flex flex-col gap-0.5">
                  <div className="flex justify-between text-xs"><span>{g.name}</span><span className="font-bold tabular-nums">{formatPaise(g.amountPaise)}</span></div>
                  <ProgressBar value={g.amountPaise} max={data.groceries!.totalPaise || 1} color="#5B8C5A" />
                </div>
              ))}
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.groceries.trend.map((t) => ({ name: monthLabel(t.month).slice(0, 3), value: t.amountPaise / 100 }))}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => formatPaise(Math.round(Number(v) * 100))} />
                  <Bar dataKey="value" fill="#5B8C5A" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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

        <Card>
          <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => onNavigate('accounts')}>Accounts</Button>}>Reconciliation</SectionTitle>
          {data.unreconciledAccounts.length === 0 ? <span className="text-xs text-[#736F6A]">All accounts match their latest statements.</span> : (
            <div className="flex flex-col gap-1.5">
              {data.unreconciledAccounts.map((a) => (
                <div key={a.accountId} className="flex items-center justify-between text-xs">
                  <span className="font-semibold">{a.name}</span>
                  {a.lastStatementStatus === 'mismatch' ? <Badge tone="red">Statement mismatch</Badge> : <Badge tone="amber">{a.unreconciledCount} not on a statement yet</Badge>}
                </div>
              ))}
              <span className="text-[10px] text-[#A39E98] mt-1">Upload this month's statement CSV/PDF on the account to reconcile.</span>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone = status === 'paid' ? 'green' : status === 'missed' || status === 'failed' ? 'red' : status === 'action_needed' || status === 'renewal_due' ? 'amber' : 'neutral';
  return <Badge tone={tone as any}>{status.replace('_', ' ')}</Badge>;
}

export { Empty };
