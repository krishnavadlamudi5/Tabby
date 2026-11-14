import { Schema, Types } from 'mongoose';
import { financeSchemaOptions, model, ownerField } from './common';

export const POLICY_TYPES = ['health', 'term_life', 'life', 'vehicle', 'home', 'travel', 'personal_accident', 'other'] as const;
export const PREMIUM_FREQUENCIES = ['monthly', 'quarterly', 'half_yearly', 'yearly', 'single'] as const;
export const POLICY_STATUSES = ['active', 'renewal_due', 'lapsed', 'renewed', 'cancelled'] as const;

export interface IPolicy {
  _id: Types.ObjectId;
  ownerId: string;
  insurer: string;
  policyNumber: string;
  type: (typeof POLICY_TYPES)[number];
  planName: string;
  insuredMemberIds: Types.ObjectId[];
  nominee: string;
  sumInsuredPaise: number;
  premiumPaise: number;
  premiumFrequency: (typeof PREMIUM_FREQUENCIES)[number];
  paymentMode: string;
  startDate?: Date;
  renewalDate?: Date;
  termYears?: number;
  status: (typeof POLICY_STATUSES)[number];
  agent: { name?: string; phone?: string; email?: string };
  claimHelpline: string;
  tpa: string;
  taxSection: '80C' | '80D' | null;
  premiumTransactionIds: Types.ObjectId[];
  documentIds: Types.ObjectId[];
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const PolicySchema = new Schema<any>({
  ownerId: ownerField,
  insurer: { type: String, required: true, trim: true },
  policyNumber: { type: String, default: '', trim: true },
  type: { type: String, enum: POLICY_TYPES, default: 'health' },
  planName: { type: String, default: '' },
  insuredMemberIds: { type: [Schema.Types.ObjectId], default: [] },
  nominee: { type: String, default: '' },
  sumInsuredPaise: { type: Number, default: 0 },
  premiumPaise: { type: Number, default: 0 },
  premiumFrequency: { type: String, enum: PREMIUM_FREQUENCIES, default: 'yearly' },
  paymentMode: { type: String, default: '' },
  startDate: { type: Date },
  renewalDate: { type: Date, index: true },
  termYears: { type: Number },
  status: { type: String, enum: POLICY_STATUSES, default: 'active' },
  agent: { name: String, phone: String, email: String },
  claimHelpline: { type: String, default: '' },
  tpa: { type: String, default: '' },
  taxSection: { type: String, enum: ['80C', '80D', null], default: null },
  premiumTransactionIds: { type: [Schema.Types.ObjectId], default: [] },
  documentIds: { type: [Schema.Types.ObjectId], default: [] },
  notes: { type: String, default: '' },
}, financeSchemaOptions());
export const Policy = model<IPolicy>('FinPolicy', PolicySchema);

export interface IPerson {
  _id: Types.ObjectId;
  ownerId: string;
  name: string;
  relation: string;
  dob?: Date;
  linkedUserId?: string;
}

const PersonSchema = new Schema<any>({
  ownerId: ownerField,
  name: { type: String, required: true, trim: true },
  relation: { type: String, default: 'self' },
  dob: { type: Date },
  linkedUserId: { type: String },
}, financeSchemaOptions());
export const Person = model<IPerson>('FinPerson', PersonSchema);

export interface IClaim {
  _id: Types.ObjectId;
  ownerId: string;
  policyId: Types.ObjectId;
  date: Date;
  reason: string;
  claimedPaise: number;
  settledPaise: number;
  status: 'filed' | 'in_review' | 'settled' | 'rejected';
  documentIds: Types.ObjectId[];
  notes: string;
}

const ClaimSchema = new Schema<any>({
  ownerId: ownerField,
  policyId: { type: Schema.Types.ObjectId, required: true, index: true },
  date: { type: Date, required: true },
  reason: { type: String, default: '' },
  claimedPaise: { type: Number, default: 0 },
  settledPaise: { type: Number, default: 0 },
  status: { type: String, enum: ['filed', 'in_review', 'settled', 'rejected'], default: 'filed' },
  documentIds: { type: [Schema.Types.ObjectId], default: [] },
  notes: { type: String, default: '' },
}, financeSchemaOptions());
export const Claim = model<IClaim>('FinClaim', ClaimSchema);
