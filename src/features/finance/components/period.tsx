import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TextInput } from './ui';

/** A spending period: India dates, both inclusive. */
export type PeriodMode = 'month' | 'quarter' | 'year' | 'custom';
export interface Period {
  mode: PeriodMode;
  from: string;
  to: string;
  /** Year basis for 'year' and 'quarter'. */
  basis: 'fy' | 'calendar';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Today in India as [year, month0, day]. */
export function istToday(): [number, number, number] {
  const d = new Date(Date.now() + 330 * 60_000);
  return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
}

export function todayKey(): string {
  const [y, m, d] = istToday();
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function lastDay(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

/** [from, to] for a run of months starting at (y, m0). */
function monthsRange(y: number, m0: number, count: number): [string, string] {
  const endIdx = y * 12 + m0 + count - 1;
  const ey = Math.floor(endIdx / 12);
  const em = endIdx % 12;
  return [`${y}-${pad(m0 + 1)}-01`, `${ey}-${pad(em + 1)}-${pad(lastDay(ey, em))}`];
}

/** Period of the given mode containing today. */
export function currentPeriod(mode: PeriodMode, basis: 'fy' | 'calendar' = 'fy'): Period {
  const [y, m] = istToday();
  if (mode === 'month') {
    const [from, to] = monthsRange(y, m, 1);
    return { mode, from, to, basis };
  }
  if (mode === 'quarter') {
    // FY quarters start in Apr/Jul/Oct/Jan; calendar quarters in Jan/Apr/Jul/Oct - the same months.
    const q0 = Math.floor(m / 3) * 3;
    const [from, to] = monthsRange(y, q0, 3);
    return { mode, from, to, basis };
  }
  if (mode === 'year') {
    const start = basis === 'fy' ? (m < 3 ? y - 1 : y) : y;
    const [from, to] = monthsRange(start, basis === 'fy' ? 3 : 0, 12);
    return { mode, from, to, basis };
  }
  const [from] = monthsRange(y, m, 1);
  return { mode, from, to: todayKey(), basis };
}

/** Moves a month/quarter/year period back (-1) or forward (+1). */
export function shiftPeriod(p: Period, delta: number): Period {
  if (p.mode === 'custom') return p;
  const [y, m] = p.from.split('-').map(Number);
  const count = p.mode === 'month' ? 1 : p.mode === 'quarter' ? 3 : 12;
  const idx = y * 12 + (m - 1) + delta * count;
  const [from, to] = monthsRange(Math.floor(idx / 12), idx % 12, count);
  return { ...p, from, to };
}

export function periodLabel(p: Period): string {
  const [y, m] = p.from.split('-').map(Number);
  if (p.mode === 'month') return `${MONTHS[m - 1]} ${y}`;
  if (p.mode === 'quarter') {
    const [ty, tm] = p.to.split('-').map(Number);
    const fyQ = Math.floor(((m - 1 + 9) % 12) / 3) + 1;
    return p.basis === 'fy'
      ? `Q${fyQ} FY ${m >= 4 ? y : y - 1}-${String((m >= 4 ? y + 1 : y) % 100).padStart(2, '0')} (${MONTHS[m - 1]}–${MONTHS[tm - 1]})`
      : `Q${Math.floor((m - 1) / 3) + 1} ${ty} (${MONTHS[m - 1]}–${MONTHS[tm - 1]})`;
  }
  if (p.mode === 'year') return p.basis === 'fy' ? `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}` : String(y);
  const fmt = (k: string) => {
    const [yy, mm, dd] = k.split('-').map(Number);
    return `${dd} ${MONTHS[mm - 1]} ${yy}`;
  };
  return `${fmt(p.from)} – ${fmt(p.to)}`;
}

/** Short name for "this period" in sentences: "this month", "last quarter"… */
export function periodNoun(mode: PeriodMode): string {
  return mode === 'custom' ? 'period' : mode;
}

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const [customFrom, setCustomFrom] = useState(value.mode === 'custom' ? value.from : '');
  const [customTo, setCustomTo] = useState(value.mode === 'custom' ? value.to : '');
  const atLatest = value.mode !== 'custom' && value.to >= todayKey();
  return (
    <div className="flex flex-col gap-2" id="period-picker">
      <div className="inline-flex rounded-xl border border-[#E6E1DA] p-0.5 bg-[#FAF8F5] self-start overflow-x-auto max-w-full no-scrollbar">
        {([['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year'], ['custom', 'Custom']] as [PeriodMode, string][]).map(([m, label]) => (
          <button key={m} type="button" onClick={() => {
            if (m === 'custom') {
              const base = value.mode === 'custom' ? value : { ...value, mode: 'custom' as const };
              setCustomFrom(base.from);
              setCustomTo(base.to > todayKey() ? todayKey() : base.to);
              onChange({ ...base, to: base.to > todayKey() ? todayKey() : base.to });
            } else onChange(currentPeriod(m, value.basis));
          }}
            className={`px-3 py-1 text-[11px] font-bold rounded-lg cursor-pointer whitespace-nowrap ${value.mode === m ? 'bg-white shadow-xs text-[#3C5A48]' : 'text-[#736F6A]'}`}>
            {label}
          </button>
        ))}
      </div>
      {value.mode === 'custom' ? (
        <div className="flex items-center gap-2 flex-wrap">
          <TextInput type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} className="!w-auto" aria-label="From" />
          <span className="text-xs text-[#736F6A]">to</span>
          <TextInput type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} className="!w-auto" aria-label="To" />
          <button type="button" disabled={!customFrom || !customTo || customTo < customFrom}
            onClick={() => onChange({ ...value, from: customFrom, to: customTo })}
            className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-[#3C5A48] text-white cursor-pointer disabled:opacity-40">Show</button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1 bg-white border border-[#E6E1DA] rounded-xl p-0.5">
            <button type="button" className="p-1.5 rounded-lg hover:bg-[#F2EFEA] cursor-pointer" onClick={() => onChange(shiftPeriod(value, -1))} aria-label="Previous"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs font-bold min-w-28 text-center px-1">{periodLabel(value)}</span>
            <button type="button" className="p-1.5 rounded-lg hover:bg-[#F2EFEA] cursor-pointer disabled:opacity-30" disabled={atLatest} onClick={() => onChange(shiftPeriod(value, 1))} aria-label="Next"><ChevronRight className="w-4 h-4" /></button>
          </div>
          {(value.mode === 'year' || value.mode === 'quarter') && (
            <div className="inline-flex rounded-xl border border-[#E6E1DA] p-0.5 bg-[#FAF8F5]">
              {(['fy', 'calendar'] as const).map((b) => (
                <button key={b} type="button" onClick={() => onChange(currentPeriod(value.mode, b))}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-lg cursor-pointer ${value.basis === b ? 'bg-white shadow-xs text-[#3C5A48]' : 'text-[#736F6A]'}`}>
                  {b === 'fy' ? 'Apr–Mar' : 'Jan–Dec'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Big number tile used at the top of each Money page. */
export function StatTile({ label, value, sub, tone, onClick, children }: {
  key?: string; label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'good' | 'bad' | 'warn'; onClick?: () => void; children?: React.ReactNode;
}) {
  const color = tone === 'good' ? 'text-[#2D6A4F]' : tone === 'bad' ? 'text-[#C86D51]' : tone === 'warn' ? 'text-[#8A5A00]' : 'text-[#2C2B29]';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={`text-left bg-white border border-[#E6E1DA] rounded-2xl p-3 flex flex-col gap-0.5 min-w-0 ${onClick ? 'cursor-pointer hover:border-[#3C5A48]/40' : ''}`}>
      <span className="text-[10px] font-bold text-[#736F6A] uppercase tracking-wider truncate">{label}</span>
      <span className={`text-lg font-extrabold tabular-nums leading-tight truncate ${color}`}>{value}</span>
      {sub && <span className="text-[11px] text-[#736F6A] leading-snug">{sub}</span>}
      {children}
    </Tag>
  );
}
