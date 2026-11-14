import React, { useState } from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { financeApi } from '../api';
import { Button, Card, ErrorBlock, SectionTitle, Spinner, useAsync } from '../components/ui';
import { formatPaise } from '../../../utils/currency';
import { downloadCSV } from '../../../utils/export';
import type { FinanceTab } from '../types';
import { usePrefsStore } from '../../../store/usePrefsStore';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1];

function currentYear(basis: 'fy' | 'calendar'): number {
  const d = new Date(Date.now() + 330 * 60_000);
  return basis === 'fy' && d.getUTCMonth() < 3 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
}

/** Year view: spend by month and by category, compared with earlier years. */
export default function Reports({ onNavigate }: { onNavigate: (tab: FinanceTab, params?: Record<string, string>) => void }) {
  const preferred = usePrefsStore.getState().prefs.reportBasis || 'fy';
  const [basis, setBasis] = useState<'fy' | 'calendar'>(preferred);
  const [year, setYear] = useState(currentYear(preferred));
  const { data, error, loading, reload } = useAsync(() => financeApi.yearReport(year, basis), [year, basis]);
  const maxYear = currentYear(basis);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex items-center gap-1 bg-white border border-[#E6E1DA] rounded-xl p-0.5">
          <button type="button" className="p-1.5 rounded-lg hover:bg-[#F2EFEA] cursor-pointer" onClick={() => setYear(year - 1)} aria-label="Previous year"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-xs font-bold min-w-24 text-center">{data?.label ? (basis === 'fy' ? `FY ${data.label}` : data.label) : year}</span>
          <button type="button" className="p-1.5 rounded-lg hover:bg-[#F2EFEA] cursor-pointer disabled:opacity-30" disabled={year >= maxYear} onClick={() => setYear(year + 1)} aria-label="Next year"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="inline-flex rounded-xl border border-[#E6E1DA] p-0.5 bg-[#FAF8F5]">
          {(['fy', 'calendar'] as const).map((b) => (
            <button key={b} type="button" onClick={() => { setBasis(b); setYear(currentYear(b)); }}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg cursor-pointer ${basis === b ? 'bg-white shadow-xs text-[#3C5A48]' : 'text-[#736F6A]'}`}>
              {b === 'fy' ? 'Apr–Mar' : 'Jan–Dec'}
            </button>
          ))}
        </div>
      </div>

      {loading && !data && <Spinner label="Adding up the year…" />}
      {error && <ErrorBlock message={error} onRetry={reload} />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card><div className="text-[10px] font-bold text-[#736F6A] uppercase">Spent</div><div className="text-xl font-extrabold tabular-nums">{formatPaise(data.totalSpendPaise)}</div><div className="text-[11px] text-[#736F6A]">≈ {formatPaise(Math.round(data.totalSpendPaise / Math.max(1, data.months.filter((m) => m.spendPaise).length || 1)))} a month</div></Card>
            <Card><div className="text-[10px] font-bold text-[#736F6A] uppercase">Income</div><div className="text-xl font-extrabold tabular-nums text-[#2D6A4F]">{formatPaise(data.totalIncomePaise)}</div><div className="text-[11px] text-[#736F6A]">Saved {formatPaise(data.totalIncomePaise - data.totalSpendPaise)}</div></Card>
          </div>

          <Card>
            <SectionTitle>Month by month</SectionTitle>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.months.map((m) => ({ name: monthName(m.key), spend: m.spendPaise / 100, key: m.key }))} onClick={(e: any) => e?.activePayload?.[0] && onNavigate('transactions', { month: e.activePayload[0].payload.key })}>
                  <CartesianGrid vertical={false} stroke="#F2EFEA" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => formatPaise(Math.round(Number(v) * 100))} />
                  <Bar dataKey="spend" fill="#3C5A48" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-[#A39E98]">Tap a month to open its transactions.</p>
          </Card>

          <Card>
            <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => downloadCSV(`tabby_${basis}_${data.label}.csv`, [
              ['Category', ...data.months.map((m) => `${monthName(m.key)} ${m.key.slice(0, 4)}`), 'Total'],
              ...data.categories.map((c) => [c.name, ...data.months.map((m) => ((c.perMonth[m.key] || 0) / 100).toFixed(2)), (c.total / 100).toFixed(2)]),
              ['Total', ...data.months.map((m) => (m.spendPaise / 100).toFixed(2)), (data.totalSpendPaise / 100).toFixed(2)],
            ])}><Download className="w-3.5 h-3.5" /> CSV</Button>}>By category</SectionTitle>
            {data.categories.length === 0 ? <span className="text-xs text-[#736F6A]">No spending in this year.</span> : (
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="text-[11px] min-w-[760px] w-full">
                  <thead>
                    <tr className="text-[#736F6A]">
                      <th className="text-left font-bold py-1 pr-2 sticky left-0 bg-white">Category</th>
                      {data.months.map((m) => <th key={m.key} className="text-right font-bold py-1 px-1">{monthName(m.key)}</th>)}
                      <th className="text-right font-bold py-1 pl-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.categories.map((c) => (
                      <tr key={c.name} className="border-t border-[#F2EFEA]">
                        <td className="py-1.5 pr-2 sticky left-0 bg-white"><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: c.color }} />{c.name}</span></td>
                        {data.months.map((m) => <td key={m.key} className="text-right tabular-nums py-1.5 px-1">{c.perMonth[m.key] ? Math.round(c.perMonth[m.key] / 100).toLocaleString('en-IN') : '·'}</td>)}
                        <td className="text-right tabular-nums py-1.5 pl-2 font-bold">{formatPaise(c.total)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-[#E6E1DA] font-extrabold">
                      <td className="py-1.5 sticky left-0 bg-white">Total</td>
                      {data.months.map((m) => <td key={m.key} className="text-right tabular-nums py-1.5 px-1">{m.spendPaise ? Math.round(m.spendPaise / 100).toLocaleString('en-IN') : '·'}</td>)}
                      <td className="text-right tabular-nums py-1.5 pl-2">{formatPaise(data.totalSpendPaise)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[10px] text-[#A39E98] mt-1">Monthly figures in ₹ (rounded). Splits, refunds and shared "my share" are applied as on the overview.</p>
          </Card>

          <Card>
            <SectionTitle>Compared with earlier years</SectionTitle>
            <div className="flex flex-col gap-1.5">
              {data.years.map((y) => {
                const max = Math.max(...data.years.map((x) => x.spendPaise), 1);
                return (
                  <div key={y.label} className="text-xs">
                    <div className="flex justify-between"><span className={y.label === data.label ? 'font-bold' : ''}>{basis === 'fy' ? `FY ${y.label}` : y.label}</span><span className="tabular-nums">{formatPaise(y.spendPaise)} spent · {formatPaise(y.incomePaise)} in</span></div>
                    <div className="h-2 rounded-full bg-[#F2EFEA] overflow-hidden"><div className="h-full rounded-full bg-[#3C5A48]" style={{ width: `${Math.round((y.spendPaise / max) * 100)}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
