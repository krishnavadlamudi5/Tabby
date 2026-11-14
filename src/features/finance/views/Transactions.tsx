import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, ArrowLeftRight, Ban, Clock, Split, Users, Plane } from 'lucide-react';
import { financeApi } from '../api';
import { useFinanceStore, categoryLabel, categoryColor } from '../store';
import {
  AccountSelect, Badge, Button, Card, CategorySelect, Empty, ErrorBlock, Field, KIND_LABELS, Money, MonthSwitcher, Select, Sheet, Spinner,
  TextInput, accountLabel, currentMonth, fmtDate, toastError, toastOk,
} from '../components/ui';
import { formatPaise, rupeesToPaise } from '../../../utils/currency';
import TransactionDetail from './TransactionDetail';
import type { Account, Category, Transaction } from '../types';

export default function Transactions({ initial }: { key?: string; initial?: Record<string, string> }) {
  const { accounts, categories } = useFinanceStore();
  const [month, setMonth] = useState(initial?.month || currentMonth());
  const [accountId, setAccountId] = useState(initial?.accountId || '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId || '');
  const [kind, setKind] = useState(initial?.kind || '');
  const [status, setStatus] = useState(initial?.status || '');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [totals, setTotals] = useState<{ count: number; debitPaise: number; creditPaise: number; spendPaise: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(initial?.open || null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const filters = { month, accountId, categoryId, kind, status, q: query, includeExcluded };
  const load = async (more = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await financeApi.transactions({ ...filters, cursor: more ? cursor || undefined : undefined });
      setRows((prev) => (more ? [...prev, ...res.transactions] : res.transactions));
      setCursor(res.nextCursor);
      setTotals(res.totals);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(false); }, [month, accountId, categoryId, kind, status, query, includeExcluded]);

  const byDay = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const t of rows) {
      const key = fmtDate(t.postedAt);
      groups.set(key, [...(groups.get(key) || []), t]);
    }
    return Array.from(groups.entries());
  }, [rows]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <MonthSwitcher month={month} onChange={setMonth} />
        <Button size="sm" onClick={() => setAdding(true)}><Plus className="w-3.5 h-3.5" /> Add</Button>
      </div>

      <Card className="flex flex-col gap-2 !p-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#A39E98]" />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchant, notes, reference…" className="pl-8" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <AccountSelect accounts={accounts} value={accountId || null} onChange={(v) => setAccountId(v || '')} noneLabel="All accounts" />
          <CategorySelect categories={categories} value={categoryId || null} onChange={(v) => setCategoryId(v || '')} noneLabel="All categories" />
          <Select value={kind} onChange={setKind}>
            <option value="">All kinds</option>
            {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select value={status} onChange={setStatus}>
            <option value="">Any status</option>
            <option value="settled">Settled</option>
            <option value="pending">Pending</option>
            <option value="declined">Declined</option>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-[#736F6A] cursor-pointer select-none">
          <input type="checkbox" checked={includeExcluded} onChange={(e) => setIncludeExcluded(e.target.checked)} />
          Show self transfers, card bill payments and declined
        </label>
        {categoryId === 'none' && <span className="text-[11px] text-[#736F6A]">Showing uncategorised only.</span>}
      </Card>

      {totals && (
        <div className="grid grid-cols-3 gap-2">
          <Card className="!p-3"><div className="text-[10px] text-[#736F6A] font-bold uppercase">Spend</div><div className="text-sm font-extrabold tabular-nums">{formatPaise(totals.spendPaise)}</div></Card>
          <Card className="!p-3"><div className="text-[10px] text-[#736F6A] font-bold uppercase">Money out</div><div className="text-sm font-extrabold tabular-nums">{formatPaise(totals.debitPaise)}</div></Card>
          <Card className="!p-3"><div className="text-[10px] text-[#736F6A] font-bold uppercase">Money in</div><div className="text-sm font-extrabold tabular-nums text-[#2D6A4F]">{formatPaise(totals.creditPaise)}</div></Card>
        </div>
      )}

      {error && <ErrorBlock message={error} onRetry={() => load(false)} />}
      {!error && !loading && rows.length === 0 && (
        <Empty title="No transactions" text="Bank emails pushed from Gmail, statements you upload and manual entries appear here." />
      )}

      {byDay.map(([day, list]) => (
        <div key={day} className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-[#736F6A] px-1">{day}</span>
          <Card className="!p-0 divide-y divide-[#F2EFEA] overflow-hidden">
            {list.map((t) => <TxnRow key={t.id} t={t} accounts={accounts} categories={categories} onOpen={() => setOpenId(t.id)} />)}
          </Card>
        </div>
      ))}

      {loading && <Spinner />}
      {!loading && cursor && <Button variant="secondary" onClick={() => load(true)}>Load more</Button>}

      {openId && <TransactionDetail id={openId} onClose={() => setOpenId(null)} onChanged={() => load(false)} />}
      {adding && <AddTransaction onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void load(false); }} />}
    </div>
  );



function AddTransaction({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { accounts, categories } = useFinanceStore();
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'debit' | 'credit'>('debit');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [channel, setChannel] = useState('cash');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const paise = rupeesToPaise(amount);
    if (!paise) { toastError(new Error('Enter an amount like 450 or 1,320.50')); return; }
    setBusy(true);
    try {
      await financeApi.createTransaction({
        amountPaise: paise, direction, merchant, postedAt: `${date}T12:00:00+05:30`, accountId, channel, notes,
        ...(categoryId ? { categoryId } : {}),
      });
      toastOk('Transaction added');
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Add a transaction" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)"><TextInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="450" autoFocus /></Field>
        <Field label="Type">
          <Select value={direction} onChange={(v) => setDirection(v as any)}>
            <option value="debit">Money out</option>
            <option value="credit">Money in</option>
          </Select>
        </Field>
      </div>
      <Field label="Merchant / description"><TextInput value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. Vegetable vendor" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Paid via">
          <Select value={channel} onChange={setChannel}>
            {['cash', 'upi', 'card', 'netbanking', 'imps', 'neft', 'autodebit', 'other'].map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Account"><AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} noneLabel="Cash / not on an account" /></Field>
      <Field label="Category" hint="Leave as Auto to use your rules"><CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} noneLabel="Auto" /></Field>
      <Field label="Notes"><TextInput value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </Sheet>
  );
}

function TxnRow({ t, onOpen, accounts, categories }: { key?: string; t: Transaction; onOpen: () => void; accounts: Account[]; categories: Category[] }) {
    const acc = accounts.find((a) => a.id === t.accountId);
    const muted = t.status === 'declined' || t.kind === 'self_transfer' || t.kind === 'cc_bill_payment';
    return (
      <button type="button" onClick={onOpen} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[#FAF8F5] cursor-pointer">
        <span className="w-2 h-8 rounded-full shrink-0" style={{ background: t.splits.length ? 'linear-gradient(#5B8C5A,#E9C46A,#C86D51)' : categoryColor(categories, t.categoryId) }} />
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-semibold truncate ${muted ? 'text-[#736F6A]' : ''}`}>{t.merchant || t.description || KIND_LABELS[t.kind]}</div>
          <div className="text-[11px] text-[#736F6A] truncate flex items-center gap-1.5 flex-wrap">
            <span>{t.splits.length ? `Split · ${t.splits.length} categories` : categoryLabel(categories, t.categoryId)}</span>
            <span>· {acc ? accountLabel(acc) : 'No account'}</span>
          </div>
          <div className="flex gap-1 mt-0.5 flex-wrap">
            {t.status === 'declined' && <Badge tone="red"><Ban className="w-2.5 h-2.5" />Declined</Badge>}
            {t.status === 'pending' && <Badge tone="amber"><Clock className="w-2.5 h-2.5" />Pending</Badge>}
            {t.kind === 'self_transfer' && <Badge><ArrowLeftRight className="w-2.5 h-2.5" />Self transfer</Badge>}
            {t.kind === 'cc_bill_payment' && <Badge>Card bill</Badge>}
            {t.kind === 'refund' && <Badge tone="green">Refund</Badge>}
            {t.splits.length > 0 && <Badge tone="blue"><Split className="w-2.5 h-2.5" />Split</Badge>}
            {t.sharedExpenseId && <Badge tone="blue"><Users className="w-2.5 h-2.5" />Shared</Badge>}
            {t.tripId && <Badge tone="blue"><Plane className="w-2.5 h-2.5" />Trip</Badge>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <Money paise={t.amountPaise} currency={t.currency} direction={t.direction} strike={t.status === 'declined'} className="text-xs" />
          {t.mySharePaise !== null && t.mySharePaise !== undefined && <div className="text-[10px] text-[#736F6A]">my share {formatPaise(t.mySharePaise)}</div>}
        </div>
      </button>
    );
  }
}
