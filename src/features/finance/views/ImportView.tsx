import React, { useState } from 'react';
import { ClipboardPaste, Download, Mail } from 'lucide-react';
import { financeApi, saveBlob } from '../api';
import { Button, Card, Field, SectionTitle, TextArea, TextInput, toastError, toastOk } from '../components/ui';
import type { FinanceTab } from '../types';
import AutoImport from '../components/AutoImport';

export default function ImportView({ onNavigate }: { onNavigate: (tab: FinanceTab) => void }) {
  const [text, setText] = useState('');
  const [sender, setSender] = useState('');
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await financeApi.ingestManual({ text, sender, subject });
      const msg = r.status === 'parsed' ? `Added ${r.transactionIds.length} transaction(s)` : r.status === 'ignored' ? `Ignored (${r.reviewReason || r.detectedType})` : 'Sent to the review queue to fill in';
      setResult(msg);
      toastOk(msg);
      setText('');
    } catch (e: any) {
      if (e?.status === 409) setResult('Already imported');
      else toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2">
        <SectionTitle>Automatic import</SectionTitle>
        <AutoImport />
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionTitle><span className="inline-flex items-center gap-1"><ClipboardPaste className="w-3.5 h-3.5" /> Paste an email or SMS</span></SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="From (optional)" hint="e.g. bankalerts@kotak.bank.in - helps pick the right reader"><TextInput value={sender} onChange={(e) => setSender(e.target.value)} /></Field>
          <Field label="Subject (optional)"><TextInput value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        </div>
        <Field label="Message"><TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder="Your transaction of Rs.331.00 on FLIPKART PAYMENTS using Kotak Bank Debit Card XX2797…" /></Field>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-[#736F6A]">{result}</span>
          <div className="flex gap-2">
            {result && <Button variant="secondary" size="sm" onClick={() => onNavigate('review')}>Open review</Button>}
            <Button busy={busy} disabled={text.trim().length < 5} onClick={submit}>Import</Button>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-2 text-xs">
        <SectionTitle><span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Gmail script (optional alternative)</span></SectionTitle>
        <p className="text-[#736F6A]">A small Google Apps Script in your Gmail pushes bank and payment emails to Tabby every 10 minutes, signed so nobody else can post to your ledger. It's free and never shares your Gmail login.</p>
        <ol className="list-decimal pl-5 text-[#736F6A] flex flex-col gap-1">
          <li>On Render set <code>INGEST_HMAC_SECRET</code> and <code>INGEST_OWNER_EMAIL</code> (your Google sign-in email).</li>
          <li>Create a project at script.google.com and paste <code>tools/apps-script/Code.gs</code> from the repo.</li>
          <li>Add Script Properties <code>TABBY_INGEST_URL</code> and <code>TABBY_HMAC_SECRET</code>, run <code>installTrigger</code>, then <code>backfill('2026-11-01')</code>.</li>
        </ol>
        <p className="text-[#A39E98]">Full steps: tools/apps-script/README.md</p>
      </Card>

      <Card className="flex items-center justify-between gap-2 text-xs">
        <div><b>Export my finance data</b><div className="text-[#736F6A]">Everything as JSON (no passwords or email bodies) - keep it as a backup.</div></div>
        <Button variant="secondary" size="sm" onClick={async () => { try { saveBlob(await financeApi.exportAll(), `tabby-finance-${new Date().toISOString().slice(0, 10)}.json`); } catch (e) { toastError(e); } }}><Download className="w-3.5 h-3.5" /> Export</Button>
      </Card>
    </div>
  );
}
