import React, { useEffect, useState } from 'react';
import { CalendarRange, Download, Plane, Plus, X } from 'lucide-react';
import { financeApi } from '../api';
import { useFinanceStore, categoryLabel } from '../store';
import { useAppStore } from '../../../store/useAppStore';
import { Button, Card, Field, Money, ProgressBar, SectionTitle, TextInput, fmtDate, toastError, toastOk, useAsync } from './ui';
import { formatPaise, paiseToInput, rupeesToPaise } from '../../../utils/currency';
import { exportTripToCSV } from '../../../utils/export';
import type { Group, Expense, User } from '../../../types';

/**
 * Trip extras on a trip group: dates, budget, my personal payments on the
 * trip (with suggestions from the trip dates), and a summary vs budget.
 * Shared expenses and settle-up stay in the normal group screens.
 */
export default function TripPanel({ group, expenses, users }: { group: Group; expenses: Expense[]; users: User[] }) {
  const authStatus = useAppStore((s) => s.authStatus);
  const { categories, loadBasics } = useFinanceStore();
  const { data, error, reload } = useAsync(() => (authStatus === 'signedIn' ? financeApi.trip(group.id) : Promise.resolve(null)), [group.id, authStatus, expenses.length]);
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [budget, setBudget] = useState('');

  useEffect(() => { if (authStatus === 'signedIn') void loadBasics().catch(() => {}); }, [authStatus]);
  useEffect(() => {
    const g = data?.group;
    if (g) {
      setStart(g.startDate || '');
      setEnd(g.endDate || '');
      setBudget(g.budgetPaise ? paiseToInput(g.budgetPaise) : '');
    }
  }, [data?.group?.startDate, data?.group?.endDate, data?.group?.budgetPaise]);

  if (authStatus !== 'signedIn' || error) return null;
  if (!data) return null;
  const g = data.group;
  const s = data.summary;
  const name = (id: string) => (id === useAppStore.getState().currentUser?.id ? 'You' : users.find((u) => u.id === id)?.name || id);

  const save = async () => {
    try {
      await financeApi.updateTrip(group.id, {
        startDate: start || null, endDate: end || null, budgetPaise: budget ? rupeesToPaise(budget) : null,
      });
      setEditing(false);
      toastOk('Trip updated');
      reload();
      void useAppStore.getState().syncWithBackend();
    } catch (e) {
      toastError(e);
    }
  };

  const assign = async (txnId: string, tripId: string | null) => {
    try {
      await financeApi.updateTransaction(txnId, { tripId, learn: false });
      reload();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Card className="flex flex-col gap-3" >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <Plane className="w-4 h-4 text-[#3C5A48]" />
          <b>Trip</b>
          <span className="text-[#736F6A] inline-flex items-center gap-1"><CalendarRange className="w-3.5 h-3.5" />{g.startDate ? `${fmtDate(g.startDate)} – ${fmtDate(g.endDate || g.startDate)}` : 'No dates yet'}</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>{editing ? 'Close' : 'Dates & budget'}</Button>
          <Button size="sm" variant="secondary" onClick={() => exportTripToCSV({
            name: group.name, startDate: g.startDate, endDate: g.endDate, budgetPaise: g.budgetPaise, totalPaise: s.totalPaise,
            personal: data.personal.map((t) => ({ postedAt: t.postedAt, merchant: t.merchant, amountPaise: t.amountPaise, category: categoryLabel(categories, t.categoryId) })),
            shared: expenses.filter((e) => e.groupId === group.id && !e.isSettlement).map((e) => ({ date: e.date, description: e.description, amount: e.amount, paidBy: name(e.paidBy), category: e.category || 'other' })),
            perPerson: s.perPerson.map((p) => ({ name: name(p.userId), paidPaise: p.paidPaise, sharePaise: p.sharePaise })),
          })}><Download className="w-3.5 h-3.5" /> CSV</Button>
        </div>
      </div>

      {editing && (
        <div className="grid grid-cols-3 gap-2 items-end">
          <Field label="Start"><TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="End"><TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          <Field label="Budget (₹)"><TextInput inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} /></Field>
          <div className="col-span-3 flex justify-end"><Button size="sm" onClick={save}>Save</Button></div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div><div className="text-[10px] text-[#736F6A] uppercase font-bold">Total</div><b>{formatPaise(s.totalPaise)}</b></div>
        <div><div className="text-[10px] text-[#736F6A] uppercase font-bold">Shared</div><b>{formatPaise(s.sharedPaise)}</b></div>
        <div><div className="text-[10px] text-[#736F6A] uppercase font-bold">My own</div><b>{formatPaise(s.myPersonalPaise)}</b></div>
      </div>
      {s.budgetPaise ? (
        <div className="flex flex-col gap-1">
          <ProgressBar value={s.totalPaise} max={s.budgetPaise} />
          <span className={`text-[11px] ${s.remainingPaise! < 0 ? 'text-[#C86D51] font-bold' : 'text-[#736F6A]'}`}>
            {s.remainingPaise! >= 0 ? `${formatPaise(s.remainingPaise!)} left of ${formatPaise(s.budgetPaise)}` : `${formatPaise(-s.remainingPaise!)} over the ${formatPaise(s.budgetPaise)} budget`}
          </span>
        </div>
      ) : null}
      {s.byCategory.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#736F6A]">
          {s.byCategory.map((c) => <span key={c.name}>{c.name}: <b className="text-[#2C2B29]">{formatPaise(c.amountPaise)}</b></span>)}
        </div>
      )}

      {data.personal.length > 0 && (
        <div>
          <SectionTitle>My payments on this trip</SectionTitle>
          {data.personal.map((t) => (
            <div key={t.id} className="flex items-center gap-2 text-xs py-1">
              <span className="flex-1 truncate">{fmtDate(t.postedAt)} · {t.merchant || t.description}{t.sharedExpenseId ? ' · shared' : ''}</span>
              <Money paise={t.amountPaise} />
              <button type="button" className="p-1 text-[#A39E98] hover:text-[#C86D51] cursor-pointer" aria-label="Remove from trip" onClick={() => assign(t.id, null)}><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      {data.suggestions.length > 0 && (
        <div>
          <SectionTitle>Payments during the trip dates</SectionTitle>
          {data.suggestions.map((t) => (
            <div key={t.id} className="flex items-center gap-2 text-xs py-1">
              <span className="flex-1 truncate">{fmtDate(t.postedAt)} · {t.merchant || t.description}</span>
              <Money paise={t.amountPaise} />
              <Button size="sm" variant="secondary" onClick={() => assign(t.id, group.id)}><Plus className="w-3 h-3" /> Add</Button>
            </div>
          ))}
          <p className="text-[10px] text-[#A39E98] mt-1">To split one with the group, open it under Money → Transactions → Share.</p>
        </div>
      )}
    </Card>
  );
}
