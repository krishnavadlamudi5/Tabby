import { Alert } from '../models';
import { User } from '../../models/User';

/** Alert type -> the preference group the owner controls in Settings. */
export const ALERT_GROUP: Record<string, string> = {
  renewal: 'renewals', due: 'commitments', commitment_missed: 'commitments', commitment_failed: 'commitments', action_needed: 'commitments',
  declined: 'declined', large_debit: 'large_debit', refund_overdue: 'refunds', document_expiry: 'documents',
  statement_mismatch: 'statements', statement_password: 'statements', policy_added: 'policies', policy_updated: 'policies',
  unknown_account: 'new_accounts', budget: 'budgets',
};

export interface NewAlert {
  type: string;
  title: string;
  body?: string;
  dueAt?: Date;
  entity?: { kind: string; id: string } | null;
  dedupeKey?: string;
  email?: boolean;
}

/** Creates an in-app alert unless one with the same dedupeKey exists. */
export async function raiseAlert(ownerId: string, a: NewAlert) {
  if (a.dedupeKey && (await Alert.exists({ ownerId, dedupeKey: a.dedupeKey }))) return null;
  // Owner's choice per group: off / in-app / in-app + email. Default keeps
  // the built-in behaviour (email for the important ones).
  const owner = await User.findOne({ id: ownerId }, { preferences: 1 }).lean() as any;
  const choice = owner?.preferences?.alerts?.[ALERT_GROUP[a.type] || ''];
  if (choice === 'off') return null;
  if (choice === 'app') a = { ...a, email: false };
  if (choice === 'email') a = { ...a, email: true };
  return Alert.create({
    ownerId,
    type: a.type,
    title: a.title,
    body: a.body || '',
    dueAt: a.dueAt,
    entity: a.entity || null,
    dedupeKey: a.dedupeKey || '',
    channels: a.email ? ['in_app', 'email'] : ['in_app'],
  });
}
