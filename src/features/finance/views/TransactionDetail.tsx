import React, { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, FileText, Link2, Mail, Paperclip, Plane, Trash2, Users } from 'lucide-react';
import { financeApi, saveBlob } from '../api';
import { useFinanceStore, categoryLabel } from '../store';
import { useAppStore } from '../../../store/useAppStore';
import {
  AccountSelect, Badge, Button, CategorySelect, ErrorBlock, Field, KIND_LABELS, Money, SectionTitle, Select, Sheet, Spinner, TextInput,
  accountLabel, fmtDate, toastError, toastOk, useAsync,
} from '../components/ui';
import SplitEditor from '../components/SplitEditor';
import { formatPaise, paiseToInput, rupeesToPaise } from '../../../utils/currency';
import type { Transaction } from '../types';

export default function TransactionDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { accounts, categories } = useFinanceStore();
  const { data, error, loading, reload, setData } = useAsync(() => financeApi.transaction(id), [id]);
  const [section, setSection] = useState<'details' | 'split' | 'share'>('details');

  const txn = data?.transaction;
  const [form, setForm] = useState({ merchant: '', categoryId: null as string | null, kind: '', notes: '', tags: '', accountId: null as string | null });
  useEffect(() => {
    if (txn) setForm({ merchant: txn.merchant, categoryId: txn.categoryId, kind: txn.kind, notes: txn.notes, tags: txn.tags.join(', '), accountId: txn.accountId });
  }, [txn?.id, txn?.categoryId, txn?.kind]);
  const [busy, setBusy] = useState(false);

  const changed = (t: Transaction) => {
    setData((d) => (d ? { ...d, transaction: t } : d));
    onChanged();
  };

  if (loading && !data) return <Sheet title="Transaction" onClose={onClose}><Spinner /></Sheet>;
  if (error || !data || !txn) return <Sheet title="Transaction" onClose={onClose}><ErrorBlock message={error || 'Not found'} onRetry={reload} /></Sheet>;

  const hasLineItems = data.sources.some((s) => s.lineItems?.length);
  const account = accounts.find((a) => a.id === txn.accountId);

  const saveDetails = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        merchant: form.merchant, kind: form.kind, notes: form.notes, accountId: form.accountId,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      };
      if (!txn.splits.length && form.categoryId !== txn.categoryId) body.categoryId = form.categoryId;
      const res = await financeApi.updateTransaction(txn.id, body);
      changed(res.transaction);
      toastOk(body.categoryId ? `Saved. Future ${form.merchant || 'payments'} will use this category.` : 'Saved');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this transaction? The source email stays ignored so it will not come back.')) return;
    try {
      await financeApi.deleteTransaction(txn.id);
      toastOk('Deleted');
      onChanged();
      onClose();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Sheet title={txn.merchant || KIND_LABELS[txn.kind]} onClose={onClose} wide>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Money paise={txn.amountPaise} currency={txn.currency} direction={txn.direction} strike={txn.status === 'declined'} className="text-2xl" />
          <span className="text-xs text-[#736F6A]">{fmtDate(txn.postedAt, true)} · {accountLabel(account)} · {txn.channel.toUpperCase()}</span>
          {txn.merchantRaw && txn.merchantRaw !== txn.merchant && <span className="text-[11px] text-[#A39E98]">Bank shows: {txn.merchantRaw}</span>}
          <div className="flex gap-1 flex-wrap mt-1">
            <Badge>{KIND_LABELS[txn.kind]}</Badge>
            <Badge tone={txn.status === 'settled' ? 'green' : txn.status === 'declined' ? 'red' : 'amber'}>{txn.status}</Badge>
            {txn.reconciled && <Badge tone="green">On statement</Badge>}
            {txn.expectedAt && txn.status === 'pending' && <Badge tone="amber">Expected {fmtDate(txn.expectedAt)}</Badge>}
            {txn.mySharePaise !== null && <Badge tone="blue">My share {formatPaise(txn.mySharePaise)}</Badge>}
          </div>
        </div>
      </div>

      <div className="inline-flex rounded-xl border border-[#E6E1DA] p-0.5 bg-[#FAF8F5] self-start">
        {(['details', 'split', 'share'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setSection(s)}
            className={`px-3 py-1.5 text-[11px] font-bold rounded-lg cursor-pointer ${section === s ? 'bg-white shadow-xs text-[#3C5A48]' : 'text-[#736F6A]'}`}>
            {s === 'details' ? 'Details' : s === 'split' ? `Split${txn.splits.length ? ` (${txn.splits.length})` : ''}` : 'Share & trip'}
          </button>
        ))}
      </div>

      {section === 'details' && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Merchant"><TextInput value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} /></Field>
            <Field label="Category" hint={txn.splits.length ? 'This payment is split; edit the split instead.' : txn.categorySource === 'rule' ? 'Set by one of your rules' : undefined}>
              {txn.splits.length ? (
                <div className="text-xs py-2">{txn.splits.map((s) => `${categoryLabel(categories, s.categoryId)} ${formatPaise(s.amountPaise)}`).join(' · ')}</div>
              ) : <CategorySelect categories={categories} value={form.categoryId} onChange={(v) => setForm({ ...form, categoryId: v })} />}
            </Field>
            <Field label="Kind">
              <Select value={form.kind} onChange={(v) => setForm({ ...form, kind: v })}>
                {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Account"><AccountSelect accounts={accounts} value={form.accountId} onChange={(v) => setForm({ ...form, accountId: v })} /></Field>
            <Field label="Tags" hint="Comma separated"><TextInput value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="office, reimbursable" /></Field>
            <Field label="Notes"><TextInput value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
          <div className="flex justify-between gap-2">
            <Button variant="danger" size="sm" onClick={remove}><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
            <Button busy={busy} onClick={saveDetails}>Save changes</Button>
          </div>

          <LinkedBlock txn={txn} linked={data.linked} onChanged={(t) => { changed(t); reload(); }} />

          <div>
            <SectionTitle>Where this came from</SectionTitle>
            <div className="flex flex-col gap-1.5">
              {data.sources.length === 0 && <span className="text-xs text-[#736F6A]">Entered manually.</span>}
              {data.sources.map((s) => (
                <div key={s.id} className="flex items-start gap-2 text-xs">
                  <Mail className="w-3.5 h-3.5 text-[#736F6A] mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{s.subject || s.source}</div>
                    <div className="text-[11px] text-[#736F6A]">{s.sender} · {fmtDate(s.receivedAt, true)}{s.parser ? ` · read by ${s.parser}` : ''}</div>
                    {s.lineItems?.length ? <div className="text-[11px] text-[#736F6A]">{s.lineItems.length} items: {s.lineItems.slice(0, 6).map((l) => l.name).join(', ')}{s.lineItems.length > 6 ? '…' : ''}</div> : null}
                  </div>
                </div>
              ))}
              {txn.referenceIds.length > 0 && <div className="text-[11px] text-[#A39E98]">References: {txn.referenceIds.join(', ')}</div>}
            </div>
          </div>

          <Attachments txnId={txn.id} documents={data.documents} onChanged={reload} />
        </div>
      )}

      {section === 'split' && (
        txn.direction !== 'debit'
          ? <span className="text-xs text-[#736F6A]">Only payments can be split.</span>
          : <SplitEditor txn={txn} hasLineItems={hasLineItems} onSaved={changed} />
      )}

      {section === 'share' && <ShareAndTrip txn={txn} onChanged={changed} />}
    </Sheet>
  );
}

function LinkedBlock({ txn, linked, onChanged }: { txn: Transaction; linked: Transaction | null; onChanged: (t: Transaction) => void }) {
  const [picking, setPicking] = useState(false);
  const candidates = useAsync(async () => {
    if (!picking) return null;
    const res = await financeApi.transactions({ includeExcluded: true, limit: 100, kind: txn.direction === 'credit' ? 'expense' : 'refund' });
    return res.transactions.filter((t) => t.direction !== txn.direction && t.id !== txn.id);
  }, [picking]);
  if (!linked && txn.kind !== 'refund' && txn.direction === 'debit' && !picking) return null;
  return (
    <div>
      <SectionTitle>{txn.direction === 'credit' ? 'Refund of' : 'Refunded by'}</SectionTitle>
      {linked ? (
        <div className="flex items-center justify-between gap-2 text-xs bg-[#FAF8F5] rounded-xl px-3 py-2">
          <span className="flex items-center gap-1.5 min-w-0"><Link2 className="w-3.5 h-3.5" /><span className="truncate">{linked.merchant || 'Transaction'} · {fmtDate(linked.postedAt)}</span></span>
          <Money paise={linked.amountPaise} direction={linked.direction} />
          <Button size="sm" variant="ghost" onClick={async () => { try { onChanged((await financeApi.link(txn.id, null)).transaction); } catch (e) { toastError(e); } }}>Unlink</Button>
        </div>
      ) : picking ? (
        candidates.loading ? <Spinner /> : (
          <Select value="" onChange={async (otherId) => { if (!otherId) return; try { onChanged((await financeApi.link(txn.id, otherId)).transaction); setPicking(false); toastOk('Linked'); } catch (e) { toastError(e); } }}>
            <option value="">Choose the matching payment…</option>
            {(candidates.data || []).map((c) => <option key={c.id} value={c.id}>{fmtDate(c.postedAt)} · {c.merchant || '—'} · {formatPaise(c.amountPaise)}</option>)}
          </Select>
        )
      ) : <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>Link to original payment</Button>}
    </div>
  );
}

function Attachments({ txnId, documents, onChanged }: { txnId: string; documents: any[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('type', 'invoice');
    form.append('title', file.name);
    form.append('linkKind', 'transaction');
    form.append('linkId', txnId);
    setBusy(true);
    try {
      await financeApi.uploadDocument(form);
      toastOk('Receipt attached');
      onChanged();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <SectionTitle action={
        <label className="text-[11px] font-bold text-[#3C5A48] cursor-pointer inline-flex items-center gap-1">
          <Paperclip className="w-3.5 h-3.5" />{busy ? 'Uploading…' : 'Attach receipt'}
          <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      }>Receipts & documents</SectionTitle>
      {documents.length === 0 ? <span className="text-xs text-[#736F6A]">None attached.</span> : documents.map((d) => (
        <div key={d.id} className="flex items-center gap-2 text-xs py-1">
          <FileText className="w-3.5 h-3.5 text-[#736F6A]" />
          <span className="flex-1 truncate">{d.title}</span>
          <button type="button" className="text-[#3C5A48] cursor-pointer" aria-label="Download" onClick={async () => { try { saveBlob(await financeApi.downloadDocument(d.id), d.filename || d.title); } catch (e) { toastError(e); } }}><Download className="w-3.5 h-3.5" /></button>
        </div>
      ))}
    </div>
  );
}

function ShareAndTrip({ txn, onChanged }: { txn: Transaction; onChanged: (t: Transaction) => void }) {
  const { currentUser, users, groups } = useAppStore();
  const trips = groups.filter((g) => g.category === 'trip' && currentUser && g.members.includes(currentUser.id));
  const people = useMemo(() => {
    if (!currentUser) return [];
    const ids = new Set(currentUser.friendIds || []);
    groups.filter((g) => g.members.includes(currentUser.id)).forEach((g) => g.members.forEach((m) => ids.add(m)));
    ids.delete(currentUser.id);
    return users.filter((u) => ids.has(u.id));
  }, [currentUser, users, groups]);

  const [tripId, setTripId] = useState(txn.tripId || '');
  const [groupId, setGroupId] = useState(txn.tripId || '');
  const [description, setDescription] = useState(txn.merchant || txn.description || 'Shared payment');
  const [selected, setSelected] = useState<string[]>([]);
  const [method, setMethod] = useState<'equally' | 'exactly'>('equally');
  const [exact, setExact] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (!currentUser) return null;
  const groupMembers = groupId ? groups.find((g) => g.id === groupId)?.members || [] : null;
  const choices = groupMembers ? users.filter((u) => groupMembers.includes(u.id) && u.id !== currentUser.id) : people;
  const participants = [currentUser.id, ...selected];

  const splits = () => {
    const total = txn.amountPaise;
    if (method === 'equally') {
      const base = Math.floor(total / participants.length);
      let left = total - base * participants.length;
      return participants.map((u) => {
        const extra = left > 0 ? 1 : 0;
        left -= extra;
        return { userId: u, amount: (base + extra) / 100 };
      });
    }
    return participants.map((u) => ({ userId: u, amount: (rupeesToPaise(exact[u] || '0') || 0) / 100 }));
  };

  const share = async () => {
    if (!selected.length) { toastError(new Error('Pick at least one friend')); return; }
    setBusy(true);
    try {
      const res = await financeApi.share(txn.id, { description, groupId: groupId || null, splitMethod: method, splits: splits() });
      onChanged(res.transaction);
      toastOk('Shared - it now shows in Tabby balances');
      // Pull the new shared expense into the app's lists.
      void useAppStore.getState().syncWithBackend();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <SectionTitle><span className="inline-flex items-center gap-1"><Plane className="w-3.5 h-3.5" /> Add to trip</span></SectionTitle>
        {trips.length === 0 ? <span className="text-xs text-[#736F6A]">Create a group with the "Trip" category to track trips.</span> : (
          <div className="flex gap-2">
            <Select value={tripId} onChange={setTripId}>
              <option value="">Not on a trip</option>
              {trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <Button size="sm" busy={busy} onClick={async () => {
              setBusy(true);
              try { onChanged((await financeApi.updateTransaction(txn.id, { tripId: tripId || null, learn: false })).transaction); toastOk(tripId ? 'Added to trip' : 'Removed from trip'); } catch (e) { toastError(e); } finally { setBusy(false); }
            }}>Save</Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <SectionTitle><span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Share with friends</span></SectionTitle>
        {txn.sharedExpenseId ? (
          <span className="text-xs text-[#736F6A]">Already shared. My share: <b>{formatPaise(txn.mySharePaise || 0)}</b>. Edit the split from the group or friend screen.</span>
        ) : txn.direction !== 'debit' ? <span className="text-xs text-[#736F6A]">Only payments can be shared.</span> : (
          <>
            <Field label="Description"><TextInput value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
            <Field label="Group (optional)">
              <Select value={groupId} onChange={(v) => { setGroupId(v); setSelected([]); }}>
                <option value="">No group (between friends)</option>
                {groups.filter((g) => g.members.includes(currentUser.id)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {choices.length === 0 && <span className="text-xs text-[#736F6A]">Add friends first.</span>}
              {choices.map((u) => {
                const on = selected.includes(u.id);
                return (
                  <button key={u.id} type="button" onClick={() => setSelected((s) => (on ? s.filter((x) => x !== u.id) : [...s, u.id]))}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer ${on ? 'bg-[#3C5A48] text-white border-[#3C5A48]' : 'bg-white border-[#E6E1DA] text-[#2C2B29]'}`}>
                    {u.name}
                  </button>
                );
              })}
            </div>
            {selected.length > 0 && (
              <>
                <Select value={method} onChange={(v) => setMethod(v as any)}>
                  <option value="equally">Split equally ({formatPaise(Math.floor(txn.amountPaise / participants.length))} each)</option>
                  <option value="exactly">Exact amounts</option>
                </Select>
                {method === 'exactly' && participants.map((u) => (
                  <div key={u} className="flex items-center gap-2">
                    <span className="text-xs flex-1">{u === currentUser.id ? 'You' : users.find((x) => x.id === u)?.name}</span>
                    <TextInput className="!w-28 text-right" inputMode="decimal" value={exact[u] || ''} onChange={(e) => setExact({ ...exact, [u]: e.target.value })} placeholder={paiseToInput(Math.floor(txn.amountPaise / participants.length))} />
                  </div>
                ))}
                <div className="flex justify-end"><Button busy={busy} onClick={share}>Share</Button></div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export { ExternalLink };
