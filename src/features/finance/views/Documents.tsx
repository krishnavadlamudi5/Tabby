import React, { useState } from 'react';
import { Download, FileText, Image, Lock, Search, Trash2, Upload } from 'lucide-react';
import { financeApi, saveBlob } from '../api';
import { Badge, Button, Card, Empty, ErrorBlock, Field, Select, Sheet, Spinner, TextInput, fmtDate, toastError, toastOk, useAsync } from '../components/ui';
import type { DocumentType, FinDocument } from '../types';

const TYPES: DocumentType[] = ['policy', 'renewal_notice', 'premium_receipt', 'tax_certificate', 'claim', 'statement', 'invoice', 'warranty', 'loan', 'id', 'other'];
const label = (t: string) => t.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function Documents() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const { data, error, loading, reload } = useAsync(() => financeApi.documents({ q: q.trim() || undefined, type: type || undefined }), [q, type]);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<FinDocument | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[11px] text-[#736F6A]"><Lock className="w-3.5 h-3.5" /> Files are encrypted before they're stored and only you can download them.</div>
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#A39E98]" />
          <TextInput className="pl-8" placeholder="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={type} onChange={setType} className="!w-40"><option value="">All types</option>{TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
        <Button onClick={() => setUploading(true)}><Upload className="w-3.5 h-3.5" /> Upload</Button>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorBlock message={error} onRetry={reload} />}
      {data && data.documents.length === 0 && <Empty title="No documents" text="Upload policies, invoices, warranties, loan papers and tax certificates. PDFs attached to bank emails land here automatically." />}
      {data && data.documents.length > 0 && (
        <Card className="!p-0 divide-y divide-[#F2EFEA]">
          {data.documents.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-3 py-2.5">
              {d.mimeType.startsWith('image/') ? <Image className="w-4 h-4 text-[#736F6A]" /> : <FileText className="w-4 h-4 text-[#736F6A]" />}
              <button type="button" className="flex-1 min-w-0 text-left cursor-pointer" onClick={() => setEditing(d)}>
                <div className="text-xs font-semibold truncate">{d.title}</div>
                <div className="text-[11px] text-[#736F6A]">{fmtDate(d.createdAt)} · {(d.sizeBytes / 1024).toFixed(0)} KB · {d.source === 'gmail' ? 'from Gmail' : 'uploaded'}{d.linkedTo.length ? ` · linked to ${d.linkedTo.map((l) => l.kind).join(', ')}` : ''}</div>
              </button>
              <Badge>{label(d.type)}</Badge>
              <button type="button" aria-label="Download" className="p-1 text-[#3C5A48] cursor-pointer" onClick={async () => { try { saveBlob(await financeApi.downloadDocument(d.id), d.filename || d.title); } catch (e) { toastError(e); } }}><Download className="w-4 h-4" /></button>
            </div>
          ))}
        </Card>
      )}
      {uploading && <UploadForm onClose={() => setUploading(false)} onDone={() => { setUploading(false); reload(); }} />}
      {editing && <EditForm doc={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function UploadForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<DocumentType>('other');
  const [busy, setBusy] = useState(false);
  const policies = useAsync(() => financeApi.policies(), []);
  const [policyId, setPolicyId] = useState('');
  return (
    <Sheet title="Upload document" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!file} onClick={async () => {
      if (!file) return;
      const form = new FormData();
      form.append('file', file);
      form.append('title', title || file.name);
      form.append('type', type);
      if (policyId) { form.append('linkKind', 'policy'); form.append('linkId', policyId); }
      setBusy(true);
      try { const r = await financeApi.uploadDocument(form); toastOk(r.existed ? 'Already in your vault' : 'Uploaded'); onDone(); } catch (e) { toastError(e); } finally { setBusy(false); }
    }}>Upload</Button></>}>
      <Field label="File" hint="PDF, JPG, PNG or HEIC up to 20 MB"><input type="file" accept="application/pdf,image/jpeg,image/png,image/heic" onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); if (f && !title) setTitle(f.name); }} className="text-xs" /></Field>
      <Field label="Title"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Type"><Select value={type} onChange={(v) => setType(v as DocumentType)}>{TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
      {(policies.data?.policies.length || 0) > 0 && (
        <Field label="Link to policy (optional)"><Select value={policyId} onChange={setPolicyId}><option value="">None</option>{policies.data!.policies.map((p) => <option key={p.id} value={p.id}>{p.insurer} {p.policyNumber}</option>)}</Select></Field>
      )}
    </Sheet>
  );
}

function EditForm({ doc, onClose, onDone }: { doc: FinDocument; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(doc.title);
  const [type, setType] = useState<DocumentType>(doc.type);
  const policies = useAsync(() => financeApi.policies(), []);
  return (
    <Sheet title={doc.title} onClose={onClose} footer={<>
      <Button variant="danger" onClick={async () => { if (window.confirm('Delete this document permanently?')) { await financeApi.deleteDocument(doc.id); onDone(); } }}><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
      <Button onClick={async () => { try { await financeApi.updateDocument(doc.id, { title, type }); onDone(); } catch (e) { toastError(e); } }}>Save</Button>
    </>}>
      <Field label="Title"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Type"><Select value={type} onChange={(v) => setType(v as DocumentType)}>{TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
      <div className="text-xs">
        <div className="text-[11px] font-bold mb-1">Linked to</div>
        {doc.linkedTo.length === 0 && <span className="text-[#736F6A]">Nothing yet.</span>}
        {doc.linkedTo.map((l) => (
          <div key={`${l.kind}-${l.id}`} className="flex justify-between items-center py-1">
            <span>{l.kind === 'policy' ? policies.data?.policies.find((p) => p.id === l.id)?.insurer || 'Policy' : l.kind}</span>
            <Button size="sm" variant="ghost" onClick={async () => { await financeApi.updateDocument(doc.id, { unlink: l }); onDone(); }}>Unlink</Button>
          </div>
        ))}
        {(policies.data?.policies.length || 0) > 0 && (
          <Select value="" onChange={async (id) => { if (id) { await financeApi.updateDocument(doc.id, { link: { kind: 'policy', id } }); onDone(); } }}>
            <option value="">Link to a policy…</option>
            {policies.data!.policies.map((p) => <option key={p.id} value={p.id}>{p.insurer} {p.policyNumber}</option>)}
          </Select>
        )}
      </div>
    </Sheet>
  );
}
