import { Capacitor, registerPlugin } from '@capacitor/core';
import { apiRequest } from '../../lib/api';

// Automatic SMS import (Android only). Reads the phone's SMS inbox through
// the native SmsInbox plugin (android/.../SmsInboxPlugin.java), keeps only
// bank/card alerts, and sends them to /api/finance/ingest/sms, which turns
// them into categorised transactions. Runs when the app opens or comes back
// to the foreground, once you've turned it on in Settings → Money.

interface SmsMessage { address: string; body: string; date: number }
interface SmsInboxPlugin {
  read(opts: { since: number; limit: number }): Promise<{ messages: SmsMessage[] }>;
  checkPermissions(): Promise<{ sms: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' }>;
}

const SmsInbox = registerPlugin<SmsInboxPlugin>('SmsInbox');

/** How far back the first import looks. */
export const SMS_BACKFILL_DAYS = 90;
const BATCH = 100;
const PAGE = 500;

const enabledKey = (userId: string) => `tabby_sms_import_enabled_${userId}`;
const lastKey = (userId: string) => `tabby_sms_import_last_${userId}`;

function get(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function put(key: string, value: string | null): void {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* ignore */ }
}

export function smsSupported(): boolean {
  return Capacitor.getPlatform() === 'android';
}

export function isSmsImportEnabled(userId: string): boolean {
  return smsSupported() && get(enabledKey(userId)) === '1';
}

export function smsLastSyncedAt(userId: string): number | null {
  const v = Number(get(lastKey(userId)));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function disableSmsImport(userId: string): void {
  put(enabledKey(userId), null);
}

// Alphanumeric DLT headers ("VM-HDFCBK-S"). Phone numbers are people, never banks.
const BANK_HEADER = /^([A-Z]{2}-)?[A-Z0-9]{5,8}(-[A-Z])?$/i;
const OTP = /\b(otp|one[\s-]?time[\s-]?password|verification code|do not share)\b/i;
const MONEY = /(?:rs\.?|inr|₹)\s*[\d,]+/i;
const MOVEMENT = /\b(debited|credited|spent|sent|received|paid|withdrawn|refund|declined|credit (?:by|of)|txn|transaction)\b/i;

/** First pass on the phone: only likely bank alerts leave it, never OTPs or personal SMS. */
export function looksLikeBankAlert(m: SmsMessage): boolean {
  const address = (m.address || '').trim();
  if (!BANK_HEADER.test(address) || !/[A-Z]/i.test(address)) return false;
  const body = m.body || '';
  if (OTP.test(body)) return false;
  return MONEY.test(body) && MOVEMENT.test(body);
}

export interface SmsSyncResult { read: number; sent: number; parsed: number; review: number; duplicate: number }

let running: Promise<SmsSyncResult> | null = null;

/**
 * Reads new SMS since the last run (first run: last 90 days) and uploads bank
 * alerts. Asks for the SMS permission the first time. Safe to call often:
 * concurrent calls share one run, and the server ignores repeats.
 */
export function syncSms(userId: string): Promise<SmsSyncResult> {
  if (!running) {
    running = run(userId).finally(() => { running = null; });
  }
  return running;
}

async function run(userId: string): Promise<SmsSyncResult> {
  const total: SmsSyncResult = { read: 0, sent: 0, parsed: 0, review: 0, duplicate: 0 };
  let since = smsLastSyncedAt(userId) ?? Date.now() - SMS_BACKFILL_DAYS * 86_400_000;

  for (;;) {
    const { messages } = await SmsInbox.read({ since, limit: PAGE });
    if (!messages.length) break;
    total.read += messages.length;

    const alerts = messages.filter(looksLikeBankAlert);
    for (let i = 0; i < alerts.length; i += BATCH) {
      const batch = alerts.slice(i, i + BATCH).map((m) => ({ address: m.address, body: m.body, date: new Date(m.date).toISOString() }));
      const r = await apiRequest<{ parsed: number; review: number; duplicate: number }>('/finance/ingest/sms', {
        method: 'POST', body: { messages: batch },
      });
      total.sent += batch.length;
      total.parsed += r.parsed || 0;
      total.review += r.review || 0;
      total.duplicate += r.duplicate || 0;
    }

    // Only move the bookmark once this page is safely on the server.
    since = messages[messages.length - 1].date;
    put(lastKey(userId), String(since));
    if (messages.length < PAGE) break;
  }

  put(enabledKey(userId), '1');
  if (total.read === 0 && smsLastSyncedAt(userId) === null) put(lastKey(userId), String(Date.now()));
  return total;
}
