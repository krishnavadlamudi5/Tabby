import React, { useState } from 'react';
import { Bike, Car, CheckCircle2, Download, FileSearch, FileText, HeartPulse, KeyRound, Link2, Loader2, Plus, Shield, Sparkles, Trash2, Upload, UserPlus } from 'lucide-react';
import { financeApi, saveBlob } from '../api';
import { Badge, Button, Card, Empty, ErrorBlock, Field, Money, SectionTitle, Select, Sheet, Spinner, TextArea, TextInput, fmtDate, toDateInput, toastError, toastOk, useAsync } from '../components/ui';
import { formatPaise, paiseToInput, rupeesToPaise } from '../../../utils/currency';
import type { Claim, Person, Policy, PolicyExtraction, PolicyType } from '../types';
import { documentToText } from '../ocr';

const TYPE_LABEL: Record<PolicyType, string> = {
  health: 'Health', term_life: 'Term life', life: 'Life', vehicle: 'Vehicle', home: 'Home', travel: 'Travel', personal_accident: 'Personal accident', other: 'Other',
};

function daysTo(d?: string): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}

export function RenewalBadge({ date, status }: { date?: string; status: Policy['status'] }) {
  if (status === 'cancelled' || status === 'lapsed') return <Badge tone="red">{status}</Badge>;
  const d = daysTo(date);
  if (d === null) return <Badge>No renewal date</Badge>;
  if (d < 0) return <Badge tone="red">Renewal overdue {-d}d</Badge>;
  if (d <= 30) return <Badge tone="amber">Renews in {d}d</Badge>;
  return <Badge tone="green">Renews {fmtDate(date)}</Badge>;
}

export default function Insurance() {
  const { data, error, loading, reload } = useAsync(() => financeApi.policies(), []);
  const tax = useAsync(() => financeApi.tax(), []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Policy | 'new' | null>(null);
  const [draft, setDraft] = useState<{ prefill: Partial<Policy>; file?: File; note?: string } | null>(null);
  const [reading, setReading] = useState<string | null>(null);

  const addFromDocument = async (file: File) => {
    setReading('Reading the document…');
    try {
      const { text, method } = await documentToText(file, {
        progress: setReading,
        askPassword: async (wrong) => window.prompt(wrong ? 'Wrong password. Try again (often your date of birth, e.g. 01011990):' : 'This PDF is locked. Enter its password (often your date of birth, e.g. 01011990):'),
      });
      setReading('Finding the policy details…');
      const { extraction } = await financeApi.extractPolicy({ text });
      const found = extraction.found.length;
      setDraft({
        prefill: prefillFromExtraction(extraction), file,
        note: found ? `Filled ${found} field${found === 1 ? '' : 's'} from the ${method === 'ocr' ? 'scanned ' : ''}document${extraction.method === 'ai' ? ' (AI backup)' : ''}. Check and fill the rest.` : 'Couldn\'t read details automatically - please fill them in. The document will be attached.',
      });
    } catch (e) {
      toastError(e);
    } finally {
      setReading(null);
    }
  };

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  const policies = data?.policies || [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-2 flex-wrap">
        <label className={`px-2.5 py-1 text-[11px] rounded-xl font-bold border border-[#E6E1DA] bg-white inline-flex items-center gap-1.5 cursor-pointer ${reading ? 'opacity-60 pointer-events-none' : ''}`}>
          {reading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSearch className="w-3.5 h-3.5" />} Add from document
          <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void addFromDocument(f); }} />
        </label>
        <Button size="sm" onClick={() => setEditing('new')}><Plus className="w-3.5 h-3.5" /> Add policy</Button>
      </div>
      {reading && <div className="text-xs text-[#736F6A] flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />{reading} <span className="text-[#A39E98]">(on this device)</span></div>}
      <p className="text-[11px] text-[#736F6A] -mt-2">Policies emailed to your Gmail are filed automatically. For paper copies or other PDFs, use "Add from document" - scans are read on your phone.</p>
      {policies.length === 0 ? (
        <Empty title="No policies yet" text="Add each health, life, vehicle or travel policy with its renewal date and premium. Tabby reminds you 30, 7 and 1 days before renewal and links premium payments automatically." action={<Button onClick={() => setEditing('new')}>Add policy</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {policies.map((p) => (
            <Card key={p.id} onClick={() => setOpenId(p.id)} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#EBF1ED] text-[#3C5A48] flex items-center justify-center shrink-0"><PolicyIcon p={p} /></div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{p.insurer}</div>
                    <div className="text-[11px] text-[#736F6A] truncate">{TYPE_LABEL[p.type]}{p.planName ? ` · ${p.planName}` : ''}{p.vehicleNumber ? ` · ${p.vehicleNumber}` : ''}{p.policyNumber ? ` · ${p.policyNumber}` : ''}</div>
                    {p.needsCheck && <span className="inline-flex mt-0.5"><Badge tone="blue"><Sparkles className="w-2.5 h-2.5" />Auto-added · tap to check</Badge></span>}
                  </div>
                </div>
                <RenewalBadge date={p.renewalDate} status={p.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><div className="text-[10px] text-[#736F6A] uppercase font-bold">Cover</div><b>{formatPaise(p.sumInsuredPaise)}</b></div>
                <div><div className="text-[10px] text-[#736F6A] uppercase font-bold">Premium</div><b>{formatPaise(p.premiumPaise)}</b> <span className="text-[#736F6A]">/{p.premiumFrequency.replace('_', ' ')}</span></div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tax.data && (tax.data.rows.length > 0) && (
        <Card>
          <SectionTitle>Tax deductions · FY {tax.data.fy}</SectionTitle>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><div className="text-[10px] text-[#736F6A] uppercase font-bold">80C (life)</div><b>{formatPaise(tax.data.totals['80C'])}</b><div className="text-[10px] text-[#A39E98]">limit ₹1,50,000 with other 80C items</div></div>
            <div><div className="text-[10px] text-[#736F6A] uppercase font-bold">80D (health)</div><b>{formatPaise(tax.data.totals['80D'])}</b><div className="text-[10px] text-[#A39E98]">₹25,000 self/family; more for senior parents</div></div>
          </div>
          <p className="text-[10px] text-[#A39E98] mt-2">From premium payments linked to policies marked 80C/80D. Not tax advice.</p>
        </Card>
      )}

      <PdfPasswords />

      {openId && <PolicyDetail id={openId} onClose={() => setOpenId(null)} onEdit={(p) => { setOpenId(null); setEditing(p); }} onChanged={() => { reload(); tax.reload(); }} />}
      {editing && <PolicyForm policy={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); tax.reload(); }} />}
      {draft && <PolicyForm policy={null} prefill={draft.prefill} pendingFile={draft.file} note={draft.note} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); reload(); tax.reload(); }} />}
    </div>
  );
}

function PolicyDetail({ id, onClose, onEdit, onChanged }: { id: string; onClose: () => void; onEdit: (p: Policy) => void; onChanged: () => void }) {
  const { data, error, loading, reload } = useAsync(() => financeApi.policy(id), [id]);
  const [claimFor, setClaimFor] = useState<Claim | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading && !data) return <Sheet title="Policy" onClose={onClose}><Spinner /></Sheet>;
  if (error || !data) return <Sheet title="Policy" onClose={onClose}><ErrorBlock message={error || 'Not found'} /></Sheet>;
  const p = data.policy;

  const upload = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('type', 'policy');
    form.append('title', file.name);
    form.append('linkKind', 'policy');
    form.append('linkId', p.id);
    setBusy(true);
    try { await financeApi.uploadDocument(form); toastOk('Document filed'); reload(); } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  const rows: [string, React.ReactNode][] = [
    ['Policy number', p.policyNumber || '—'], ['Plan', p.planName || '—'], ...(p.vehicleNumber ? [['Vehicle', p.vehicleNumber] as [string, string]] : []), ['Sum insured', formatPaise(p.sumInsuredPaise)],
    ['Premium', `${formatPaise(p.premiumPaise)} ${p.premiumFrequency.replace('_', ' ')}`], ['Start', fmtDate(p.startDate) || '—'], ['Renewal', fmtDate(p.renewalDate) || '—'],
    ['Nominee', p.nominee || '—'], ['Payment mode', p.paymentMode || '—'], ['TPA', p.tpa || '—'], ['Claim helpline', p.claimHelpline || '—'],
    ['Agent', [p.agent?.name, p.agent?.phone, p.agent?.email].filter(Boolean).join(' · ') || '—'], ['Tax section', p.taxSection || '—'],
  ];

  return (
    <Sheet title={`${p.insurer} · ${TYPE_LABEL[p.type]}`} onClose={onClose} wide footer={<>
      <Button variant="danger" onClick={async () => { if (window.confirm('Delete this policy? Its documents are kept.')) { await financeApi.deletePolicy(p.id); onChanged(); onClose(); } }}>Delete</Button>
      <Button variant="secondary" onClick={() => onEdit(p)}>Edit</Button>
    </>}>
      {p.needsCheck && (
        <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#EAF2F8] text-xs text-[#22577A]">
          <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />Added automatically from your email. Do these details look right?</span>
          <Button size="sm" onClick={async () => { try { await financeApi.updatePolicy(p.id, { needsCheck: false }); reload(); onChanged(); } catch (e) { toastError(e); } }}><CheckCircle2 className="w-3.5 h-3.5" /> Looks right</Button>
        </div>
      )}
      <div className="flex items-center gap-2"><RenewalBadge date={p.renewalDate} status={p.status} /><Badge>{p.status.replace('_', ' ')}</Badge></div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        {rows.map(([k, v]) => <div key={k}><div className="text-[10px] text-[#736F6A] uppercase font-bold">{k}</div><div className="font-semibold break-words">{v}</div></div>)}
      </div>
      {data.members.length > 0 && <div className="text-xs"><SectionTitle>Insured members</SectionTitle>{data.members.map((m) => `${m.name} (${m.relation})`).join(', ')}</div>}
      {p.notes && <div className="text-xs whitespace-pre-line"><SectionTitle>Notes</SectionTitle>{p.notes}</div>}

      <div>
        <SectionTitle action={<label className="text-[11px] font-bold text-[#3C5A48] cursor-pointer inline-flex items-center gap-1"><Upload className="w-3.5 h-3.5" />{busy ? 'Uploading…' : 'Upload'}<input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>}>Documents</SectionTitle>
        {data.documents.length === 0 ? <span className="text-xs text-[#736F6A]">Upload the policy schedule, renewal notices and premium receipts (stored encrypted).</span> : data.documents.map((d) => (
          <div key={d.id} className="flex items-center gap-2 text-xs py-1">
            <FileText className="w-3.5 h-3.5 text-[#736F6A]" /><span className="flex-1 truncate">{d.title}</span><Badge>{d.type.replace('_', ' ')}</Badge>
            <button type="button" aria-label="Download" className="text-[#3C5A48] cursor-pointer" onClick={async () => { try { saveBlob(await financeApi.downloadDocument(d.id), d.filename || d.title); } catch (e) { toastError(e); } }}><Download className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>

      <div>
        <SectionTitle action={<Button size="sm" variant="ghost" onClick={async () => { try { const r = await financeApi.linkPremiums(p.id); toastOk(`${r.linked} payment(s) found`); reload(); onChanged(); } catch (e) { toastError(e); } }}><Link2 className="w-3.5 h-3.5" /> Find payments</Button>}>Premium history</SectionTitle>
        {data.premiums.length === 0 ? <span className="text-xs text-[#736F6A]">Payments to {p.insurer} of about {formatPaise(p.premiumPaise)} are linked automatically.</span> : data.premiums.map((t) => (
          <div key={t.id} className="flex justify-between text-xs py-1"><span>{fmtDate(t.postedAt)} · {t.merchant}</span><Money paise={t.amountPaise} /></div>
        ))}
      </div>

      <div>
        <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => setClaimFor('new')}><Plus className="w-3.5 h-3.5" /> Claim</Button>}>Claims</SectionTitle>
        {data.claims.length === 0 ? <span className="text-xs text-[#736F6A]">No claims.</span> : data.claims.map((c) => (
          <button key={c.id} type="button" onClick={() => setClaimFor(c)} className="w-full flex items-center justify-between gap-2 text-xs py-1.5 text-left cursor-pointer hover:bg-[#FAF8F5] rounded-lg px-1">
            <span className="truncate">{fmtDate(c.date)} · {c.reason || 'Claim'}</span>
            <span className="flex items-center gap-2"><Badge tone={c.status === 'settled' ? 'green' : c.status === 'rejected' ? 'red' : 'amber'}>{c.status.replace('_', ' ')}</Badge>{formatPaise(c.claimedPaise)}</span>
          </button>
        ))}
      </div>

      {claimFor && <ClaimForm policyId={p.id} claim={claimFor === 'new' ? null : claimFor} onClose={() => setClaimFor(null)} onSaved={() => { setClaimFor(null); reload(); }} />}
    </Sheet>
  );
}

function ClaimForm({ policyId, claim, onClose, onSaved }: { policyId: string; claim: Claim | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    date: toDateInput(claim?.date || new Date().toISOString()), reason: claim?.reason || '', claimed: claim ? paiseToInput(claim.claimedPaise) : '',
    settled: claim ? paiseToInput(claim.settledPaise) : '', status: claim?.status || 'filed', notes: claim?.notes || '',
  });
  const save = async () => {
    const body = { policyId, date: `${f.date}T00:00:00+05:30`, reason: f.reason, claimedPaise: rupeesToPaise(f.claimed) || 0, settledPaise: rupeesToPaise(f.settled) || 0, status: f.status, notes: f.notes };
    try {
      if (claim) await financeApi.updateClaim(claim.id, body);
      else await financeApi.createClaim(body);
      onSaved();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <Sheet title={claim ? 'Claim' : 'New claim'} onClose={onClose} footer={<>
      {claim && <Button variant="danger" onClick={async () => { await financeApi.deleteClaim(claim.id); onSaved(); }}><Trash2 className="w-3.5 h-3.5" /></Button>}
      <Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button>
    </>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><TextInput type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Status"><Select value={f.status} onChange={(v) => setF({ ...f, status: v as any })}>{['filed', 'in_review', 'settled', 'rejected'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Select></Field>
        <Field label="Claimed (₹)"><TextInput inputMode="decimal" value={f.claimed} onChange={(e) => setF({ ...f, claimed: e.target.value })} /></Field>
        <Field label="Settled (₹)"><TextInput inputMode="decimal" value={f.settled} onChange={(e) => setF({ ...f, settled: e.target.value })} /></Field>
      </div>
      <Field label="Reason"><TextInput value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      <Field label="Notes"><TextArea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </Sheet>
  );
}

export function PolicyForm({ policy, prefill, pendingFile, fromRawEventId, note, onClose, onSaved }: {
  policy: Policy | null; prefill?: Partial<Policy>; pendingFile?: File; fromRawEventId?: string; note?: string; onClose: () => void; onSaved: () => void;
}) {
  const people = useAsync(() => financeApi.people(), []);
  if (!policy && prefill) policy = { ...(prefill as Policy), id: '' };
  const [f, setF] = useState({
    insurer: policy?.insurer || '', policyNumber: policy?.policyNumber || '', type: policy?.type || 'health', planName: policy?.planName || '',
    sumInsured: policy ? paiseToInput(policy.sumInsuredPaise) : '', premium: policy ? paiseToInput(policy.premiumPaise) : '',
    premiumFrequency: policy?.premiumFrequency || 'yearly', paymentMode: policy?.paymentMode || '', startDate: toDateInput(policy?.startDate),
    renewalDate: toDateInput(policy?.renewalDate), status: policy?.status || 'active', nominee: policy?.nominee || '', tpa: policy?.tpa || '',
    claimHelpline: policy?.claimHelpline || '', agentName: policy?.agent?.name || '', agentPhone: policy?.agent?.phone || '', agentEmail: policy?.agent?.email || '',
    taxSection: policy?.taxSection || '', notes: policy?.notes || '', members: policy?.insuredMemberIds || [] as string[],
    vehicleNumber: policy?.vehicleNumber || '',
  });
  const isNew = !policy?.id;
  const [newPerson, setNewPerson] = useState({ name: '', relation: 'self' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.insurer) { toastError(new Error('Enter the insurer')); return; }
    const body = {
      insurer: f.insurer, policyNumber: f.policyNumber, type: f.type, planName: f.planName, sumInsuredPaise: rupeesToPaise(f.sumInsured) || 0,
      premiumPaise: rupeesToPaise(f.premium) || 0, premiumFrequency: f.premiumFrequency, paymentMode: f.paymentMode,
      ...(f.startDate ? { startDate: `${f.startDate}T00:00:00+05:30` } : {}), ...(f.renewalDate ? { renewalDate: `${f.renewalDate}T00:00:00+05:30` } : {}),
      status: f.status, nominee: f.nominee, tpa: f.tpa, claimHelpline: f.claimHelpline,
      agent: { name: f.agentName || undefined, phone: f.agentPhone || undefined, email: f.agentEmail || undefined },
      taxSection: f.taxSection || null, notes: f.notes, insuredMemberIds: f.members, vehicleNumber: f.vehicleNumber,
      ...(isNew && fromRawEventId ? { fromRawEventId } : {}),
    };
    setBusy(true);
    try {
      if (!isNew) await financeApi.updatePolicy(policy!.id, body);
      else {
        const { policy: created } = await financeApi.createPolicy(body);
        if (pendingFile) {
          const form = new FormData();
          form.append('file', pendingFile);
          form.append('type', 'policy');
          form.append('title', pendingFile.name || `${f.insurer} policy`);
          form.append('linkKind', 'policy');
          form.append('linkId', created.id);
          await financeApi.uploadDocument(form);
        }
      }
      toastOk('Policy saved');
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={!isNew ? `Edit ${policy!.insurer}` : 'Add policy'} onClose={onClose} wide footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
      {note && <div className="p-3 rounded-xl bg-[#EAF2F8] text-xs text-[#22577A] flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 shrink-0" />{note}</div>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Insurer"><TextInput value={f.insurer} onChange={set('insurer')} placeholder="Care Health Insurance" /></Field>
        <Field label="Type"><Select value={f.type} onChange={(v) => setF({ ...f, type: v as any })}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Policy number"><TextInput value={f.policyNumber} onChange={set('policyNumber')} /></Field>
        <Field label="Plan"><TextInput value={f.planName} onChange={set('planName')} /></Field>
        {f.type === 'vehicle' && <Field label="Vehicle number"><TextInput value={f.vehicleNumber} onChange={(e) => setF({ ...f, vehicleNumber: e.target.value.toUpperCase() })} placeholder="KA05MX4821" /></Field>}
        <Field label="Sum insured (₹)"><TextInput inputMode="decimal" value={f.sumInsured} onChange={set('sumInsured')} /></Field>
        <Field label="Premium (₹)"><TextInput inputMode="decimal" value={f.premium} onChange={set('premium')} /></Field>
        <Field label="Premium every"><Select value={f.premiumFrequency} onChange={(v) => setF({ ...f, premiumFrequency: v as any })}>{['monthly', 'quarterly', 'half_yearly', 'yearly', 'single'].map((x) => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}</Select></Field>
        <Field label="Start date"><TextInput type="date" value={f.startDate} onChange={set('startDate')} /></Field>
        <Field label="Renewal date"><TextInput type="date" value={f.renewalDate} onChange={set('renewalDate')} /></Field>
        <Field label="Status"><Select value={f.status} onChange={(v) => setF({ ...f, status: v as any })}>{['active', 'renewal_due', 'renewed', 'lapsed', 'cancelled'].map((x) => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}</Select></Field>
        <Field label="Tax section"><Select value={f.taxSection} onChange={(v) => setF({ ...f, taxSection: v as any })}><option value="">None</option><option value="80C">80C</option><option value="80D">80D</option></Select></Field>
        <Field label="Payment mode"><TextInput value={f.paymentMode} onChange={set('paymentMode')} placeholder="Auto-debit HDFC CC" /></Field>
        <Field label="Nominee"><TextInput value={f.nominee} onChange={set('nominee')} /></Field>
        <Field label="TPA"><TextInput value={f.tpa} onChange={set('tpa')} /></Field>
        <Field label="Claim helpline"><TextInput value={f.claimHelpline} onChange={set('claimHelpline')} /></Field>
        <Field label="Agent name"><TextInput value={f.agentName} onChange={set('agentName')} /></Field>
        <Field label="Agent phone"><TextInput value={f.agentPhone} onChange={set('agentPhone')} /></Field>
        <Field label="Agent email"><TextInput value={f.agentEmail} onChange={set('agentEmail')} /></Field>
      </div>
      <div>
        <SectionTitle>Insured members</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {(people.data?.people || []).map((p: Person) => {
            const on = f.members.includes(p.id);
            return <button key={p.id} type="button" onClick={() => setF({ ...f, members: on ? f.members.filter((x) => x !== p.id) : [...f.members, p.id] })}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer ${on ? 'bg-[#3C5A48] text-white border-[#3C5A48]' : 'bg-white border-[#E6E1DA]'}`}>{p.name} · {p.relation}</button>;
          })}
        </div>
        <div className="flex gap-2 mt-2">
          <TextInput placeholder="Name" value={newPerson.name} onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })} />
          <Select value={newPerson.relation} onChange={(v) => setNewPerson({ ...newPerson, relation: v })} className="!w-32">{['self', 'spouse', 'son', 'daughter', 'father', 'mother', 'other'].map((r) => <option key={r}>{r}</option>)}</Select>
          <Button size="sm" variant="secondary" onClick={async () => {
            if (!newPerson.name) return;
            try { const r = await financeApi.createPerson(newPerson); setF({ ...f, members: [...f.members, r.person.id] }); setNewPerson({ name: '', relation: 'self' }); people.reload(); } catch (e) { toastError(e); }
          }}><UserPlus className="w-3.5 h-3.5" /></Button>
        </div>
      </div>
      <Field label="Notes"><TextArea value={f.notes} onChange={set('notes')} placeholder="Waiting periods, exclusions, network hospitals…" /></Field>
    </Sheet>
  );
}

function PolicyIcon({ p }: { p: Policy }) {
  if (p.type === 'health') return <HeartPulse className="w-4 h-4" />;
  if (p.type === 'vehicle') return /car/i.test(p.planName) ? <Car className="w-4 h-4" /> : <Bike className="w-4 h-4" />;
  return <Shield className="w-4 h-4" />;
}

/** Extraction (from the server) -> fields for the policy form. */
export function prefillFromExtraction(x: PolicyExtraction): Partial<Policy> {
  return {
    insurer: x.insurer || '', policyNumber: x.policyNumber || '', type: x.type || 'other', planName: x.planName || '',
    vehicleNumber: x.vehicleNumber || '', sumInsuredPaise: x.sumInsuredPaise || 0, premiumPaise: x.premiumPaise || 0,
    startDate: x.startDate, renewalDate: x.endDate, nominee: x.nominee || '', premiumFrequency: 'yearly', status: 'active',
    taxSection: x.type === 'health' ? '80D' : x.type === 'life' || x.type === 'term_life' ? '80C' : null,
    insuredMemberIds: [], agent: {}, claimHelpline: '', tpa: '', paymentMode: '', notes: '', documentIds: [], premiumTransactionIds: [],
  };
}

/** Passwords for locked policy PDFs, tried automatically on new emails. Write-only. */
function PdfPasswords() {
  const { data, reload } = useAsync(() => financeApi.docPasswords(), []);
  const [label, setLabel] = useState('');
  const [password, setPassword] = useState('');
  return (
    <Card className="flex flex-col gap-2">
      <SectionTitle><span className="inline-flex items-center gap-1"><KeyRound className="w-3.5 h-3.5" /> PDF passwords</span></SectionTitle>
      <p className="text-[11px] text-[#736F6A]">Some insurers lock policy PDFs (often with your date of birth). Save the password once; new policy emails are opened with it automatically. Stored encrypted and never shown again.</p>
      {(data?.passwords || []).map((p) => (
        <div key={p.id} className="flex items-center justify-between text-xs">
          <span>{p.label} · ••••••</span>
          <button type="button" aria-label="Delete password" className="p-1 text-[#A39E98] hover:text-[#C86D51] cursor-pointer" onClick={async () => { await financeApi.deleteDocPassword(p.id); reload(); }}><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <div className="flex gap-2">
        <TextInput placeholder="Label, e.g. Acko (DOB)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <TextInput type="password" autoComplete="off" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button size="sm" disabled={!label || !password} onClick={async () => {
          try { await financeApi.addDocPassword(label, password); setLabel(''); setPassword(''); toastOk('Saved'); reload(); } catch (e) { toastError(e); }
        }}>Save</Button>
      </div>
    </Card>
  );
}
