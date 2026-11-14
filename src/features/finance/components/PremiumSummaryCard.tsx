import React, { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { financeApi } from '../api';
import { Card, SectionTitle, Spinner, useAsync } from './ui';
import { formatPaise } from '../../../utils/currency';
import { downloadCSV } from '../../../utils/export';
import { usePrefsStore } from '../../../store/usePrefsStore';

const TYPE_LABEL: Record<string, string> = {
  health: 'Health', term_life: 'Term life', life: 'Life', vehicle: 'Vehicle', home: 'Home', travel: 'Travel', personal_accident: 'Personal accident', other: 'Other',
};

/**
 * Premiums paid: pick a year (financial or calendar) to see totals by type
 * and by person, plus a policy × year table to compare years.
 */
export default function PremiumSummaryCard({ refreshKey }: { refreshKey: number }) {
  const [basis, setBasis] = useState<'fy' | 'calendar'>(usePrefsStore.getState().prefs.reportBasis || 'fy');
  const { data, loading } = useAsync(() => financeApi.premiumSummary(basis, 4), [basis, refreshKey]);
  const [year, setYear] = useState<string | null>(null);
  if (loading && !data) return <Card><Spinner /></Card>;
  if (!data || data.rows.length === 0) return null;
  const latestWithData = [...data.years].reverse().find((y) => data.totalsByYear[y] > 0);
  const selected = year && data.years.includes(year) ? year : latestWithData || data.years[data.years.length - 1];
  const people = Object.entries(data.byPerson).filter(([, v]) => v[selected]).sort((a, b) => b[1][selected] - a[1][selected]);
  const types = Object.entries(data.byType).filter(([, v]) => v[selected]).sort((a, b) => b[1][selected] - a[1][selected]);

  return (
    <Card className="flex flex-col gap-3">
      <SectionTitle action={
        <div className="inline-flex rounded-xl border border-[#E6E1DA] p-0.5 bg-[#FAF8F5]">
          {(['fy', 'calendar'] as const).map((b) => (
            <button key={b} type="button" onClick={() => { setBasis(b); setYear(null); }}
              className={`px-2 py-0.5 text-[10px] font-bold rounded-lg cursor-pointer ${basis === b ? 'bg-white shadow-xs text-[#3C5A48]' : 'text-[#736F6A]'}`}>
              {b === 'fy' ? 'Financial year' : 'Calendar year'}
            </button>
          ))}
        </div>
      }><span className="inline-flex items-center gap-1"><BarChart3 className="w-3.5 h-3.5" /> Premiums paid</span></SectionTitle>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {data.years.map((y) => (
          <button key={y} type="button" onClick={() => setYear(y)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer whitespace-nowrap ${y === selected ? 'bg-[#3C5A48] text-white border-[#3C5A48]' : 'bg-white border-[#E6E1DA] text-[#736F6A]'}`}>
            {basis === 'fy' ? `FY ${y}` : y} · {formatPaise(data.totalsByYear[y])}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-[10px] font-bold text-[#736F6A] uppercase mb-1">By type</div>
          {types.length === 0 && <span className="text-[#A39E98]">No premiums recorded for this year.</span>}
          {types.map(([t, v]) => <div key={t} className="flex justify-between py-0.5"><span>{TYPE_LABEL[t] || t}</span><b className="tabular-nums">{formatPaise(v[selected])}</b></div>)}
        </div>
        <div>
          <div className="text-[10px] font-bold text-[#736F6A] uppercase mb-1">By person covered</div>
          {people.length === 0 && <span className="text-[#A39E98]">—</span>}
          {people.map(([p, v]) => <div key={p} className="flex justify-between py-0.5"><span>{p}</span><b className="tabular-nums">{formatPaise(v[selected])}</b></div>)}
          {people.length > 0 && <div className="text-[10px] text-[#A39E98] mt-1">Family policies are divided equally between the people they cover.</div>}
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-[11px] min-w-[480px]">
          <thead>
            <tr className="text-[#736F6A] text-left">
              <th className="font-bold py-1 pr-2">Policy</th>
              {data.years.map((y) => <th key={y} className={`font-bold py-1 px-1 text-right ${y === selected ? 'text-[#3C5A48]' : ''}`}>{basis === 'fy' ? y : y}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.policyId} className="border-t border-[#F2EFEA]">
                <td className="py-1.5 pr-2">
                  <div className="font-semibold truncate max-w-44">{r.insurer}</div>
                  <div className="text-[10px] text-[#736F6A] truncate max-w-44">{TYPE_LABEL[r.type]}{r.vehicleNumber ? ` · ${r.vehicleNumber}` : ''}{r.members.length ? ` · ${r.members.map((m) => m.name).join(', ')}` : ''}</div>
                </td>
                {data.years.map((y) => <td key={y} className={`py-1.5 px-1 text-right tabular-nums ${y === selected ? 'font-bold' : ''}`}>{r.byYear[y] ? formatPaise(r.byYear[y]) : '—'}</td>)}
              </tr>
            ))}
            <tr className="border-t-2 border-[#E6E1DA] font-extrabold">
              <td className="py-1.5">Total</td>
              {data.years.map((y) => <td key={y} className="py-1.5 px-1 text-right tabular-nums">{formatPaise(data.totalsByYear[y])}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex justify-between items-center text-[10px] text-[#A39E98]">
        <span>From payments linked to each policy. Add older ones with "Record payment" on the policy.</span>
        <button type="button" className="font-bold text-[#3C5A48] cursor-pointer" onClick={() => downloadCSV(`tabby_premiums_${basis}.csv`, [
          ['Policy', 'Type', 'Vehicle', 'Covered', ...data.years],
          ...data.rows.map((r) => [r.insurer, TYPE_LABEL[r.type], r.vehicleNumber, r.members.map((m) => `${m.name} (${m.relation})`).join('; '), ...data.years.map((y) => (r.byYear[y] / 100).toFixed(2))]),
          ['Total', '', '', '', ...data.years.map((y) => (data.totalsByYear[y] / 100).toFixed(2))],
        ])}>CSV</button>
      </div>
    </Card>
  );
}
