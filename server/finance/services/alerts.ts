import { Alert } from '../models';

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
