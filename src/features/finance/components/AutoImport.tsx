import React, { useEffect, useRef, useState } from 'react';
import { Mail, MessageSquare, RefreshCw } from 'lucide-react';
import { financeApi } from '../api';
import { openExternal } from '../insurers';
import { Badge, Button, fmtDate, toastError, toastOk, useAsync } from './ui';
import { useAppStore } from '../../../store/useAppStore';
import {
  SMS_BACKFILL_DAYS, disableSmsImport, isSmsImportEnabled, smsLastSyncedAt, smsSupported, syncSms,
} from '../sms';

/**
 * "Connect Gmail" and "Read bank SMS": automatic sources for the Money
 * ledger. Shown in Settings → Money and on the Import page.
 */
export default function AutoImport() {
  return (
    <div className="flex flex-col gap-2" id="auto-import">
      <GmailCard />
      {smsSupported() && <SmsCard />}
    </div>
  );
}

function Row({ icon, title, badge, children }: { icon: React.ReactNode; title: string; badge: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E6E1DA] flex flex-col gap-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold inline-flex items-center gap-1.5">{icon} {title}</span>
        {badge}
      </div>
      {children}
    </div>
  );
}

function GmailCard() {
  const status = useAsync(() => financeApi.gmailStatus(), []);
  const [busy, setBusy] = useState<'connect' | 'sync' | 'disconnect' | null>(null);
  const [waiting, setWaiting] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const s = status.data;

  // While the Google screen is open, check every few seconds for the link.
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    poll.current = setInterval(async () => {
      try {
        const next = await financeApi.gmailStatus();
        if (next.connected) {
          status.setData(next);
          setWaiting(false);
          toastOk(`Gmail connected${next.email ? `: ${next.email}` : ''}. Importing your bank emails…`);
        } else if (Date.now() - started > 5 * 60_000) {
          setWaiting(false);
        }
      } catch { /* keep waiting */ }
    }, 3000);
    return () => { if (poll.current) clearInterval(poll.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  // Refresh "Last checked" while the first import runs in the background.
  useEffect(() => {
    if (!s?.connected || s.lastSyncAt) return;
    const t = setTimeout(() => void status.reload(), 5000);
    return () => clearTimeout(t);
  }, [s, status]);

  const connect = async () => {
    setBusy('connect');
    try {
      const { url } = await financeApi.gmailConnect();
      await openExternal(url);
      setWaiting(true);
    } catch (e) {
      toastError(e, 'Could not start Gmail connect');
    } finally {
      setBusy(null);
    }
  };

  const syncNow = async () => {
    setBusy('sync');
    try {
      const r = await financeApi.gmailSync();
      if (r.error) toastError(new Error(r.error));
      else toastOk(r.imported ? `Imported ${r.imported} new email${r.imported === 1 ? '' : 's'}${r.remaining ? ` (${r.remaining} more next time)` : ''}` : 'Gmail is up to date');
      await status.reload();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect Gmail? Tabby will stop reading new emails. What was already imported stays.')) return;
    setBusy('disconnect');
    try {
      await financeApi.gmailDisconnect();
      await status.reload();
      toastOk('Gmail disconnected');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const badge = !s ? <Badge>Checking…</Badge>
    : s.connected ? (s.lastError ? <Badge tone="red">Needs attention</Badge> : <Badge tone="green">Connected</Badge>)
    : waiting ? <Badge tone="amber">Waiting for Google…</Badge>
    : <Badge>Off</Badge>;

  return (
    <Row icon={<Mail className="w-3.5 h-3.5" />} title="Gmail" badge={badge}>
      {s && !s.connected && (
        <>
          <p className="text-[#736F6A]">
            Reads bank, card and payment emails (read-only) and adds them to Money with a category. The first import covers the last {s.backfillDays} days. Tabby never sends, deletes or changes email.
          </p>
          {!s.available && <p className="text-[#A64B32]">Not set up on the server yet: it needs GOOGLE_CLIENT_SECRET and DATA_ENCRYPTION_KEY on Render.</p>}
          <div className="flex gap-2">
            <Button size="sm" busy={busy === 'connect'} disabled={!s.available} onClick={connect}>Connect Gmail</Button>
            {waiting && <Button size="sm" variant="secondary" onClick={() => void status.reload()}>I've approved it</Button>}
          </div>
        </>
      )}
      {s?.connected && (
        <>
          <p className="text-[#736F6A]">
            {s.email || 'Gmail'} · {s.lastSyncAt ? <>last checked {fmtDate(s.lastSyncAt, true)}</> : 'first import running…'} · {s.imported} email{s.imported === 1 ? '' : 's'} imported
          </p>
          {s.lastError && <p className="text-[#A64B32]">{s.lastError}</p>}
          <div className="flex gap-2 flex-wrap">
            {s.lastError
              ? <Button size="sm" busy={busy === 'connect'} onClick={connect}>Reconnect</Button>
              : <Button size="sm" variant="secondary" busy={busy === 'sync'} onClick={syncNow}><RefreshCw className="w-3.5 h-3.5" /> Sync now</Button>}
            <Button size="sm" variant="secondary" busy={busy === 'disconnect'} onClick={disconnect}>Disconnect</Button>
          </div>
        </>
      )}
    </Row>
  );
}

function SmsCard() {
  const userId = useAppStore((st) => st.currentUser?.id) || '';
  const [enabled, setEnabled] = useState(() => isSmsImportEnabled(userId));
  const [last, setLast] = useState<number | null>(() => smsLastSyncedAt(userId));
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const r = await syncSms(userId);
      setEnabled(true);
      setLast(smsLastSyncedAt(userId));
      toastOk(r.sent ? `Checked ${r.read} SMS · ${r.parsed} added${r.review ? ` · ${r.review} to review` : ''}` : 'No new bank SMS');
    } catch (e: any) {
      const denied = /permission|denied/i.test(String(e?.message || e));
      toastError(denied ? new Error('Tabby needs SMS permission to read bank alerts. Allow it in Android settings → Apps → Tabby → Permissions.') : e);
    } finally {
      setBusy(false);
    }
  };

  const turnOff = () => {
    disableSmsImport(userId);
    setEnabled(false);
    toastOk('SMS import turned off');
  };

  return (
    <Row icon={<MessageSquare className="w-3.5 h-3.5" />} title="Bank SMS" badge={enabled ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}>
      {!enabled ? (
        <>
          <p className="text-[#736F6A]">
            Reads bank and card alert SMS on this phone and adds them to Money with a category. Only alerts from bank senders leave the phone; OTPs and personal messages never do. The first run covers the last {SMS_BACKFILL_DAYS} days.
          </p>
          <div><Button size="sm" busy={busy} onClick={run}>Turn on SMS import</Button></div>
        </>
      ) : (
        <>
          <p className="text-[#736F6A]">Checks for new bank SMS whenever you open Tabby.{last ? <> Last checked {fmtDate(new Date(last).toISOString(), true)}.</> : null}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" busy={busy} onClick={run}><RefreshCw className="w-3.5 h-3.5" /> Sync now</Button>
            <Button size="sm" variant="secondary" onClick={turnOff}>Turn off</Button>
          </div>
        </>
      )}
    </Row>
  );
}
