/**
 * Tabby - Gmail -> Tabby push.
 *
 * Runs inside your own Gmail as a Google Apps Script (free; no OAuth app to
 * verify, no 7-day token expiry). Every 10 minutes it finds money-related
 * emails, sends each one to Tabby signed with HMAC-SHA256, and labels it
 * "tabby-sent" once Tabby has it. Failed sends stay unlabelled and are
 * retried on the next run.
 *
 * Setup: see README.md in this folder. Secrets live in Script Properties,
 * never in this file:
 *   TABBY_INGEST_URL     https://tabby-api-bpb4.onrender.com/api/finance/ingest/email
 *   TABBY_HMAC_SECRET    same value as INGEST_HMAC_SECRET on Render
 */

var LABEL = 'tabby-sent';
var MAX_BODY_CHARS = 100 * 1024;
var MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
var MONEY_WORDS = '(debited OR credited OR paid OR payment OR refund OR refunded OR reversal OR invoice OR receipt OR order OR premium OR EMI OR installment OR "Rs." OR INR OR ₹ OR transaction OR statement OR policy OR renewal OR SIP OR subscription)';
var OTP_RE = /\b(otp|one[\s-]?time[\s-]?password|verification code)\b/i;

/** Time-driven trigger target. */
function syncRecent() {
  var queries = [
    'newer_than:3d -label:' + LABEL + ' -category:promotions -category:social ' + MONEY_WORDS,
    'newer_than:3d -label:' + LABEL + ' has:attachment filename:pdf (statement OR invoice OR policy OR receipt)',
  ];
  queries.forEach(function (q) { processQuery_(q, 100); });
}

/**
 * Imports history in batches of 100, e.g. backfill('2026-11-01', '2026-11-30').
 * Safe to re-run: Tabby ignores emails it already has (409) and they get labelled.
 */
function backfill(startDate, endDate) {
  var after = String(startDate).replace(/-/g, '/');
  var before = String(endDate || Utilities.formatDate(new Date(Date.now() + 86400000), 'Asia/Kolkata', 'yyyy/MM/dd')).replace(/-/g, '/');
  var q = 'after:' + after + ' before:' + before + ' -label:' + LABEL + ' -category:promotions -category:social ' + MONEY_WORDS;
  var total = 0;
  for (var round = 0; round < 50; round++) {
    var n = processQuery_(q, 100);
    total += n;
    if (n === 0) break;
  }
  Logger.log('Backfill sent ' + total + ' messages');
}

/** One-time helper: creates the 10-minute trigger. */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncRecent') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncRecent').timeBased().everyMinutes(10).create();
}

/** Optional: keeps the free Render instance awake (call from a 10-minute trigger). */
function keepAwake() {
  var url = props_().TABBY_INGEST_URL.replace(/\/api\/.*$/, '/api/health');
  UrlFetchApp.fetch(url, { muteHttpExceptions: true });
}

function processQuery_(query, max) {
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  var threads = GmailApp.search(query, 0, max);
  var sent = 0;
  threads.forEach(function (thread) {
    var allOk = true;
    thread.getMessages().forEach(function (msg) {
      if (!allOk) return;
      var status = sendMessage_(msg);
      if (status === 200 || status === 409 || status === 'skipped') sent++;
      else allOk = false;
    });
    if (allOk) thread.addLabel(label);
  });
  return sent;
}

function sendMessage_(msg) {
  var subject = msg.getSubject() || '';
  var body = msg.getPlainBody() || '';
  if (!body.trim()) body = htmlToText_(msg.getBody() || '');
  // OTP emails are never sent anywhere.
  if (OTP_RE.test(subject) || OTP_RE.test(body.slice(0, 500))) return 'skipped';

  var attachments = [];
  msg.getAttachments({ includeInlineImages: false }).forEach(function (a) {
    var type = (a.getContentType() || '').toLowerCase();
    if (!/^(application\/pdf|image\/(jpeg|png|heic|heif))$/.test(type)) return;
    if (a.getSize() > MAX_ATTACHMENT_BYTES) return;
    attachments.push({ filename: a.getName(), mimeType: type, size: a.getSize(), base64: Utilities.base64Encode(a.getBytes()) });
  });

  var payload = JSON.stringify({
    messageId: msg.getId(),
    threadId: msg.getThread().getId(),
    from: msg.getFrom(),
    to: msg.getTo(),
    subject: subject,
    date: msg.getDate().toISOString(),
    bodyText: body.slice(0, MAX_BODY_CHARS),
    attachments: attachments,
  });

  var status = post_(payload);
  if (status === 0 || status === 502 || status === 503 || status === 504) {
    // Render's free instance may be waking up: wait once and retry.
    Utilities.sleep(60 * 1000);
    status = post_(payload);
  }
  if (status !== 200 && status !== 409) Logger.log('Tabby rejected ' + msg.getId() + ' (' + subject + '): HTTP ' + status);
  return status;
}

function post_(payload) {
  var p = props_();
  var ts = String(Date.now());
  var sigBytes = Utilities.computeHmacSha256Signature(
    Utilities.newBlob(ts + '.' + payload).getBytes(),
    Utilities.newBlob(p.TABBY_HMAC_SECRET).getBytes()
  );
  var sig = sigBytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  try {
    var res = UrlFetchApp.fetch(p.TABBY_INGEST_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: payload,
      headers: { 'X-Tabby-Timestamp': ts, 'X-Tabby-Signature': sig },
      muteHttpExceptions: true,
    });
    return res.getResponseCode();
  } catch (e) {
    Logger.log('Network error: ' + e);
    return 0;
  }
}

function props_() {
  var p = PropertiesService.getScriptProperties().getProperties();
  if (!p.TABBY_INGEST_URL || !p.TABBY_HMAC_SECRET) {
    throw new Error('Set TABBY_INGEST_URL and TABBY_HMAC_SECRET in Project Settings > Script Properties');
  }
  return p;
}

function htmlToText_(html) {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
    .replace(/[ \t]+/g, ' ');
}
