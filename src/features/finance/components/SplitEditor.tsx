import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { financeApi } from '../api';
import { useFinanceStore } from '../store';
import { Button, CategorySelect, Select, TextInput, toastError, toastOk, useAsync } from './ui';
import { formatPaise, paiseToInput, rupeesToPaise } from '../../../utils/currency';
import type { Transaction } from '../types';

type Row = { categoryId: string | null; value: string; note?: string; lineItems?: any[] };

/**
 * Split one payment across categories by exact amounts, percentages or a
 * saved template. Shows the remaining amount live; the server re-checks
 * that parts add up to the paisa.
 */
export default function SplitEditor({ txn, hasLineItems, onSaved }: { txn: Transaction; hasLineItems: boolean; onSaved: (t: Transaction) => void }) {
  const { categories } = useFinanceStore();
  const templates = useAsync(() => financeApi.templates(), []);
  const [mode, setMode] = useState<'amounts' | 'percent'>('amounts');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveAs, setSaveAs] = useState('');

  useEffect(() => {
    setRows(txn.splits.length
      ? txn.splits.map((s) => ({ categoryId: s.categoryId, value: paiseToInput(s.amountPaise), note: s.note, lineItems: s.lineItems }))
      : [{ categoryId: txn.categoryId, value: paiseToInput(txn.amountPaise) }, { categoryId: null, value: '' }]);
    setMode('amounts');
  }, [txn.id, txn.splits.length]);

  const total = txn.amountPaise;
  const allocated = mode === 'amounts'
    ? rows.reduce((s, r) => s + (rupeesToPaise(r.value) || 0), 0)
    : Math.round(rows.reduce((s, r) => s + (Number(r.value) || 0), 0) * 100) / 100;
  const remaining = mode === 'amounts' ? total - allocated : 100 - allocated;
  const ok = mode === 'amounts' ? remaining === 0 : Math.abs(remaining) < 0.001;

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async (body: Record<string, unknown>, msg = 'Split saved') => {
    setBusy(true);
    try {
      const res = await financeApi.saveSplits(txn.id, body);
      toastOk(msg);
      onSaved(res.transaction);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const parts = rows.filter((r) => r.value.trim());
    if (mode === 'amounts') {
      await save({ mode: 'amounts', parts: parts.map((r) => ({ categoryId: r.categoryId, amountPaise: rupeesToPaise(r.value) || 0, note: r.note, lineItems: r.lineItems })) });
    } else {
      await save({ mode: 'percent', parts: parts.map((r) => ({ categoryId: r.categoryId, percent: Number(r.value) })) });
    }
    if (saveAs.trim() && mode === 'percent') {
      try {
        await financeApi.createTemplate({ name: saveAs.trim(), parts: parts.filter((r) => r.categoryId).map((r) => ({ categoryId: r.categoryId, percent: Number(r.value) })) });
        templates.reload();
      } catch (e) {
        toastError(e);
      }
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-xl border border-[#E6E1DA] p-0.5 bg-[#FAF8F5]">
          {(['amounts', 'percent'] as const).map((m) => (
            <button key={m} type="button" onClick={() => { setMode(m); setRows((rs) => rs.map((r) => ({ ...r, value: '' }))); }}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg cursor-pointer ${mode === m ? 'bg-white shadow-xs text-[#3C5A48]' : 'text-[#736F6A]'}`}>
              {m === 'amounts' ? '₹ Amounts' : '% Percent'}
            </button>
          ))}
        </div>
        {(templates.data?.templates.length || 0) > 0 && (
          <Select value="" onChange={(id) => id && save({ mode: 'template', templateId: id }, 'Template applied')} className="!w-auto">
            <option value="">Apply template…</option>
            {templates.data!.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        )}
        {hasLineItems && <Button size="sm" variant="secondary" busy={busy} onClick={async () => {
          setBusy(true);
          try { const r = await financeApi.autoSplit(txn.id); onSaved(r.transaction); toastOk('Split from order items'); } catch (e) { toastError(e); } finally { setBusy(false); }
        }}><Wand2 className="w-3.5 h-3.5" /> From order items</Button>}
      </div>

      {rows.map((r, i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0"><CategorySelect categories={categories} value={r.categoryId} onChange={(v) => update(i, { categoryId: v })} kinds={['expense']} /></div>
            <TextInput className="!w-24 text-right" inputMode="decimal" placeholder={mode === 'amounts' ? '₹' : '%'} value={r.value} onChange={(e) => update(i, { value: e.target.value })} />
            <button type="button" className="p-1.5 text-[#A39E98] hover:text-[#C86D51] cursor-pointer" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Remove part"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          {r.lineItems && r.lineItems.length > 0 && (
            <div className="text-[10px] text-[#736F6A] pl-1">{r.lineItems.map((li: any) => li.name).join(', ')}</div>
          )}
        </div>
      ))}

      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={() => setRows((rs) => [...rs, { categoryId: null, value: '' }])}><Plus className="w-3.5 h-3.5" /> Add part</Button>
        <span className={`text-[11px] font-bold ${ok ? 'text-[#2D6A4F]' : 'text-[#C86D51]'}`}>
          {mode === 'amounts' ? `${remaining === 0 ? 'Fully allocated' : `${formatPaise(Math.abs(remaining))} ${remaining > 0 ? 'left' : 'over'}`}` : `${remaining === 0 ? '100%' : `${Math.abs(remaining).toFixed(2)}% ${remaining > 0 ? 'left' : 'over'}`}`}
        </span>
      </div>
      {mode === 'percent' && <TextInput placeholder="Save as template (optional), e.g. Monthly kirana" value={saveAs} onChange={(e) => setSaveAs(e.target.value)} />}
      <div className="flex justify-end gap-2">
        {txn.splits.length > 0 && <Button size="sm" variant="secondary" busy={busy} onClick={() => save({ mode: 'clear' }, 'Split removed')}>Remove split</Button>}
        <Button size="sm" busy={busy} disabled={!ok} onClick={submit}>Save split</Button>
      </div>
    </div>
  );
}
