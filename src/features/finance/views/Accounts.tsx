import React, { useState } from 'react';
import { CheckCircle2, CreditCard, KeyRound, Landmark, Pencil, Plus, Upload, Wallet, XCircle } from 'lucide-react';
import { financeApi } from '../api';
import { useFinanceStore } from '../store';
import {
  Badge, Button, Card, Empty, ErrorBlock, Field, Money, SectionTitle, Select, Sheet, Spinner, TextInput, fmtDate, toastError, toastOk, useAsync,
} from '../components/ui';
import { formatPaise, paiseToInput, rupeesToPaise } from '../../../utils/currency';
import type { Account, Statement } from '../types';

const TYPE_LABEL: Record<Account['type'], string> = {
  savings: 'Savings', current: 'Current', credit_card: 'Credit card', loan: 'Loan', investment: 'Investment', wallet: 'Wallet', cash: 'Cash',
};

export default function Accounts({ initial }: { initial?: Record<string, string> }) {
  const { accounts, refreshAccounts } = useFinanceStore();
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [uploadFor, setUploadFor] = useState<Account | null>(null);
  const [passwordFor, setPasswordFor] = useState<Account | null>(null);
  const [statementId, setStatementId] = useState<string | null>(initial?.statement || null);
  const statements = useAsync(() => financeApi.statements(), []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <span className="text-xs text-[#736F6A]">Balances = latest statement closing balance ± newer transactions.</span>
        <Button size="sm" onClick={() => setEditing('new')}><Plus className="w-3.5 h-3.5" /> Add account</Button>
      </div>

      {accounts.length === 0 && (
        <Empty title="Add your accounts and cards" text="Add each bank account, credit card and loan with its last 4 digits so bank emails land in the right place." action={<Button onClick={() => setEditing('new')}>Add account</Button>} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {accounts.map((a) => (
          <Card key={a.id} className={`flex flex-col gap-2 ${a.isActive ? '' : 'opacity-60'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#EBF1ED] text-[#3C5A48] flex items-center justify-center shrink-0">
                  {a.type === 'credit_card' ? <CreditCard className="w-4 h-4" /> : a.type === 'wallet' || a.type === 'cash' ? <Wallet className="w-4 h-4" /> : <Landmark className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{a.name}</div>
                  <div className="text-[11px] text-[#736F6A]">{a.institution.toUpperCase()} · {TYPE_LABEL[a.type]}{a.last4 ? ` ••${a.last4}` : ''}{a.cardLast4s.length ? ` · cards ${a.cardLast4s.map((c) => `••${c}`).join(' ')}` : ''}</div>
                </div>
              </div>
              <button type="button" className="p-1 text-[#736F6A] hover:text-[#3C5A48] cursor-pointer" onClick={() => setEditing(a)} aria-label="Edit account"><Pencil className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[10px] text-[#736F6A] font-bold uppercase">{a.type === 'credit_card' || a.type === 'loan' ? 'Outstanding' : 'Balance'}</div>
                <Money paise={a.type === 'credit_card' || a.type === 'loan' ? -(a.balancePaise || 0) : a.balancePaise || 0} className="text-lg" />
              </div>
              <div className="flex flex-col items-end gap-1">
                {a.lastStatementStatus === 'reconciled' && <Badge tone="green"><CheckCircle2 className="w-2.5 h-2.5" />Reconciled to {fmtDate(a.lastStatementEnd)}</Badge>}
                {a.lastStatementStatus === 'mismatch' && <Badge tone="red"><XCircle className="w-2.5 h-2.5" />Statement mismatch</Badge>}
                {!a.lastStatementStatus && <Badge>No statement yet</Badge>}
                {(a.unreconciledCount || 0) > 0 && <span className="text-[10px] text-[#736F6A]">{a.unreconciledCount} not on a statement</span>}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="secondary" onClick={() => setUploadFor(a)}><Upload className="w-3.5 h-3.5" /> Upload statement</Button>
              <Button size="sm" variant="ghost" onClick={() => setPasswordFor(a)}><KeyRound className="w-3.5 h-3.5" /> {a.hasStatementPassword ? 'Change' : 'Set'} statement password</Button>
            </div>
          </Card>
        ))}
      </div>

      {(statements.data?.statements.length || 0) > 0 && (
        <div>
          <SectionTitle>Imported statements</SectionTitle>
          <Card className="!p-0 divide-y divide-[#F2EFEA]">
            {statements.data!.statements.map((s) => {
              const acc = accounts.find((a) => a.id === s.accountId);
              return (
                <button key={s.id} type="button" onClick={() => setStatementId(s.id)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#FAF8F5] cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{acc?.name || 'Account'} · {fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)}</div>
                    <div className="text-[11px] text-[#736F6A]">{s.lineCount} lines · {s.matchedCount} matched · {s.createdCount} added · {s.format.toUpperCase()}</div>
                  </div>
                  {s.status === 'reconciled' ? <Badge tone="green">₹0.00 difference</Badge> : <Badge tone="red">Off by {formatPaise(Math.abs(s.mismatchPaise))}</Badge>}
                </button>
              );
            })}
          </Card>
        </div>
      )}

      {editing && <AccountForm account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refreshAccounts(); }} />}
      {passwordFor && <PasswordForm account={passwordFor} onClose={() => setPasswordFor(null)} onSaved={async () => { setPasswordFor(null); await refreshAccounts(); }} />}
      {uploadFor && <StatementUpload account={uploadFor} onClose={() => setUploadFor(null)} onDone={async (id) => { setUploadFor(null); await refreshAccounts(); statements.reload(); setStatementId(id); }} />}
      {statementId && <Reconciliation id={statementId} onClose={() => setStatementId(null)} />}
    </div>
  );
}

function AccountForm({ account, onClose, onSaved }: { account: Account | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: account?.name || '', institution: account?.institution || '', type: account?.type || 'savings', last4: account?.last4 || '',
    cardLast4s: account?.cardLast4s.join(', ') || '', aliases: account?.aliases.join(', ') || '', ifsc: account?.ifsc || '',
    holderName: account?.holderName || '', opening: account ? paiseToInput(account.openingBalancePaise) : '0', isActive: account?.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);
  const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const save = async () => {
    const body = {
      name: f.name, institution: f.institution.toLowerCase() || 'other', type: f.type, last4: f.last4, cardLast4s: list(f.cardLast4s),
      aliases: list(f.aliases), ifsc: f.ifsc, holderName: f.holderName, openingBalancePaise: rupeesToPaise(f.opening.replace('-', '')) ?? 0, isActive: f.isActive,
    };
    if (f.opening.trim().startsWith('-')) body.openingBalancePaise = -body.openingBalancePaise;
    setBusy(true);
    try {
      if (account) await financeApi.updateAccount(account.id, body);
      else await financeApi.createAccount(body);
      toastOk('Account saved');
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!account || !window.confirm(`Remove ${account.name}? Accounts with transactions are archived instead.`)) return;
    try {
      const r = await financeApi.deleteAccount(account.id);
      toastOk(r.archived ? 'Archived (it has transactions)' : 'Removed');
      onSaved();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <Sheet title={account ? 'Edit account' : 'Add account'} onClose={onClose} footer={<>
      {account && <Button variant="danger" onClick={remove}>Remove</Button>}
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={save}>Save</Button>
    </>}>
      <Field label="Name"><TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Kotak savings" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bank / institution"><TextInput value={f.institution} onChange={(e) => setF({ ...f, institution: e.target.value })} placeholder="kotak" /></Field>
        <Field label="Type">
          <Select value={f.type} onChange={(v) => setF({ ...f, type: v as any })}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </Field>
        <Field label="Account / card last 4" hint="As shown in bank emails, e.g. 9564"><TextInput inputMode="numeric" maxLength={4} value={f.last4} onChange={(e) => setF({ ...f, last4: e.target.value.replace(/\D/g, '') })} /></Field>
        <Field label="Linked card last 4s" hint="Debit cards on this account, comma separated"><TextInput value={f.cardLast4s} onChange={(e) => setF({ ...f, cardLast4s: e.target.value })} placeholder="2797" /></Field>
        <Field label="IFSC" hint="Helps spot transfers between your own accounts"><TextInput value={f.ifsc} onChange={(e) => setF({ ...f, ifsc: e.target.value.toUpperCase() })} /></Field>
        <Field label="Account holder name"><TextInput value={f.holderName} onChange={(e) => setF({ ...f, holderName: e.target.value })} /></Field>
      </div>
      <Field label="Other masked forms" hint="Comma separated, e.g. XXXXXX9564"><TextInput value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} /></Field>
      <Field label="Opening balance (₹)" hint="Used until the first statement is uploaded"><TextInput inputMode="decimal" value={f.opening} onChange={(e) => setF({ ...f, opening: e.target.value })} /></Field>
      {account && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Active</label>}
    </Sheet>
  );
}

function PasswordForm({ account, onClose, onSaved }: { account: Account; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={`Statement password · ${account.name}`} onClose={onClose} footer={<>
      {account.hasStatementPassword && <Button variant="danger" onClick={async () => { await financeApi.setStatementPassword(account.id, ''); toastOk('Removed'); onSaved(); }}>Remove</Button>}
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} disabled={!password} onClick={async () => {
        setBusy(true);
        try { await financeApi.setStatementPassword(account.id, password); toastOk('Saved (encrypted)'); onSaved(); } catch (e) { toastError(e); } finally { setBusy(false); }
      }}>Save</Button>
    </>}>
      <p className="text-xs text-[#736F6A]">Used to open password-protected PDF statements from this bank. It is encrypted on the server and can never be read back, only replaced. Tabby will never ask for it by email.</p>
      <Field label="Password"><TextInput type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
    </Sheet>
  );
}

function StatementUpload({ account, onClose, onDone }: { account: Account; onClose: () => void; onDone: (statementId: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [opening, setOpening] = useState('');
  const [closing, setClosing] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const upload = async () => {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    form.append('accountId', account.id);
    const o = opening ? rupeesToPaise(opening) : null;
    const c = closing ? rupeesToPaise(closing) : null;
    if (o !== null) form.append('openingBalancePaise', String(o));
    if (c !== null) form.append('closingBalancePaise', String(c));
    if (password) form.append('password', password);
    setBusy(true);
    try {
      const r = await financeApi.uploadStatement(form);
      toastOk(r.status === 'reconciled' ? `Reconciled: ${r.lineCount} lines, ${r.createdCount} new` : `Imported with a ${formatPaise(Math.abs(r.mismatchPaise))} difference`);
      onDone(r.statementId);
    } catch (e: any) {
      if (e?.code === 'password_needed' || e?.code === 'wrong_password') setNeedsPassword(true);
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title={`Upload statement · ${account.name}`} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!file} onClick={upload}>Import</Button></>}>
      <p className="text-xs text-[#736F6A]">CSV/Excel-CSV from net banking works best. Text PDFs work too (scanned PDFs don't). Re-uploading the same statement never creates duplicates.</p>
      <Field label="File"><input type="file" accept=".csv,.txt,.pdf,text/csv,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-xs" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opening balance (₹)" hint="Optional if the file has it"><TextInput inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} /></Field>
        <Field label="Closing balance (₹)" hint="Optional if the file has it"><TextInput inputMode="decimal" value={closing} onChange={(e) => setClosing(e.target.value)} /></Field>
      </div>
      {(needsPassword || (file && /\.pdf$/i.test(file.name) && !account.hasStatementPassword)) && (
        <Field label="PDF password" hint="Used once; save it on the account to reuse"><TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      )}
    </Sheet>
  );
}

function Reconciliation({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error, loading } = useAsync(() => financeApi.reconciliation(id), [id]);
  return (
    <Sheet title="Reconciliation" onClose={onClose}>
      {loading && <Spinner />}
      {error && <ErrorBlock message={error} />}
      {data && <ReconciliationBody statement={data.statement} unmatched={data.unmatchedTransactions} />}
    </Sheet>
  );
}

function ReconciliationBody({ statement: s, unmatched }: { statement: Statement; unmatched: any[] }) {
  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <Card className="!p-3"><div className="text-[10px] text-[#736F6A] uppercase font-bold">Opening</div><div className="font-bold">{formatPaise(s.openingBalancePaise)}</div></Card>
        <Card className="!p-3"><div className="text-[10px] text-[#736F6A] uppercase font-bold">Closing</div><div className="font-bold">{formatPaise(s.closingBalancePaise)}</div></Card>
      </div>
      {s.status === 'reconciled'
        ? <div className="p-3 rounded-xl bg-[#EBF1ED] text-[#3C5A48] font-bold">Opening + credits − debits = closing. Difference ₹0.00.</div>
        : <div className="p-3 rounded-xl bg-[#FDF3F0] text-[#A64B32] font-bold">Difference {formatPaise(s.mismatchPaise)}</div>}
      {s.issues.map((i) => <div key={i.line} className="text-[#A64B32]">Line {i.line}: {i.message}</div>)}
      <div><b>{s.lineCount}</b> lines · <b>{s.matchedCount}</b> matched existing transactions · <b>{s.createdCount}</b> added from the statement</div>
      {unmatched.length > 0 && (
        <div>
          <SectionTitle>In Tabby but not on this statement</SectionTitle>
          {unmatched.map((t) => <div key={t.id} className="flex justify-between py-1"><span>{fmtDate(t.postedAt)} · {t.merchant || t.description}</span><Money paise={t.amountPaise} direction={t.direction} /></div>)}
          <p className="text-[10px] text-[#A39E98] mt-1">These may be duplicates, pending items, or belong to another account.</p>
        </div>
      )}
    </div>
  );
}
