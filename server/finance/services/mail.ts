import { Resend } from 'resend';
import { Alert } from '../models';
import { User } from '../../models/User';

/**
 * Emails pending alerts as one digest per owner via Resend (free tier).
 * Recipient: ALERT_EMAIL_TO if set, else the owner's sign-in email.
 * No-op without RESEND_API_KEY (alerts still show in the app).
 */
export async function sendAlertEmails(now = new Date()): Promise<number> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return 0;
  const resend = new Resend(key);
  const pending = await Alert.find({ channels: 'email', emailedAt: null, createdAt: { $gte: new Date(now.getTime() - 7 * 86_400_000) } }).sort({ createdAt: 1 });
  const byOwner = new Map<string, typeof pending>();
  for (const a of pending) byOwner.set(a.ownerId, [...(byOwner.get(a.ownerId) || []), a]);
  let sent = 0;
  for (const [ownerId, alerts] of byOwner) {
    const owner = await User.findOne({ id: ownerId });
    const to = process.env.ALERT_EMAIL_TO || owner?.email;
    if (!to || to.endsWith('@tabby.local')) continue;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#2C2B29">
        <h2 style="color:#3C5A48;margin:0 0 12px">Tabby money alerts</h2>
        ${alerts.map((a) => `<div style="border:1px solid #E6E1DA;border-radius:12px;padding:12px 14px;margin:8px 0">
          <div style="font-weight:700">${esc(a.title)}</div>
          ${a.body ? `<div style="color:#736F6A;font-size:13px;margin-top:4px;white-space:pre-line">${esc(a.body)}</div>` : ''}
        </div>`).join('')}
        <p style="color:#A39E98;font-size:12px">Open Tabby → Money for details.</p>
      </div>`;
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM || 'Tabby <onboarding@resend.dev>',
      to,
      subject: alerts.length === 1 ? `Tabby: ${alerts[0].title}` : `Tabby: ${alerts.length} money alerts`,
      html,
    });
    if (result.error) {
      console.error('Alert email failed:', result.error);
      continue;
    }
    await Alert.updateMany({ _id: { $in: alerts.map((a) => a._id) } }, { $set: { emailedAt: now } });
    sent += 1;
  }
  return sent;
}
