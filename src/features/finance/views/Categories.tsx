import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { financeApi } from '../api';
import { useFinanceStore, categoryLabel } from '../store';
import { Button, Card, CategorySelect, Field, SectionTitle, Select, Sheet, Spinner, TextInput, toastError, toastOk, useAsync } from '../components/ui';
import { formatPaise, paiseToInput, rupeesToPaise } from '../../../utils/currency';
import type { Category } from '../types';

export default function Categories() {
  const { categories, refreshCategories } = useFinanceStore();
  const rules = useAsync(() => financeApi.rules(), []);
  const templates = useAsync(() => financeApi.templates(), []);
  const [editing, setEditing] = useState<Category | { parentId: string | null } | null>(null);
  const [newRule, setNewRule] = useState(false);

  const top = categories.filter((c) => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
  const move = async (list: Category[], i: number, dir: -1 | 1) => {
    const ids = list.map((c) => c.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await financeApi.reorderCategories(ids); await refreshCategories(); } catch (e) { toastError(e); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionTitle action={<Button size="sm" onClick={() => setEditing({ parentId: null })}><Plus className="w-3.5 h-3.5" /> Category</Button>}>Categories & monthly budgets</SectionTitle>
        <Card className="!p-0 divide-y divide-[#F2EFEA]">
          {top.map((c, i) => {
            const kids = categories.filter((k) => k.parentId === c.id).sort((a, b) => a.sortOrder - b.sortOrder);
            return (
              <div key={c.id} className="px-3 py-2">
                <CatRow c={c} onEdit={() => setEditing(c)} onUp={() => move(top, i, -1)} onDown={() => move(top, i, 1)} onAddChild={() => setEditing({ parentId: c.id })} />
                {kids.length > 0 && (
                  <div className="ml-5 mt-1 border-l border-[#F2EFEA] pl-3 flex flex-col gap-0.5">
                    {kids.map((k, j) => <CatRow key={k.id} c={k} onEdit={() => setEditing(k)} onUp={() => move(kids, j, -1)} onDown={() => move(kids, j, 1)} />)}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      </div>

      <div>
        <SectionTitle action={<Button size="sm" variant="secondary" onClick={() => setNewRule(true)}><Plus className="w-3.5 h-3.5" /> Rule</Button>}>Rules</SectionTitle>
        {rules.loading ? <Spinner /> : (rules.data?.rules.length || 0) === 0 ? (
          <span className="text-xs text-[#736F6A]">No rules yet. Changing a transaction's category creates one automatically.</span>
        ) : (
          <Card className="!p-0 divide-y divide-[#F2EFEA]">
            {rules.data!.rules.map((r) => (
              <div key={r.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="truncate">
                    If {[r.match.merchantContains && `merchant contains "${r.match.merchantContains}"`, r.match.senderEquals && `sender is ${r.match.senderEquals}`, r.match.channel && `paid by ${r.match.channel}`,
                      r.match.amountMinPaise !== undefined && `≥ ${formatPaise(r.match.amountMinPaise)}`, r.match.amountMaxPaise !== undefined && `≤ ${formatPaise(r.match.amountMaxPaise)}`].filter(Boolean).join(' and ')}
                  </div>
                  <div className="text-[11px] text-[#736F6A]">→ {categoryLabel(categories, r.action.categoryId)}{r.action.kind ? ` · ${r.action.kind}` : ''} · used {r.hits}× · {r.createdFrom === 'user_correction' ? 'learned' : 'manual'}</div>
                </div>
                <button type="button" className="p-1 text-[#A39E98] hover:text-[#C86D51] cursor-pointer" aria-label="Delete rule" onClick={async () => { try { await financeApi.deleteRule(r.id); rules.reload(); } catch (e) { toastError(e); } }}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </Card>
        )}
      </div>

      <div>
        <SectionTitle>Split templates</SectionTitle>
        {(templates.data?.templates.length || 0) === 0 ? <span className="text-xs text-[#736F6A]">Save one from a split in % mode, e.g. "Monthly kirana: 60% staples / 25% household / 15% snacks".</span> : (
          <Card className="!p-0 divide-y divide-[#F2EFEA]">
            {templates.data!.templates.map((t) => (
              <div key={t.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                <div className="flex-1 min-w-0"><b>{t.name}</b><div className="text-[11px] text-[#736F6A] truncate">{t.parts.map((p) => `${p.percent}% ${categoryLabel(categories, p.categoryId)}`).join(' · ')}</div></div>
                <button type="button" className="p-1 text-[#A39E98] hover:text-[#C86D51] cursor-pointer" aria-label="Delete template" onClick={async () => { await financeApi.deleteTemplate(t.id); templates.reload(); }}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </Card>
        )}
      </div>

      {editing && <CategoryForm initial={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refreshCategories(); }} />}
      {newRule && <RuleForm onClose={() => setNewRule(false)} onSaved={() => { setNewRule(false); rules.reload(); }} />}
    </div>
  );
}

function CatRow({ c, onEdit, onUp, onDown, onAddChild }: { key?: string; c: Category; onEdit: () => void; onUp: () => void; onDown: () => void; onAddChild?: () => void }) {
  return (
    <div className="flex items-center gap-2 text-xs py-1">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
      <span className="flex-1 truncate font-semibold">{c.name}</span>
      {c.budgetPaise > 0 && <span className="text-[11px] text-[#736F6A]">{formatPaise(c.budgetPaise)}/mo</span>}
      <button type="button" className="p-1 text-[#A39E98] hover:text-[#2C2B29] cursor-pointer" onClick={onUp} aria-label="Move up"><ArrowUp className="w-3 h-3" /></button>
      <button type="button" className="p-1 text-[#A39E98] hover:text-[#2C2B29] cursor-pointer" onClick={onDown} aria-label="Move down"><ArrowDown className="w-3 h-3" /></button>
      {onAddChild && <button type="button" className="p-1 text-[#A39E98] hover:text-[#3C5A48] cursor-pointer" onClick={onAddChild} aria-label="Add sub-category"><Plus className="w-3 h-3" /></button>}
      <button type="button" className="p-1 text-[#A39E98] hover:text-[#3C5A48] cursor-pointer" onClick={onEdit} aria-label="Edit"><Pencil className="w-3 h-3" /></button>
    </div>
  );
}

function CategoryForm({ initial, onClose, onSaved }: { initial: Category | { parentId: string | null }; onClose: () => void; onSaved: () => void }) {
  const { categories } = useFinanceStore();
  const existing = 'id' in initial ? initial : null;
  const [name, setName] = useState(existing?.name || '');
  const [color, setColor] = useState(existing?.color || '#5B8C5A');
  const [budget, setBudget] = useState(existing?.budgetPaise ? paiseToInput(existing.budgetPaise) : '');
  const [parentId, setParentId] = useState<string | null>(existing ? existing.parentId : initial.parentId);
  const [kind, setKind] = useState<Category['kind']>(existing?.kind || 'expense');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const body = { name, color, budgetPaise: budget ? rupeesToPaise(budget) || 0 : 0, parentId, kind };
    setBusy(true);
    try {
      if (existing) await financeApi.updateCategory(existing.id, body);
      else await financeApi.createCategory(body);
      toastOk('Saved');
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title={existing ? `Edit ${existing.name}` : 'New category'} onClose={onClose} footer={<>
      {existing && <Button variant="danger" onClick={async () => {
        if (!window.confirm('Delete this category? Its transactions move to the parent category (or uncategorised).')) return;
        try { await financeApi.deleteCategory(existing.id); onSaved(); } catch (e) { toastError(e); }
      }}>Delete</Button>}
      <Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button>
    </>}>
      <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Parent"><CategorySelect categories={categories.filter((c) => !c.parentId && c.id !== existing?.id)} value={parentId} onChange={setParentId} noneLabel="Top level" /></Field>
        <Field label="Kind"><Select value={kind} onChange={(v) => setKind(v as any)}><option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option></Select></Field>
        <Field label="Colour"><input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-full rounded-xl border border-[#E6E1DA] cursor-pointer" /></Field>
        <Field label="Monthly budget (₹)" hint="Empty = no budget"><TextInput inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} /></Field>
      </div>
    </Sheet>
  );
}

function RuleForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { categories } = useFinanceStore();
  const [merchant, setMerchant] = useState('');
  const [channel, setChannel] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [kind, setKind] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await financeApi.createRule({
        match: { ...(merchant ? { merchantContains: merchant } : {}), ...(channel ? { channel } : {}), ...(min ? { amountMinPaise: rupeesToPaise(min) } : {}), ...(max ? { amountMaxPaise: rupeesToPaise(max) } : {}) },
        action: { ...(categoryId ? { categoryId } : {}), ...(kind ? { kind } : {}) },
        priority: 5,
      });
      toastOk('Rule added');
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="New rule" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Add rule</Button></>}>
      <Field label="Merchant contains"><TextInput value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="swiggy" /></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Paid via"><Select value={channel} onChange={setChannel}><option value="">Any</option>{['upi', 'card', 'imps', 'neft', 'netbanking', 'autodebit', 'cash'].map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}</Select></Field>
        <Field label="Min ₹"><TextInput inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} /></Field>
        <Field label="Max ₹"><TextInput inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} /></Field>
      </div>
      <Field label="Then set category"><CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} noneLabel="Don't change" /></Field>
      <Field label="And kind">
        <Select value={kind} onChange={setKind}><option value="">Don't change</option><option value="self_transfer">Self transfer</option><option value="cc_bill_payment">Card bill payment</option><option value="investment">Investment</option><option value="emi">EMI</option><option value="income">Income</option></Select>
      </Field>
    </Sheet>
  );
}
