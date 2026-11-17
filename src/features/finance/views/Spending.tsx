import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, CartesianGrid } from 'recharts';
import { AlertTriangle, BarChart3, CalendarClock, ChevronRight, ClipboardCheck, Store, Target, Upload, X } from 'lucide-react';
import { financeApi } from '../api';
import { useFinanceStore } from '../store';
import { Button, Card, ErrorBlock, Field, Money, ProgressBar, SectionTitle, Sheet, Spinner, TextInput, fmtDate, toastError, toastOk, useAsync } from '../components/ui';
import { Period, PeriodPicker, StatTile, currentPeriod, periodLabel, todayKey } from '../components/period';
import { formatPaise, paiseToInput, rupeesToPaise } from '../../../utils/currency';
import { usePrefsStore } from '../../../store/usePrefsStore';
import { StatusBadge } from './FinanceHome';
import Transactions from './Transactions';
import type { FinanceTab, SpendingSummary } from '../types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const trendLabel = (key: string, g: 'day' | 'month') => {
  const [y, m, d] = key.split('-').map(Number);
  return g === 'day' ? `${d} ${MONTHS[m - 1]}` : `${MONTHS[m - 1]} ${String(y).slice(2)}`;
};

/**
 * Spending: everything you paid in a period (month, quarter, year or custom),
 * where it went, budgets with alerts, upcoming bills and the payment list.
 */
export default function Spending({ initial, onNavigate }: { key?: string; initial?: Record<string, string>; onNavigate: (tab: FinanceTab, params?: Record<string, string>) => void }) {
  const basis = usePrefsStore((s) => s.prefs.reportBasis) || 'fy';
  const [period, setPeriod] = useState<Period>(() => {
    if (initial?.from && initial?.to) return { mode: 'custom', from: initial.from, to: initial.to, basis };
    if (initial?.month) {
      const [y, m] = initial.month.split('-').map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return { mode: 'month', from: `${initial.month}-01`, to: `${initial.month}-${last}`, basis };
    }
    return currentPeriod('month', basis);
  });
  const [categoryId, setCategoryId] = useState<string>(initial?.categoryId || '');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [budgetsOpen, setBudgetsOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const reviewCount = useFinanceStore((s) => s.reviewCount);
  const { data, error, loading, reload } = useAsync(() => financeApi.spending(period.from, period.to), [period.from, period.to, version]);
  const bills = useAsync(() => financeApi.commitments(), []);

  const upcoming = useMemo(() => {
    const horizon = Date.now() + 30 * 86_400_000;
    return (bills.data?.commitments || [])
      .filter((c) => c.type !== 'sip' && c.type !== 'premium' && c.status !== 'paused' && new Date(c.schedule.nextDueDate).getTime() <= horizon)
      .slice(0, 6);
  }, [bills.data]);

  const pickCategory = (id: string | null) => {
    const v = id || 'none';
    setCategoryId((cur) => (cur === v ? '' : v));
    setTimeout(() => document.getElementById('spending-payments')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return (
    <div className="flex flex-col gap-4" id="spending-page">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <PeriodPicker value={period} onChange={(p) => { setPeriod(p); setCategoryId(''); }} />
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="secondary" onClick={() => onNavigate('import')}><Upload className="w-3.5 h-3.5" /> Statement</Button>
          <Button size="sm" variant="secondary" onClick={() => onNavigate('reports')}><BarChart3 className="w-3.5 h-3.5" /> Year report</Button>
        </div>
      </div>

      {reviewCount > 0 && (
        <button type="button" onClick={() => onNavigate('review')} id="review-banner"
          className="flex items-center gap-3 p-3 rounded-2xl bg-[#FFF8E6] border border-[#E9C46A]/60 text-left cursor-pointer hover:border-[#E9C46A]">
          <ClipboardCheck className="w-5 h-5 text-[#8A5A00] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-[#2C2B29]">{reviewCount} {reviewCount === 1 ? 'item needs' : 'items need'} your check</div>
            <div className="text-[11px] text-[#736F6A]">Payments Tabby couldn't categorise, or emails it couldn't read. Sort them in a few taps.</div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#8A5A00]" />
        </button>
      )}

      {loading && !data && <Spinner label="Adding up your spending…" />}
      {error && <ErrorBlock message={error} onRetry={reload} />}
      {data && <Summary data={data} period={period} onBudgets={() => setBudgetsOpen(true)} />}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card>
            <SectionTitle>Where it went</SectionTitle>
            <CategoryBreakdown data={data} selected={categoryId} expanded={expanded} onExpand={setExpanded} onPick={pickCategory} />
          </Card>
          <Card>
            <SectionTitle>{data.granularity === 'day' ? 'Day by day' : 'Month by month'}</SectionTitle>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.trend.map((t) => ({ name: trendLabel(t.key, data.granularity), value: Math.max(0, t.spendPaise) / 100, key: t.key }))}
                  onClick={(e: any) => {
                    const key = e?.activePayload?.[0]?.payload?.key as string | undefined;
                    if (!key) return;
                    if (data.granularity === 'month') {
                      const [y, m] = key.split('-').map(Number);
                      setPeriod({ mode: 'month', from: `${key}-01`, to: `${key}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}`, basis: period.basis });
                    } else setPeriod({ mode: 'custom', from: key, to: key, basis: period.basis });
                  }}>
                  <CartesianGrid vertical={false} stroke="#F2EFEA" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={12} />
                  <Tooltip formatter={(v: any) => formatPaise(Math.round(Number(v) * 100))} />
                  <Bar dataKey="value" fill="#3C5A48" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-[#A39E98]">Tap a bar to see just that {data.granularity}.</p>
          </Card>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Budgets data={data} onEdit={() => setBudgetsOpen(true)} />
          <Card>
            <SectionTitle><span className="inline-flex items-center gap-1"><Store className="w-3.5 h-3.5" /> Top places</span></SectionTitle>
            {data.topMerchants.length === 0 ? <span className="text-xs text-[#736F6A]">No payments in this period.</span> : (
              <div className="flex flex-col gap-1.5">
                {data.topMerchants.map((m) => (
                  <div key={m.name} className="flex flex-col gap-0.5 text-xs">
                    <div className="flex justify-between gap-2"><span className="truncate">{m.name} <span className="text-[#A39E98]">· {m.count}×</span></span><b className="tabular-nums">{formatPaise(m.amountPaise)}</b></div>
                    <ProgressBar value={m.amountPaise} max={data.topMerchants[0].amountPaise || 1} color="#B5838D" />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <Card>
        <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => onNavigate('commitments')}>All bills & EMIs</Button>}>
          <span className="inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Bills due in 30 days</span>
        </SectionTitle>
        {upcoming.length === 0 ? <span className="text-xs text-[#736F6A]">Nothing due. EMIs, rent and subscriptions you track appear here.</span> : (
          <div className="flex flex-col divide-y divide-[#F2EFEA]">
            {upcoming.map((c) => {
              const overdue = new Date(c.schedule.nextDueDate) < new Date() && c.status !== 'paid';
              return (
                <div key={c.id} className="flex items-center gap-2 py-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{c.name}</div>
                    <div className={`text-[11px] ${overdue ? 'text-[#C86D51] font-bold' : 'text-[#736F6A]'}`}>{fmtDate(c.schedule.nextDueDate)} · {c.type}</div>
                  </div>
                  <StatusBadge status={c.status} />
                  <Money paise={c.amountPaise} currency={c.currency} />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div id="spending-payments" className="flex flex-col gap-2 scroll-mt-4">
        {categoryId && data && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#736F6A]">Showing</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EBF1ED] text-[#3C5A48] font-bold">
              {categoryId === 'none' ? 'Uncategorised' : data.byCategory.flatMap((c) => [c, ...c.children]).find((c) => c.categoryId === categoryId)?.name || 'Category'}
              <button type="button" aria-label="Show all" onClick={() => setCategoryId('')} className="cursor-pointer"><X className="w-3 h-3" /></button>
            </span>
          </div>
        )}
        <Transactions key={`${period.from}-${period.to}`} embedded from={period.from} to={period.to} initial={{ ...(initial || {}), categoryId }} onChanged={() => setVersion((v) => v + 1)} />
      </div>

      {budgetsOpen && <BudgetSheet onClose={() => setBudgetsOpen(false)} onSaved={() => { setBudgetsOpen(false); setVersion((v) => v + 1); }} />}
    </div>
  );
}

function Summary({ data, period, onBudgets }: { data: SpendingSummary; period: Period; onBudgets: () => void }) {
  const change = data.previous.spendPaise ? Math.round(((data.spendPaise - data.previous.spendPaise) / data.previous.spendPaise) * 100) : null;
  const elapsedDays = (() => {
    const today = todayKey();
    if (today < data.from) return 0;
    if (today > data.to) return data.days;
    return Math.round((Date.parse(today) - Date.parse(data.from)) / 86_400_000) + 1;
  })();
  const b = data.budget;
  const used = b ? Math.round((b.spentPaise / Math.max(1, b.budgetPaise)) * 100) : 0;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2" id="spending-summary">
      <StatTile label={`Spent · ${periodLabel(period)}`} value={formatPaise(data.spendPaise)}
        sub={change === null ? 'Nothing in the period before' : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}% vs ${formatPaise(data.previous.spendPaise)} before`}
        tone={change !== null && change > 10 ? 'bad' : undefined} />
      {b ? (
        <StatTile label="Budget left" value={formatPaise(b.budgetPaise - b.spentPaise)} tone={used >= 100 ? 'bad' : used >= 80 ? 'warn' : 'good'} onClick={onBudgets}
          sub={`${used}% of ${formatPaise(b.budgetPaise)} used`}>
          <div className="mt-1"><ProgressBar value={b.spentPaise} max={b.budgetPaise} color={used >= 80 ? '#E9A23B' : '#3C5A48'} /></div>
        </StatTile>
      ) : (
        <StatTile label="Monthly budget" value={<span className="text-sm text-[#3C5A48] inline-flex items-center gap-1"><Target className="w-4 h-4" /> Set a budget</span>} sub="Get an alert at 80% and when you go over" onClick={onBudgets} />
      )}
      <StatTile label="Money in" value={formatPaise(data.incomePaise)} tone="good" sub={data.incomePaise ? `Saved ${formatPaise(data.incomePaise - data.spendPaise)}` : 'Salary and other income'} />
      <StatTile label="Per day" value={formatPaise(Math.round(data.spendPaise / Math.max(1, elapsedDays || data.days)))} sub={`Over ${elapsedDays || data.days} day${(elapsedDays || data.days) === 1 ? '' : 's'}`} />
    </div>
  );
}

function CategoryBreakdown({ data, selected, expanded, onExpand, onPick }: {
  data: SpendingSummary; selected: string; expanded: string | null; onExpand: (id: string | null) => void; onPick: (id: string | null) => void;
}) {
  const slices = data.byCategory.filter((c) => c.amountPaise > 0);
  const total = slices.reduce((s, c) => s + c.amountPaise, 0);
  if (!slices.length) return <span className="text-xs text-[#736F6A]">No spending in this period.</span>;
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-center sm:items-start">
      <div className="w-44 h-44 shrink-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="amountPaise" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2} isAnimationActive={false}
              onClick={(d: any) => onPick(d?.payload?.categoryId ?? d?.categoryId ?? null)}>
              {slices.map((c, i) => <Cell key={i} fill={c.color} opacity={selected && selected !== (c.categoryId || 'none') ? 0.35 : 1} className="cursor-pointer" />)}
            </Pie>
            <Tooltip formatter={(v: any) => formatPaise(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] text-[#736F6A]">Spent</span>
          <span className="text-sm font-extrabold tabular-nums">{formatPaise(data.spendPaise)}</span>
        </div>
      </div>
      <div className="flex-1 w-full flex flex-col">
        {data.byCategory.map((c) => {
          const id = c.categoryId || 'none';
          const pct = total ? Math.round((Math.max(0, c.amountPaise) / total) * 100) : 0;
          const open = expanded === id;
          return (
            <div key={id} className="flex flex-col">
              <div className={`flex items-center gap-2 text-xs rounded-lg px-1.5 py-1 ${selected === id ? 'bg-[#EBF1ED]' : 'hover:bg-[#FAF8F5]'}`}>
                <button type="button" onClick={() => onPick(c.categoryId)} className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-[10px] text-[#A39E98] tabular-nums">{pct}%</span>
                  <span className="font-bold tabular-nums">{formatPaise(c.amountPaise)}</span>
                </button>
                {c.children.length > 0 && (
                  <button type="button" onClick={() => onExpand(open ? null : id)} aria-label={open ? 'Hide breakdown' : 'Show breakdown'} className="p-0.5 rounded cursor-pointer text-[#736F6A]">
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
                  </button>
                )}
              </div>
              {open && c.children.map((k) => (
                <button key={k.categoryId + k.name} type="button" onClick={() => onPick(k.categoryId)}
                  className={`ml-5 flex justify-between text-[11px] px-1.5 py-0.5 rounded-lg cursor-pointer text-left ${selected === k.categoryId ? 'bg-[#EBF1ED]' : 'hover:bg-[#FAF8F5]'}`}>
                  <span className="text-[#736F6A] truncate">{k.name}</span><span className="tabular-nums">{formatPaise(k.amountPaise)}</span>
                </button>
              ))}
            </div>
          );
        })}
        <span className="text-[10px] text-[#A39E98] mt-1 px-1.5">Tap a category to see its payments.</span>
      </div>
    </div>
  );
}

function Budgets({ data, onEdit }: { data: SpendingSummary; onEdit: () => void }) {
  const rows = data.categoryBudgets;
  return (
    <Card>
      <SectionTitle action={<Button size="sm" variant="ghost" onClick={onEdit}>{data.budget || rows.length ? 'Edit' : 'Set budgets'}</Button>}>
        <span className="inline-flex items-center gap-1"><Target className="w-3.5 h-3.5" /> Budgets</span>
      </SectionTitle>
      {!data.budget && rows.length === 0 ? (
        <span className="text-xs text-[#736F6A]">Set a monthly budget, overall or per category. Tabby alerts you at 80% and when you go over.</span>
      ) : (
        <div className="flex flex-col gap-2.5">
          {data.budget && <BudgetRow name="Everything" color="#3C5A48" spent={data.budget.spentPaise} budget={data.budget.budgetPaise} bold />}
          {rows.map((r) => <BudgetRow key={r.categoryId} name={r.name} color={r.color} spent={r.spentPaise} budget={r.budgetPaise} />)}
          {data.days > 31 && <span className="text-[10px] text-[#A39E98]">Monthly budgets are added up for the {data.days}-day period.</span>}
        </div>
      )}
    </Card>
  );
}

function BudgetRow({ name, color, spent, budget, bold }: { key?: string; name: string; color: string; spent: number; budget: number; bold?: boolean }) {
  const pct = Math.round((spent / Math.max(1, budget)) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs gap-2">
        <span className={`truncate inline-flex items-center gap-1 ${bold ? 'font-extrabold' : 'font-semibold'}`}>
          {pct >= 100 && <AlertTriangle className="w-3 h-3 text-[#C86D51]" />}{name}
        </span>
        <span className={`tabular-nums whitespace-nowrap ${pct >= 100 ? 'text-[#C86D51] font-bold' : pct >= 80 ? 'text-[#8A5A00] font-bold' : 'text-[#736F6A]'}`}>
          {formatPaise(spent)} / {formatPaise(budget)}
        </span>
      </div>
      <ProgressBar value={spent} max={budget} color={pct >= 80 ? '#E9A23B' : color} />
    </div>
  );
}

/** Overall monthly budget (saved with preferences) and one per top-level category. */
function BudgetSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { categories, refreshCategories } = useFinanceStore();
  const { prefs, save } = usePrefsStore();
  const top = categories.filter((c) => !c.parentId && c.kind === 'expense').sort((a, b) => a.sortOrder - b.sortOrder);
  const [overall, setOverall] = useState(prefs.monthlyBudgetPaise ? paiseToInput(prefs.monthlyBudgetPaise) : '');
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(top.map((c) => [c.id, c.budgetPaise ? paiseToInput(c.budgetPaise) : ''])));
  const [busy, setBusy] = useState(false);
  const parse = (v: string) => (v.trim() ? rupeesToPaise(v) : 0);
  const sumCats = top.reduce((s, c) => s + (parse(values[c.id]) || 0), 0);

  const submit = async () => {
    const o = overall.trim() ? rupeesToPaise(overall) : null;
    if (overall.trim() && !o) { toastError(new Error('Enter the monthly budget like 40000')); return; }
    for (const c of top) if (values[c.id].trim() && parse(values[c.id]) === null) { toastError(new Error(`Check the amount for ${c.name}`)); return; }
    setBusy(true);
    try {
      if ((o ?? null) !== (prefs.monthlyBudgetPaise ?? null)) await save({ monthlyBudgetPaise: o }, true);
      for (const c of top) {
        const v = parse(values[c.id]) || 0;
        if (v !== c.budgetPaise) await financeApi.updateCategory(c.id, { budgetPaise: v });
      }
      await refreshCategories();
      toastOk('Budgets saved');
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Monthly budgets" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={submit}>Save</Button></>}>
      <Field label="Everything, per month (₹)" hint="Leave empty for no overall budget">
        <TextInput inputMode="decimal" value={overall} onChange={(e) => setOverall(e.target.value)} placeholder="e.g. 40000" />
      </Field>
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-baseline">
          <span className="text-[11px] font-bold">Per category (₹ a month)</span>
          {sumCats > 0 && <span className="text-[10px] text-[#736F6A]">Categories add up to {formatPaise(sumCats)}</span>}
        </div>
        {top.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
            <span className="flex-1 truncate">{c.name}</span>
            <TextInput className="!w-28 text-right" inputMode="decimal" value={values[c.id] || ''} placeholder="—" onChange={(e) => setValues({ ...values, [c.id]: e.target.value })} />
          </label>
        ))}
      </div>
      <p className="text-[10px] text-[#A39E98]">Alerts at 80% and 100% each month. Choose app or email under Settings → Alerts & emails → Budgets.</p>
    </Sheet>
  );
}
