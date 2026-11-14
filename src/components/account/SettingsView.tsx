import Avatar from './Avatar';
import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Bell, Database, Download, ExternalLink, Info, LogOut, Mail, RefreshCw, ShieldAlert, SlidersHorizontal, Trash2, UserRound, Wallet,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { usePrefsStore } from '../../store/usePrefsStore';
import { useToastStore } from '../../store/useToastStore';
import { logoutAllApi, AlertChannel } from '../../lib/api';
import { SUPPORTED_CURRENCIES, paiseToInput, rupeesToPaise } from '../../utils/currency';
import { exportExpensesToCSV } from '../../utils/export';
import { APK_DOWNLOAD_URL, RELEASES_URL, currentAppVersion } from '../../lib/appVersion';
import { BUILD_INFO, type UpdateCheckResult } from '../../hooks/useLiveUpdate';
import { financeApi, saveBlob } from '../../features/finance/api';
import { openExternal } from '../../features/finance/insurers';
import { Badge, Button, Card, Field, Select, TextInput, fmtDate, useAsync } from '../../features/finance/components/ui';
import type { SettingsSection } from './ProfileMenu';
import type { FinanceTab } from '../../features/finance/types';

const SECTIONS: { id: SettingsSection; label: string; icon: React.ReactNode; signedInOnly?: boolean }[] = [
  { id: 'account', label: 'Account', icon: <UserRound className="w-4 h-4" />, signedInOnly: true },
  { id: 'preferences', label: 'Preferences', icon: <SlidersHorizontal className="w-4 h-4" /> },
  { id: 'money', label: 'Money', icon: <Wallet className="w-4 h-4" />, signedInOnly: true },
  { id: 'notifications', label: 'Alerts & emails', icon: <Bell className="w-4 h-4" />, signedInOnly: true },
  { id: 'data', label: 'Data & privacy', icon: <Database className="w-4 h-4" /> },
  { id: 'about', label: 'About', icon: <Info className="w-4 h-4" /> },
];

const ALERT_GROUPS: { id: string; label: string; hint: string; def: AlertChannel }[] = [
  { id: 'renewals', label: 'Policy renewals', hint: '30, 7 and 1 day before', def: 'email' },
  { id: 'commitments', label: 'EMIs, SIPs & subscriptions', hint: 'Due soon, missed, failed, needs action', def: 'email' },
  { id: 'declined', label: 'Declined payments', hint: 'A card or UPI payment was declined', def: 'email' },
  { id: 'large_debit', label: 'Large payments', hint: 'Above your threshold (Money section)', def: 'email' },
  { id: 'refunds', label: 'Overdue refunds', hint: 'Promised refund has not arrived', def: 'email' },
  { id: 'documents', label: 'Expiring documents', hint: 'Warranty, PUC, licence, passport', def: 'email' },
  { id: 'statements', label: 'Statements', hint: "Doesn't add up / password needed", def: 'email' },
  { id: 'policies', label: 'New policies filed', hint: 'Insurance read from your email', def: 'email' },
  { id: 'new_accounts', label: 'Unknown account or card', hint: 'An email mentions a card you have not added', def: 'app' },
];

export default function SettingsView({ section, onBack, onNavigateFinance, liveUpdate }: {
  section?: SettingsSection;
  onBack: () => void;
  onNavigateFinance: (tab: FinanceTab) => void;
  liveUpdate: LiveUpdateProps;
}) {
  const { currentUser, authStatus, currency, setCurrency, updateProfile, signOut, resetData, expenses, groups, users } = useAppStore();
  const { prefs, save, load } = usePrefsStore();
  const demo = authStatus === 'demo';
  const sections = SECTIONS.filter((s) => !(demo && s.signedInOnly));

  useEffect(() => { if (!demo) void load(); }, [demo]);
  useEffect(() => {
    if (section) setTimeout(() => document.getElementById(`settings-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [section]);

  if (!currentUser) return null;

  return (
    <div className="flex flex-col gap-4 max-w-2xl" id="settings-view">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-[#F2EFEA] cursor-pointer" aria-label="Back"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-xl font-extrabold">Settings</h1>
      </div>

      <div className="-mx-3.5 sm:mx-0 px-3.5 sm:px-0 overflow-x-auto no-scrollbar">
        <div className="flex gap-1.5 w-max">
          {sections.map((s) => (
            <button key={s.id} type="button" onClick={() => document.getElementById(`settings-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border cursor-pointer bg-white text-[#736F6A] border-[#E6E1DA] hover:text-[#2C2B29] inline-flex items-center gap-1.5">
              {s.icon}{s.label}
            </button>
          ))}
        </div>
      </div>

      {!demo && <AccountSection />}

      <Section id="preferences" title="Preferences" icon={<SlidersHorizontal className="w-4 h-4" />}>
        <Field label="Currency for shared expenses" hint="Money (bank) amounts are always shown in their own currency">
          <Select value={currency} onChange={(v) => { setCurrency(v); if (!demo) void save({ currency: v }); else useToastStore.getState().addToast('Saved', 'success'); }}>
            {SUPPORTED_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </Select>
        </Field>
        {!demo && (
          <>
            <Field label="Open the app on">
              <Segmented value={prefs.homeView || 'dashboard'} options={[['dashboard', 'Shared expenses'], ['money', 'Money']]} onChange={(v) => save({ homeView: v as any })} />
            </Field>
            <Field label="Year in reports and premium totals">
              <Segmented value={prefs.reportBasis || 'fy'} options={[['fy', 'Financial year (Apr–Mar)'], ['calendar', 'Calendar year']]} onChange={(v) => save({ reportBasis: v as any })} />
            </Field>
          </>
        )}
      </Section>

      {!demo && <MoneySection onNavigateFinance={onNavigateFinance} />}
      {!demo && <AlertsSection />}

      <Section id="data" title="Data & privacy" icon={<Database className="w-4 h-4" />}>
        <Row title="Export shared expenses" text="All your group and friend expenses as CSV">
          <Button size="sm" variant="secondary" onClick={() => exportExpensesToCSV(expenses, groups, users, currency)}><Download className="w-3.5 h-3.5" /> CSV</Button>
        </Row>
        {!demo && (
          <Row title="Export Money data" text="Accounts, transactions, policies, documents list… as JSON (no passwords or email bodies)">
            <Button size="sm" variant="secondary" onClick={async () => { try { saveBlob(await financeApi.exportAll(), `tabby-finance-${new Date().toISOString().slice(0, 10)}.json`); } catch (e: any) { useToastStore.getState().addToast(e.message, 'error'); } }}><Download className="w-3.5 h-3.5" /> JSON</Button>
          </Row>
        )}
        <Row title={demo ? 'Reset demo data' : 'Reload from server'} text={demo ? 'Restore the sample groups and expenses' : 'Download your data again. Nothing on the server changes.'}>
          <Button size="sm" variant="secondary" onClick={() => { resetData(); useToastStore.getState().addToast(demo ? 'Demo data restored' : 'Reloading…', 'info'); }}><RefreshCw className="w-3.5 h-3.5" /> {demo ? 'Reset' : 'Reload'}</Button>
        </Row>
        {!demo && (
          <Row title="Clear this device" text="Removes the copy of your data stored on this phone/browser. Changes still waiting to sync are kept.">
            <Button size="sm" variant="secondary" onClick={() => {
              if (!window.confirm('Clear the data cached on this device? It downloads again from your account.')) return;
              try {
                for (let i = localStorage.length - 1; i >= 0; i--) {
                  const k = localStorage.key(i);
                  if (k && (k.startsWith('tabby_data_') || k === 'tabby_prefs')) localStorage.removeItem(k);
                }
              } catch { /* ignore */ }
              resetData();
              useToastStore.getState().addToast('Cleared from this device', 'success');
            }}><Trash2 className="w-3.5 h-3.5" /> Clear</Button>
          </Row>
        )}
        <p className="text-[11px] text-[#736F6A]">Your Money data is private to your Google account. Documents, email bodies and statement passwords are encrypted; email bodies are deleted after 30 days; OTP emails are never stored.</p>
      </Section>

      <AboutSection liveUpdate={liveUpdate} />

      <Section id="signout" title={demo ? 'Demo mode' : 'Sign out'} icon={<LogOut className="w-4 h-4" />}>
        <Row title={demo ? 'Leave demo mode' : 'Sign out'} text={demo ? 'Go back to the sign-in screen' : `Signed in as ${currentUser.email}`}>
          <Button size="sm" variant="danger" onClick={signOut}><LogOut className="w-3.5 h-3.5" /> {demo ? 'Exit demo' : 'Sign out'}</Button>
        </Row>
        {!demo && (
          <Row title="Sign out of all devices" text="Lost your phone? This ends every session, including this one.">
            <Button size="sm" variant="danger" onClick={async () => {
              if (!window.confirm('Sign out on every device, including this one?')) return;
              try { await logoutAllApi(); } catch (e: any) { useToastStore.getState().addToast(e.message, 'error'); return; }
              signOut();
              useToastStore.getState().addToast('Signed out everywhere', 'success');
            }}><ShieldAlert className="w-3.5 h-3.5" /> All devices</Button>
          </Row>
        )}
      </Section>
    </div>
  );

  function AccountSection() {
    const [name, setName] = useState(currentUser!.name);
    const [phone, setPhone] = useState(currentUser!.phone || '');
    const commit = (field: 'name' | 'phone', value: string) => {
      const v = value.trim();
      if (field === 'name' && !v) { setName(currentUser!.name); return; }
      if ((currentUser as any)[field] === v || ((currentUser as any)[field] || '') === v) return;
      updateProfile({ [field]: v });
      useToastStore.getState().addToast('Saved', 'success');
    };
    return (
      <Section id="account" title="Account" icon={<UserRound className="w-4 h-4" />}>
        <div className="flex items-center gap-3">
          <Avatar src={currentUser!.avatar} name={currentUser!.name} className="w-14 h-14" />
          <div className="min-w-0">
            <div className="text-sm font-extrabold truncate">{currentUser!.name}</div>
            <div className="text-[11px] text-[#736F6A] truncate">{currentUser!.email}</div>
            <Badge tone="green">Signed in with Google</Badge>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name" hint="Shown to friends in shared expenses"><TextInput value={name} onChange={(e) => setName(e.target.value)} onBlur={() => commit('name', name)} /></Field>
          <Field label="Phone" hint="Only your friends can see it"><TextInput inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => commit('phone', phone)} placeholder="+91…" /></Field>
          <Field label="Email" hint="Comes from your Google account"><TextInput value={currentUser!.email} readOnly className="bg-[#FAF8F5] text-[#736F6A]" /></Field>
        </div>
      </Section>
    );
  }

  function MoneySection({ onNavigateFinance }: { onNavigateFinance: (tab: FinanceTab) => void }) {
    const status = useAsync(() => financeApi.ingestStatus(), []);
    const [threshold, setThreshold] = useState(prefs.largeDebitPaise ? paiseToInput(prefs.largeDebitPaise) : '');
    const s = status.data;
    const lastAgo = s?.lastReceivedAt ? Math.round((Date.now() - new Date(s.lastReceivedAt).getTime()) / 3_600_000) : null;
    return (
      <Section id="money" title="Money" icon={<Wallet className="w-4 h-4" />}>
        <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E6E1DA] flex flex-col gap-1 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Gmail import</span>
            {!s ? <Badge>Checking…</Badge> : !s.configured ? <Badge tone="red">Not set up</Badge> : !s.isIngestOwner ? <Badge tone="amber">Another account</Badge> : lastAgo === null ? <Badge tone="amber">Waiting for first email</Badge> : lastAgo > 48 ? <Badge tone="amber">Quiet for {Math.round(lastAgo / 24)} days</Badge> : <Badge tone="green">Working</Badge>}
          </div>
          {s && (
            <span className="text-[#736F6A]">
              {s.lastReceivedAt ? <>Last email {fmtDate(s.lastReceivedAt, true)}{s.lastSubject ? ` · "${s.lastSubject.slice(0, 50)}"` : ''}. </> : null}
              {s.emailsThisWeek} this week · {s.emailsTotal} total · {s.needsReview} to review.
              {!s.configured && ' Set INGEST_HMAC_SECRET on the server and install the Gmail script (Money → Import).'}
              {s.configured && !s.isIngestOwner && ' Gmail import is linked to a different Tabby account (INGEST_OWNER_EMAIL).'}
            </span>
          )}
          {s && (
            <div className="flex gap-1 flex-wrap mt-1">
              <Badge tone={s.features.encryption ? 'green' : 'red'}>Encryption {s.features.encryption ? 'on' : 'off'}</Badge>
              <Badge tone={s.features.documentsStorage === 'r2' ? 'green' : 'amber'}>Files: {s.features.documentsStorage === 'r2' ? 'Cloudflare R2' : s.features.documentsStorage}</Badge>
              <Badge tone={s.features.alertEmails ? 'green' : 'neutral'}>Alert emails {s.features.alertEmails ? 'on' : 'off'}</Badge>
              <Badge tone={s.features.aiBackup ? 'blue' : 'neutral'}>AI backup {s.features.aiBackup ? 'on' : 'off'}</Badge>
            </div>
          )}
        </div>
        <Field label="Large payment alert (₹)" hint="Alert when one payment is at least this much. Empty = ₹25,000.">
          <TextInput inputMode="decimal" value={threshold} placeholder="25000" onChange={(e) => setThreshold(e.target.value)}
            onBlur={() => {
              const v = threshold.trim() ? rupeesToPaise(threshold) : null;
              if (threshold.trim() && !v) { useToastStore.getState().addToast('Enter an amount like 25000', 'error'); return; }
              if ((v ?? null) !== (prefs.largeDebitPaise ?? null)) void save({ largeDebitPaise: v });
            }} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          {([['accounts', 'Accounts & statements'], ['categories', 'Categories & budgets'], ['insurance', 'PDF passwords'], ['import', 'Gmail setup & import']] as [FinanceTab, string][]).map(([tab, label]) => (
            <Button key={tab} size="sm" variant="secondary" onClick={() => onNavigateFinance(tab)}>{label}</Button>
          ))}
        </div>
      </Section>
    );
  }

  function AlertsSection() {
    const status = useAsync(() => financeApi.ingestStatus(), []);
    const emailsOn = status.data?.features.alertEmails;
    return (
      <Section id="notifications" title="Alerts & emails" icon={<Bell className="w-4 h-4" />}>
        <p className="text-[11px] text-[#736F6A]">Choose for each kind of alert: off, in the app only, or in the app and by email ({currentUser!.email}).</p>
        {status.data && !emailsOn && <p className="text-[11px] text-[#8A5A00] bg-[#FFF8E6] rounded-lg px-2 py-1.5">Emails aren't being sent yet: the server needs RESEND_API_KEY. In-app alerts work.</p>}
        <div className="flex flex-col divide-y divide-[#F2EFEA]">
          {ALERT_GROUPS.map((g) => (
            <div key={g.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0"><div className="text-xs font-bold">{g.label}</div><div className="text-[11px] text-[#736F6A]">{g.hint}</div></div>
              <Segmented compact value={prefs.alerts?.[g.id] || g.def} options={[['off', 'Off'], ['app', 'App'], ['email', 'Email']]} onChange={(v) => save({ alerts: { [g.id]: v as AlertChannel } })} />
            </div>
          ))}
        </div>
      </Section>
    );
  }
}

type LiveUpdateProps = {
  checkForUpdate: (manual?: boolean) => Promise<UpdateCheckResult>;
  isUpdateAvailable: boolean;
  latestVersion: string | null;
  currentVersion?: string | null;
  applyUpdate: () => void;
  isDownloading: boolean;
};

function AboutSection({ liveUpdate }: { liveUpdate: LiveUpdateProps }) {
  const [version, setVersion] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  useEffect(() => { void currentAppVersion().then(setVersion); }, []);
  return (
    <Section id="about" title="About & app updates" icon={<Info className="w-4 h-4" />}>
      <div className="p-3 bg-[#FAF8F5] border border-[#E6E1DA] rounded-xl flex flex-col gap-1 text-xs text-[#736F6A]">
        <div className="flex justify-between gap-2"><span>Installed version</span><b className="text-[#2C2B29]" id="settings-installed-version">{version}</b></div>
        {BUILD_INFO.commit && <div className="flex justify-between gap-2"><span>Commit</span><span className="font-mono text-[#2C2B29]">{BUILD_INFO.commit.slice(0, 7)}</span></div>}
        {BUILD_INFO.buildDate && <div className="flex justify-between gap-2"><span>Built</span><span className="text-[#2C2B29]">{fmtDate(BUILD_INFO.buildDate, true)}</span></div>}
      </div>
      {liveUpdate.isUpdateAvailable && liveUpdate.latestVersion ? (
        <Button busy={liveUpdate.isDownloading} onClick={liveUpdate.applyUpdate}><Download className="w-3.5 h-3.5" /> Install v{liveUpdate.latestVersion}</Button>
      ) : (
        <Button variant="secondary" busy={checking} onClick={async () => {
          setChecking(true);
          setResult(null);
          try { setResult(await liveUpdate.checkForUpdate(true)); } finally { setChecking(false); }
        }}><RefreshCw className="w-3.5 h-3.5" /> Check for updates</Button>
      )}
      {result === 'up-to-date' && <span className="text-[11px] text-[#3C5A48]">You're on the latest version.</span>}
      {result === 'error' && <span className="text-[11px] text-[#C86D51]">Couldn't check for updates. Check your connection and try again.</span>}
      <Row title="All versions & what changed" text="Every build is a release with its notes">
        <Button size="sm" variant="secondary" onClick={() => openExternal(RELEASES_URL)}><ExternalLink className="w-3.5 h-3.5" /> Releases</Button>
      </Row>
      <Row title="Android app (APK)" text="Updates arrive inside the app. A new APK is only needed for new app icons or phone features.">
        <Button size="sm" variant="secondary" onClick={() => openExternal(APK_DOWNLOAD_URL)}><ExternalLink className="w-3.5 h-3.5" /> APK builds</Button>
      </Row>
    </Section>
  );
}

function Section({ id, title, icon, children }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={`settings-${id}`} className="scroll-mt-20">
      <Card className="flex flex-col gap-3">
        <h2 className="text-xs font-bold text-[#736F6A] uppercase tracking-wider flex items-center gap-1.5">{icon}{title}</h2>
        {children}
      </Card>
    </section>
  );
}

function Row({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0"><div className="text-xs font-bold">{title}</div><div className="text-[11px] text-[#736F6A]">{text}</div></div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented({ value, options, onChange, compact }: { value: string; options: [string, string][]; onChange: (v: string) => void; compact?: boolean }) {
  return (
    <div className={`inline-flex rounded-xl border border-[#E6E1DA] p-0.5 bg-[#FAF8F5] ${compact ? '' : 'self-start flex-wrap'}`}>
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => v !== value && onChange(v)}
          className={`${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-[11px]'} font-bold rounded-lg cursor-pointer ${value === v ? 'bg-white shadow-xs text-[#3C5A48]' : 'text-[#736F6A]'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
