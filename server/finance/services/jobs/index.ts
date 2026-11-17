import { Policy } from '../../models';
import { commitmentWatch } from '../commitments';
import { linkPremiums } from '../insurance';
import { sendAlertEmails } from '../mail';
import { refundWatch } from './refundWatch';
import { budgetWatch } from '../spending';
import { documentExpiryReminders, purgeOldBodies, renewalReminders } from './reminders';

export const JOBS = {
  refundWatch: (now: Date) => refundWatch(now),
  commitmentWatch: (now: Date) => commitmentWatch(now),
  renewalReminders: (now: Date) => renewalReminders(now),
  documentExpiryReminders: (now: Date) => documentExpiryReminders(now),
  linkPremiums: async () => {
    let n = 0;
    for (const p of await Policy.find({ status: { $in: ['active', 'renewal_due', 'renewed'] } })) n += (await linkPremiums(p.ownerId, p)).length;
    return n;
  },
  budgetWatch: (now: Date) => budgetWatch(now),
  purgeOldBodies: (now: Date) => purgeOldBodies(now),
  sendAlertEmails: (now: Date) => sendAlertEmails(now),
} as const;

export type JobName = keyof typeof JOBS | 'daily' | 'hourly';

// daily = 08:00 IST full run; hourly = cheap checks + emails.
const GROUPS: Record<'daily' | 'hourly', (keyof typeof JOBS)[]> = {
  daily: ['linkPremiums', 'commitmentWatch', 'refundWatch', 'renewalReminders', 'documentExpiryReminders', 'budgetWatch', 'purgeOldBodies', 'sendAlertEmails'],
  hourly: ['commitmentWatch', 'refundWatch', 'budgetWatch', 'sendAlertEmails'],
};

export async function runJob(name: JobName, now = new Date()): Promise<Record<string, unknown>> {
  const names = name === 'daily' || name === 'hourly' ? GROUPS[name] : [name];
  const out: Record<string, unknown> = {};
  for (const n of names) {
    try {
      out[n] = await JOBS[n](now);
    } catch (err: any) {
      console.error(`Job ${n} failed:`, err);
      out[n] = { error: err?.message || 'failed' };
    }
  }
  return out;
}
