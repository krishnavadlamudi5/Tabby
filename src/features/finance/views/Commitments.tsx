import React, { useState } from 'react';
import { Pencil, Plus, Repeat, Sparkles } from 'lucide-react';
import { financeApi } from '../api';
import { useFinanceStore } from '../store';
import { AccountSelect, Button, Card, Empty, ErrorBlock, Field, Money, SectionTitle, Select, Sheet, Spinner, TextInput, fmtDate, toDateInput, toastError, toastOk, useAsync } from '../components/ui';
import { StatusBadge } from './FinanceHome';
import { formatPaise, paiseToInput, rupeesToPaise } from '../../../utils/currency';
import type { Commitment } from '../types';

const TYPE_LABEL: Record<Commitment['type'], string> = { emi: 'EMI', sip: 'SIP', subscription: 'Subscription', premium: 'Premium', rent: 'Rent', other: 'Other' };

/** Bills & EMIs: rent, loans, subscriptions. SIPs live on the Investments page, premiums on Insurance. */
export default function Commitments({ exclude = ['sip'] }: { exclude?: Commitment['type'][] }) {
  const { data, error, loading, reload } = useAsync(() => financeApi.commitments(), []);
  const suggestions = useAsync(() => financeApi.commitmentSuggestions(), []);
  const [editing, setEditing] = useState<Commitment | Partial<Commitment> | null>(null);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  const all = data?.commitments || [];
  const list = all.filter((c) => !exclude.includes(c.type));
  const monthly = list.filter((c) => c.status !== 'paused' && c.currency === 'INR').reduce((s, c) => {
    const factor = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, half_yearly: 1 / 6, yearly: 1 / 12 }[c.schedule.freq] || 1;
    return s + c.amountPaise * factor;
  }, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[#736F6A]">About <b>{formatPaise(Math.round(monthly))}</b> a month in EMIs, rent, subscriptions and premiums. SIPs are under Investments.</span>
        <Button size="sm" onClick={() => setEditing({ type: 'emi', schedule: { freq: 'monthly', nextDueDate: new Date().toISOString() } as any })}><Plus className="w-3.5 h-3.5" /> Add</Button>
      </div>

      {(suggestions.data?.suggestions.length || 0) > 0 && (
        <Card className="!bg-[#FFFBF0] !border-[#E9C46A]/50">
          <SectionTitle><span className="inline-flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Looks recurring — track it?</span></SectionTitle>
          {suggestions.data!.suggestions.map((s) => (
            <div key={s.merchantContains} className="flex items-center gap-2 py-1.5 text-xs">
              <div className="flex-1 min-w-0"><b>{s.name}</b><div className="text-[11px] text-[#736F6A]">{formatPaise(s.amountPaise)} around day {s.dayOfMonth} · seen in {s.months.join(', ')}</div></div>
              <Button size="sm" variant="secondary" onClick={() => {
                const now = new Date(Date.now() + 330 * 60_000);
                const due = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + (now.getUTCDate() > s.dayOfMonth ? 1 : 0), s.dayOfMonth));
                setEditing({ type: 'subscription', name: s.name, amountPaise: s.amountPaise, matchRule: { merchantContains: s.merchantContains, tolerancePct: 5 }, schedule: { freq: 'monthly', dayOfMonth: s.dayOfMonth, nextDueDate: due.toISOString() } } as any);
              }}>Track</Button>
            </div>
          ))}
        </Card>
      )}

      {list.length === 0 ? <Empty title="No bills yet" text="EMI due emails and policy premiums add themselves here. You can also add rent or subscriptions." /> : (
        <Card className="!p-0 divide-y divide-[#F2EFEA]">
          {list.map((c) => (
            <button key={c.id} type="button" onClick={() => setEditing(c)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[#FAF8F5] cursor-pointer">
              <Repeat className="w-4 h-4 text-[#736F6A] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate">{c.name}</div>
                <div className="text-[11px] text-[#736F6A]">{TYPE_LABEL[c.type]} · {c.schedule.freq.replace('_', ' ')} · next {fmtDate(c.schedule.nextDueDate)}{c.statusNote ? ` · ${c.statusNote}` : ''}</div>
              </div>
              <StatusBadge status={c.status} />
              <Money paise={c.amountPaise} currency={c.currency} className="text-xs" />
            </button>
          ))}
        </Card>
      )}

      {editing && <CommitmentForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); suggestions.reload(); }} />}
    </div>
  );
}

export function CommitmentForm({ initial, onClose, onSaved }: { initial: Partial<Commitment>; onClose: () => void; onSaved: () => void }) {
  const { accounts } = useFinanceStore();
  const existing = initial.id ? (initial as Commitment) : null;
  const [f, setF] = useState({
    type: initial.type || 'other', name: initial.name || '', amount: initial.amountPaise ? paiseToInput(initial.amountPaise) : '', currency: initial.currency || 'INR',
    freq: initial.schedule?.freq || 'monthly', due: toDateInput(initial.schedule?.nextDueDate || new Date().toISOString()),
    accountId: initial.accountId || null as string | null, merchant: initial.matchRule?.merchantContains || '', status: initial.status || 'due',
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const amountPaise = rupeesToPaise(f.amount);
    if (!f.name || amountPaise === null) { toastError(new Error('Enter a name and amount')); return; }
    const body = {
      type: f.type, name: f.name, amountPaise, currency: f.currency, accountId: f.accountId, status: f.status,
      schedule: { freq: f.freq, dayOfMonth: Number(f.due.slice(8, 10)), nextDueDate: `${f.due}T00:00:00+05:30` },
      matchRule: { merchantContains: f.merchant || undefined, tolerancePct: 5 },
    };
    setBusy(true);
    try {
      if (existing) await financeApi.updateCommitment(existing.id, body);
      else await financeApi.createCommitment(body);
      toastOk('Saved');
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title={existing ? existing.name : initial.type === 'sip' ? 'Add SIP' : 'Add bill or EMI'} onClose={onClose} footer={<>
      {existing && <Button variant="danger" onClick={async () => { if (window.confirm('Delete?')) { await financeApi.deleteCommitment(existing.id); onSaved(); } }}>Delete</Button>}
      <Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button>
    </>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type"><Select value={f.type} onChange={(v) => setF({ ...f, type: v as any })}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Status"><Select value={f.status} onChange={(v) => setF({ ...f, status: v as any })}>{['due', 'paid', 'missed', 'failed', 'action_needed', 'paused'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Select></Field>
      </div>
      <Field label="Name"><TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Home loan EMI" /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Amount"><TextInput inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Currency"><Select value={f.currency} onChange={(v) => setF({ ...f, currency: v })}>{['INR', 'USD', 'EUR', 'GBP'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Repeats"><Select value={f.freq} onChange={(v) => setF({ ...f, freq: v as any })}>{['weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly'].map((x) => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}</Select></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Next due"><TextInput type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
        <Field label="Paid from"><AccountSelect accounts={accounts} value={f.accountId} onChange={(v) => setF({ ...f, accountId: v })} noneLabel="Any account" /></Field>
      </div>
      <Field label="Bank shows the payment as" hint="Part of the merchant name, to recognise when it's paid"><TextInput value={f.merchant} onChange={(e) => setF({ ...f, merchant: e.target.value })} placeholder="netflix" /></Field>
      <Pencil className="hidden" />
    </Sheet>
  );
}
