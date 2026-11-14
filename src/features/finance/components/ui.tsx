import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { useToastStore } from '../../../store/useToastStore';
import { formatPaise } from '../../../utils/currency';
import type { Account, Category } from '../types';

// ---------------------------------------------------------------- data loading

/** Runs an async loader, re-running when deps change; exposes reload(). */
export function useAsync<T>(loader: () => Promise<T>, deps: React.DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const run = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await loader();
      if (mine === seq.current) setData(result);
    } catch (e: any) {
      if (mine === seq.current) setError(e?.message || 'Something went wrong');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void run();
  }, [run]);
  return { data, error, loading, reload: run, setData };
}

export function toastError(e: unknown, fallback = 'Something went wrong') {
  const err = e as any;
  const details = err?.details ? Object.entries(err.details).map(([k, v]) => `${k}: ${v}`).join('; ') : '';
  useToastStore.getState().addToast(`${err?.message || fallback}${details ? ` (${details})` : ''}`, 'error');
}

export function toastOk(msg: string) {
  useToastStore.getState().addToast(msg, 'success');
}

// ---------------------------------------------------------------- layout

export function Card({ children, className = '', onClick }: { key?: string | number; children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white border border-[#E6E1DA] rounded-2xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ${onClick ? 'cursor-pointer hover:border-[#3C5A48]/40 transition-colors' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <h3 className="text-[11px] font-bold text-[#736F6A] uppercase tracking-wider">{children}</h3>
      {action}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-xs text-[#736F6A]">
      <Loader2 className="w-4 h-4 animate-spin text-[#3C5A48]" />
      {label || 'Loading…'}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="p-4 rounded-2xl bg-[#FDF3F0] border border-[#C86D51]/30 text-xs text-[#A64B32] flex items-center justify-between gap-3">
      <span>{message}</span>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-10 px-6 border border-dashed border-[#E6E1DA] rounded-2xl bg-[#FAF8F5]">
      <span className="text-sm font-bold text-[#2C2B29]">{title}</span>
      {text && <span className="text-xs text-[#736F6A] max-w-sm">{text}</span>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({
  children, onClick, variant = 'primary', size = 'md', disabled, type = 'button', className = '', busy,
}: {
  children: React.ReactNode; onClick?: () => void; variant?: BtnVariant; size?: 'sm' | 'md'; disabled?: boolean;
  type?: 'button' | 'submit'; className?: string; busy?: boolean;
}) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-[#3C5A48] hover:bg-[#2E4738] text-white border border-[#3C5A48]',
    secondary: 'bg-white hover:bg-[#FAF8F5] text-[#2C2B29] border border-[#E6E1DA]',
    ghost: 'bg-transparent hover:bg-[#EBF1ED] text-[#3C5A48] border border-transparent',
    danger: 'bg-white hover:bg-[#C86D51] hover:text-white text-[#C86D51] border border-[#C86D51]/50',
  };
  const sizes = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-4 py-2 text-xs';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={`${styles[variant]} ${sizes} rounded-xl font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 ${className}`}
    >
      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'green' | 'red' | 'amber' | 'blue' }) {
  const tones = {
    neutral: 'bg-[#F2EFEA] text-[#736F6A]',
    green: 'bg-[#EBF1ED] text-[#3C5A48]',
    red: 'bg-[#FDF3F0] text-[#A64B32]',
    amber: 'bg-[#FFF8E6] text-[#8A5A00]',
    blue: 'bg-[#EAF2F8] text-[#22577A]',
  };
  return <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Sheet({ title, onClose, children, footer, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#2C2B29]/40 backdrop-blur-xs animate-fadeIn" onClick={onClose}>
      <div
        className={`bg-white border border-[#E6E1DA] rounded-t-3xl sm:rounded-3xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} shadow-xl flex flex-col max-h-[92vh] animate-sheet-up sm:animate-none`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="sm:hidden pt-3 pb-1 flex justify-center"><div className="w-10 h-1 rounded-full bg-[#E6E1DA]" /></div>
        <div className="px-4 sm:px-5 py-3 border-b border-[#E6E1DA] flex items-center justify-between gap-3">
          <div className="text-sm font-extrabold text-[#2C2B29] min-w-0 truncate">{title}</div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-[#736F6A] hover:bg-[#F2EFEA] cursor-pointer" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 flex flex-col gap-4">{children}</div>
        {footer && <div className="px-4 sm:px-5 py-3 border-t border-[#E6E1DA] flex items-center justify-end gap-2 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)]">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- form fields

const inputCls = 'w-full px-3 py-2 border border-[#E6E1DA] rounded-xl text-xs text-[#2C2B29] bg-white focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] placeholder-[#A39E98]';

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[11px] font-bold text-[#2C2B29]">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-[#A39E98]">{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className || ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} min-h-24 ${props.className || ''}`} />;
}

export function Select({ value, onChange, children, className = '' }: { value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} cursor-pointer ${className}`}>
      {children}
    </select>
  );
}

export function CategorySelect({ categories, value, onChange, allowNone = true, noneLabel = 'Uncategorised', kinds }: {
  categories: Category[]; value: string | null; onChange: (id: string | null) => void; allowNone?: boolean; noneLabel?: string;
  kinds?: Category['kind'][];
}) {
  const top = categories.filter((c) => !c.parentId && (!kinds || kinds.includes(c.kind))).sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <Select value={value || ''} onChange={(v) => onChange(v || null)}>
      {allowNone && <option value="">{noneLabel}</option>}
      {top.map((p) => {
        const kids = categories.filter((c) => c.parentId === p.id).sort((a, b) => a.sortOrder - b.sortOrder);
        return kids.length ? (
          <optgroup key={p.id} label={p.name}>
            <option value={p.id}>{p.name} (general)</option>
            {kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </optgroup>
        ) : <option key={p.id} value={p.id}>{p.name}</option>;
      })}
    </Select>
  );
}

export function AccountSelect({ accounts, value, onChange, noneLabel = 'Unknown account' }: { accounts: Account[]; value: string | null; onChange: (id: string | null) => void; noneLabel?: string }) {
  return (
    <Select value={value || ''} onChange={(v) => onChange(v || null)}>
      <option value="">{noneLabel}</option>
      {accounts.filter((a) => a.isActive).map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
    </Select>
  );
}

export function accountLabel(a: Account | undefined | null): string {
  if (!a) return 'Unknown account';
  return `${a.name}${a.last4 ? ` ••${a.last4}` : ''}`;
}

// ---------------------------------------------------------------- money & dates

export function Money({ paise, currency = 'INR', direction, className = '', strike }: { paise: number; currency?: string; direction?: 'debit' | 'credit'; className?: string; strike?: boolean }) {
  const sign = direction === 'credit' ? '+ ' : '';
  const color = direction === 'credit' ? 'text-[#2D6A4F]' : 'text-[#2C2B29]';
  return <span className={`font-bold tabular-nums ${color} ${strike ? 'line-through opacity-50' : ''} ${className}`}>{sign}{formatPaise(paise, currency)}</span>;
}

export const fmtDate = (d: string | Date | undefined | null, withTime = false) => {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
};

/** India-time "YYYY-MM" of now. */
export function currentMonth(): string {
  const d = new Date(Date.now() + 330 * 60_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(m: string, delta: number): string {
  const [y, mm] = m.split('-').map(Number);
  const idx = y * 12 + mm - 1 + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export function monthLabel(m: string): string {
  const [y, mm] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mm - 1, 15)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** YYYY-MM-DD in India time, for <input type="date">. */
export function toDateInput(d: string | Date | undefined | null): string {
  if (!d) return '';
  const t = new Date(new Date(d).getTime() + 330 * 60_000);
  return t.toISOString().slice(0, 10);
}

export function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const isCurrent = month >= currentMonth();
  return (
    <div className="inline-flex items-center gap-1 bg-white border border-[#E6E1DA] rounded-xl p-0.5">
      <button type="button" className="p-1.5 rounded-lg hover:bg-[#F2EFEA] cursor-pointer" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
      <span className="text-xs font-bold min-w-28 text-center">{monthLabel(month)}</span>
      <button type="button" className="p-1.5 rounded-lg hover:bg-[#F2EFEA] cursor-pointer disabled:opacity-30" disabled={isCurrent} onClick={() => onChange(shiftMonth(month, 1))} aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
    </div>
  );
}

export function ProgressBar({ value, max, color = '#3C5A48' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const over = value > max;
  return (
    <div className="h-2 rounded-full bg-[#F2EFEA] overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: over ? '#C86D51' : color }} />
    </div>
  );
}

export const KIND_LABELS: Record<string, string> = {
  expense: 'Expense', income: 'Income', refund: 'Refund', self_transfer: 'Self transfer', cc_bill_payment: 'Card bill payment',
  reversal: 'Reversal', fee: 'Fee', investment: 'Investment', emi: 'EMI',
};
