import React, { useState } from 'react';
import { Check, EyeOff, FileSearch, Loader2, MailX, Shield, Tag } from 'lucide-react';
import { PolicyForm, prefillFromExtraction } from './Insurance';
import { documentToText } from '../ocr';
import type { Policy } from '../types';
import { financeApi } from '../api';
import { useFinanceStore } from '../store';
import {
  AccountSelect, Badge, Button, Card, CategorySelect, Empty, ErrorBlock, Field, Money, SectionTitle, Select, Spinner, TextInput,
  fmtDate, toastError, toastOk, useAsync,
} from '../components/ui';
import { formatPaise, paiseToInput, rupeesToPaise } from '../../../utils/currency';
import type { FinanceTab, ReviewEvent, Transaction } from '../types';

export default function ReviewQueue({ onNavigate }: { onNavigate: (tab: FinanceTab, params?: Record<string, string>) => void }) {
  const { data, error, loading, reload } = useAsync(() => financeApi.review(), []);
  const setReviewCount = useFinanceStore((s) => s.setReviewCount);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;
  setReviewCount(data.events.length + data.uncategorised.length + data.statements.length);

  const done = data.events.length + data.uncategorised.length + data.statements.length === 0;
  return (
    <div className="flex flex-col gap-4">
      {done && <Empty title="Nothing to review" text="Emails Tabby couldn't read, new accounts and uncategorised payments show up here." />}

      {data.statements.length > 0 && (
        <div>
          <SectionTitle>Statements that don't add up</SectionTitle>
          <div className="flex flex-col gap-2">
            {data.statements.map((s) => (
              <Card key={s.id} onClick={() => onNavigate('accounts', { statement: s.id })}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">{fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)}</span>
                  <Badge tone="red">Off by {formatPaise(Math.abs(s.mismatchPaise))}</Badge>
                </div>
                {s.issues.slice(0, 3).map((i) => <div key={i.line} className="text-[11px] text-[#736F6A] mt-1">{i.message}</div>)}
              </Card>
            ))}
          </div>
        </div>
      )}

      {data.events.length > 0 && (
        <div>
          <SectionTitle>Emails to check ({data.events.length})</SectionTitle>
          <div className="flex flex-col gap-2">
            {data.events.map((e) => <EventCard key={e.id} e={e} onDone={reload} />)}
          </div>
        </div>
      )}

      {data.uncategorised.length > 0 && (
        <div>
          <SectionTitle>Uncategorised payments ({data.uncategorised.length})</SectionTitle>
          <Card className="!p-0 divide-y divide-[#F2EFEA]">
            {data.uncategorised.map((t) => <QuickCategorise key={t.id} t={t} onDone={reload} />)}
          </Card>
          <p className="text-[10px] text-[#A39E98] mt-1 px-1">Each choice becomes a rule, so the same merchant is categorised automatically next time.</p>
        </div>
      )}
    </div>
  );
}

function EventCard({ e, onDone }: { key?: string; e: ReviewEvent; onDone: () => void }) {
  const { accounts, categories } = useFinanceStore();
  const ext = e.extracted || {};
  const t: Transaction | undefined = e.transactions[0];
  const [amount, setAmount] = useState(t ? paiseToInput(t.amountPaise) : ext.amountPaise ? paiseToInput(ext.amountPaise) : '');
  const [direction, setDirection] = useState<'debit' | 'credit'>(t?.direction || ext.direction || 'debit');
  const [merchant, setMerchant] = useState(t?.merchant || ext.merchant || '');
  const [accountId, setAccountId] = useState<string | null>(t?.accountId || null);
  const [categoryId, setCategoryId] = useState<string | null>(t?.categoryId || null);
  const [showBody, setShowBody] = useState(false);
  const [busy, setBusy] = useState(false);
  const isPolicy = e.detectedType === 'policy' || e.reason.startsWith('policy_');
  const isMoney = !isPolicy && !['statement_email', 'statement_password_needed', 'order_waiting_for_payment'].includes(e.reason);
  const [policyDraft, setPolicyDraft] = useState<{ prefill: Partial<Policy>; note: string } | null>(null);
  const [reading, setReading] = useState<string | null>(null);

  const createPolicy = async () => {
    setReading('Reading…');
    try {
      let text: string | undefined;
      const pdf = e.attachments.find((a) => a.mimeType === 'application/pdf' || a.mimeType.startsWith('image/'));
      if (pdf && e.reason !== 'policy_suggestion') {
        // Scanned or locked PDF: open and read it here on the phone.
        const blob = await financeApi.downloadDocument(pdf.documentId);
        const file = new File([blob], pdf.filename, { type: pdf.mimeType });
        text = (await documentToText(file, {
          progress: setReading,
          askPassword: async (wrong) => window.prompt(wrong ? 'Wrong password. Try again:' : 'This PDF is locked. Enter its password (often your date of birth, e.g. 01011990):'),
        })).text;
      }
      setReading('Finding the policy details…');
      const { extraction } = await financeApi.extractPolicy({ rawEventId: e.id, ...(text ? { text } : {}) });
      setPolicyDraft({ prefill: prefillFromExtraction(extraction), note: `Filled ${extraction.found.length} field(s) from the email${text ? ' and its document' : ''}. Check and save; the document will be attached.` });
    } catch (err) {
      toastError(err);
    } finally {
      setReading(null);
    }
  };

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toastOk(msg);
      await useFinanceStore.getState().refreshCategories();
      onDone();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => act(() => financeApi.confirmReview(e.id, {
    ...(t ? {} : { amountPaise: rupeesToPaise(amount) || undefined, direction }),
    merchant: merchant || undefined, accountId, categoryId: categoryId ?? undefined,
  }), 'Confirmed');

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="text-xs font-bold">{e.subject || '(no subject)'}</div>
        <div className="text-[11px] text-[#736F6A] truncate">{e.sender} · {fmtDate(e.receivedAt, true)}</div>
        <div><Badge tone="amber">{e.reasonText}</Badge></div>
      </div>
      {e.bodyPreview && (
        <button type="button" className="text-left text-[11px] text-[#736F6A] bg-[#FAF8F5] rounded-lg px-2 py-1.5 cursor-pointer" onClick={() => setShowBody(!showBody)}>
          <span className={showBody ? 'whitespace-pre-wrap' : 'line-clamp-2'}>{e.bodyPreview}</span>
        </button>
      )}
      {isMoney && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {!t && (
            <>
              <Field label="Amount (₹)"><TextInput inputMode="decimal" value={amount} onChange={(x) => setAmount(x.target.value)} /></Field>
              <Field label="Type">
                <Select value={direction} onChange={(v) => setDirection(v as any)}><option value="debit">Money out</option><option value="credit">Money in</option></Select>
              </Field>
            </>
          )}
          {t && <Field label="Amount"><div className="py-2"><Money paise={t.amountPaise} direction={t.direction} className="text-xs" /></div></Field>}
          <Field label="Merchant"><TextInput value={merchant} onChange={(x) => setMerchant(x.target.value)} /></Field>
          <Field label="Account"><AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} /></Field>
          <Field label="Category"><CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} noneLabel="Auto" /></Field>
        </div>
      )}
      {e.reason === 'unknown_account' && <span className="text-[11px] text-[#736F6A]">Tip: add the account (with this last-4 number) under Accounts so future emails land there automatically.</span>}
      {isPolicy && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" busy={Boolean(reading)} onClick={createPolicy}>
            {e.reason === 'policy_scan_needed' ? <><FileSearch className="w-3.5 h-3.5" /> Scan & add policy</> : <><Shield className="w-3.5 h-3.5" /> Create policy</>}
          </Button>
          {reading && <span className="text-[11px] text-[#736F6A] inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />{reading}</span>}
          {e.reason === 'policy_password_needed' && <span className="text-[11px] text-[#736F6A]">Or save the PDF password under Insurance → PDF passwords.</span>}
        </div>
      )}
      {policyDraft && <PolicyForm policy={null} prefill={policyDraft.prefill} fromRawEventId={e.id} note={policyDraft.note} onClose={() => setPolicyDraft(null)} onSaved={() => { setPolicyDraft(null); toastOk('Policy saved'); onDone(); }} />}
      {e.reason === 'statement_password_needed' && <span className="text-[11px] text-[#736F6A]">Save the statement password on the account, then upload the PDF from Accounts.</span>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" busy={busy} onClick={() => act(() => financeApi.ignoreSender(e.id), 'Sender ignored')}><MailX className="w-3.5 h-3.5" /> Always ignore sender</Button>
        <Button size="sm" variant="secondary" busy={busy} onClick={() => act(() => financeApi.ignoreReview(e.id), 'Dismissed')}><EyeOff className="w-3.5 h-3.5" /> {isMoney ? 'Ignore' : 'Dismiss'}</Button>
        {isMoney && <Button size="sm" busy={busy} onClick={confirm}><Check className="w-3.5 h-3.5" /> Confirm</Button>}
      </div>
    </Card>
  );
}

function QuickCategorise({ t, onDone }: { key?: string; t: Transaction; onDone: () => void }) {
  const { categories } = useFinanceStore();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Tag className="w-3.5 h-3.5 text-[#A39E98] shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold truncate">{t.merchant || t.description || 'Payment'}</div>
        <div className="text-[11px] text-[#736F6A]">{fmtDate(t.postedAt)} · {formatPaise(t.amountPaise)}</div>
      </div>
      <div className="w-44">
        <CategorySelect categories={categories} value={null} noneLabel={busy ? 'Saving…' : 'Choose…'} onChange={async (id) => {
          if (!id) return;
          setBusy(true);
          try {
            await financeApi.updateTransaction(t.id, { categoryId: id });
            onDone();
          } catch (e) {
            toastError(e);
          } finally {
            setBusy(false);
          }
        }} />
      </div>
    </div>
  );
}
