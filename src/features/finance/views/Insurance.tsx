import React, { useState } from 'react';
import { Download, FileText, HeartPulse, Link2, Plus, Shield, Trash2, Upload, UserPlus } from 'lucide-react';
import { financeApi, saveBlob } from '../api';
import { Badge, Button, Card, Empty, ErrorBlock, Field, Money, SectionTitle, Select, Sheet, Spinner, TextArea, TextInput, fmtDate, toDateInput, toastError, toastOk, useAsync } from '../components/ui';
import { formatPaise, paiseToInput, rupeesToPaise } from '../../../utils/currency';
import type { Claim, Person, Policy, PolicyType } from '../types';

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

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  const policies = data?.policies || [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end"><Button size="sm" onClick={() => setEditing('new')}><Plus className="w-3.5 h-3.5" /> Add policy</Button></div>
      {policies.length === 0 ? (
        <Empty title="No policies yet" text="Add each health, life, vehicle or travel policy with its renewal date and premium. Tabby reminds you 30, 7 and 1 days before renewal and links premium payments automatically." action={<Button onClick={() => setEditing('new')}>Add policy</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {policies.map((p) => (
            <Card key={p.id} onClick={() => setOpenId(p.id)} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#EBF1ED] text-[#3C5A48] flex items-center justify-center shrink-0">{p.type === 'health' ? <HeartPulse className="w-4 h-4" /> : <Shield className="w-4 h-4" />}</div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{p.insurer}</div>
                    <div className="text-[11px] text-[#736F6A] truncate">{TYPE_LABEL[p.type]}{p.planName ? ` · ${p.planName}` : ''}{p.policyNumber ? ` · ${p.policyNumber}` : ''}</div>
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

      {openId && <PolicyDetail id={openId} onClose={() => setOpenId(null)} onEdit={(p) => { setOpenId(null); setEditing(p); }} onChanged={() => { reload(); tax.reload(); }} />}
      {editing && <PolicyForm policy={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); tax.reload(); }} />}
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
    ['Policy number', p.policyNumber || '—'], ['Plan', p.planName || '—'], ['Sum insured', formatPaise(p.sumInsuredPaise)],
    ['Premium', `${formatPaise(p.premiumPaise)} ${p.premiumFrequency.replace('_', ' ')}`], ['Start', fmtDate(p.startDate) || '—'], ['Renewal', fmtDate(p.renewalDate) || '—'],
    ['Nominee', p.nominee || '—'], ['Payment mode', p.paymentMode || '—'], ['TPA', p.tpa || '—'], ['Claim helpline', p.claimHelpline || '—'],
    ['Agent', [p.agent?.name, p.agent?.phone, p.agent?.email].filter(Boolean).join(' · ') || '—'], ['Tax section', p.taxSection || '—'],
  ];

  return (
    <Sheet title={`${p.insurer} · ${TYPE_LABEL[p.type]}`} onClose={onClose} wide footer={<>
      <Button variant="danger" onClick={async () => { if (window.confirm('Delete this policy? Its documents are kept.')) { await financeApi.deletePolicy(p.id); onChanged(); onClose(); } }}>Delete</Button>
      <Button variant="secondary" onClick={() => onEdit(p)}>Edit</Button>
    </>}>
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

function PolicyForm({ policy, onClose, onSaved }: { policy: Policy | null; onClose: () => void; onSaved: () => void }) {
  const people = useAsync(() => financeApi.people(), []);
  const [f, setF] = useState({
    insurer: policy?.insurer || '', policyNumber: policy?.policyNumber || '', type: policy?.type || 'health', planName: policy?.planName || '',
    sumInsured: policy ? paiseToInput(policy.sumInsuredPaise) : '', premium: policy ? paiseToInput(policy.premiumPaise) : '',
    premiumFrequency: policy?.premiumFrequency || 'yearly', paymentMode: policy?.paymentMode || '', startDate: toDateInput(policy?.startDate),
    renewalDate: toDateInput(policy?.renewalDate), status: policy?.status || 'active', nominee: policy?.nominee || '', tpa: policy?.tpa || '',
    claimHelpline: policy?.claimHelpline || '', agentName: policy?.agent?.name || '', agentPhone: policy?.agent?.phone || '', agentEmail: policy?.agent?.email || '',
    taxSection: policy?.taxSection || '', notes: policy?.notes || '', members: policy?.insuredMemberIds || [] as string[],
  });
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
      taxSection: f.taxSection || null, notes: f.notes, insuredMemberIds: f.members,
    };
    setBusy(true);
    try {
      if (policy) await financeApi.updatePolicy(policy.id, body);
      else await financeApi.createPolicy(body);
      toastOk('Policy saved');
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={policy ? `Edit ${policy.insurer}` : 'Add policy'} onClose={onClose} wide footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Insurer"><TextInput value={f.insurer} onChange={set('insurer')} placeholder="Care Health Insurance" /></Field>
        <Field label="Type"><Select value={f.type} onChange={(v) => setF({ ...f, type: v as any })}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Policy number"><TextInput value={f.policyNumber} onChange={set('policyNumber')} /></Field>
        <Field label="Plan"><TextInput value={f.planName} onChange={set('planName')} /></Field>
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
