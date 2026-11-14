import { Schema, Types } from 'mongoose';
import { financeSchemaOptions, model, ownerField } from './common';

export const COMMITMENT_TYPES = ['emi', 'sip', 'subscription', 'premium', 'rent', 'other'] as const;
export const COMMITMENT_STATUSES = ['paid', 'due', 'missed', 'failed', 'paused', 'action_needed'] as const;
export const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly'] as const;

export interface ICommitment {
  _id: Types.ObjectId;
  ownerId: string;
  type: (typeof COMMITMENT_TYPES)[number];
  name: string;
  amountPaise: number;
  currency: string;
  schedule: { freq: (typeof FREQUENCIES)[number]; dayOfMonth?: number; nextDueDate: Date };
  accountId: Types.ObjectId | null;
  matchRule: { merchantContains?: string; senderEquals?: string; tolerancePct: number };
  lastPaidTransactionId: Types.ObjectId | null;
  lastPaidAt?: Date;
  status: (typeof COMMITMENT_STATUSES)[number];
  statusNote: string;
  policyId: Types.ObjectId | null;
  source: 'manual' | 'email' | 'detected';
  /** Natural key from emails (loan account, fund name) so repeat emails update one commitment. */
  externalKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const CommitmentSchema = new Schema<any>({
  ownerId: ownerField,
  type: { type: String, enum: COMMITMENT_TYPES, default: 'other' },
  name: { type: String, required: true, trim: true },
  amountPaise: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  schedule: {
    freq: { type: String, enum: FREQUENCIES, default: 'monthly' },
    dayOfMonth: { type: Number },
    nextDueDate: { type: Date, required: true },
  },
  accountId: { type: Schema.Types.ObjectId, default: null },
  matchRule: {
    merchantContains: { type: String, lowercase: true, trim: true },
    senderEquals: { type: String, lowercase: true, trim: true },
    tolerancePct: { type: Number, default: 5 },
  },
  lastPaidTransactionId: { type: Schema.Types.ObjectId, default: null },
  lastPaidAt: { type: Date },
  status: { type: String, enum: COMMITMENT_STATUSES, default: 'due' },
  statusNote: { type: String, default: '' },
  policyId: { type: Schema.Types.ObjectId, default: null },
  source: { type: String, enum: ['manual', 'email', 'detected'], default: 'manual' },
  externalKey: { type: String, default: '' },
}, financeSchemaOptions());
CommitmentSchema.index({ ownerId: 1, 'schedule.nextDueDate': 1 });
CommitmentSchema.index({ ownerId: 1, externalKey: 1 });
export const Commitment = model<ICommitment>('FinCommitment', CommitmentSchema);

export interface IAlert {
  _id: Types.ObjectId;
  ownerId: string;
  type: string;
  title: string;
  body: string;
  dueAt?: Date;
  entity: { kind: string; id: string } | null;
  /** Prevents the same alert being raised twice (e.g. "renewal-30:<policyId>"). */
  dedupeKey: string;
  readAt: Date | null;
  channels: string[];
  emailedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AlertSchema = new Schema<any>({
  ownerId: ownerField,
  type: { type: String, required: true },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  dueAt: { type: Date },
  entity: { type: { kind: String, id: String, _id: false }, default: null },
  dedupeKey: { type: String, default: '' },
  readAt: { type: Date, default: null },
  channels: { type: [String], default: ['in_app'] },
  emailedAt: { type: Date, default: null },
}, financeSchemaOptions());
AlertSchema.index({ ownerId: 1, createdAt: -1 });
AlertSchema.index({ ownerId: 1, dedupeKey: 1 });
export const Alert = model<IAlert>('FinAlert', AlertSchema);
