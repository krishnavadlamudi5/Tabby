import { Schema, Types } from 'mongoose';
import { financeSchemaOptions, model, ownerField } from './common';

// ---------------------------------------------------------------- Account

export const ACCOUNT_TYPES = ['savings', 'current', 'credit_card', 'loan', 'investment', 'wallet', 'cash'] as const;

export interface IAccount {
  _id: Types.ObjectId;
  ownerId: string;
  name: string;
  institution: string;
  type: (typeof ACCOUNT_TYPES)[number];
  last4: string;
  aliases: string[];
  cardLast4s: string[];
  ifsc?: string;
  holderName?: string;
  statementPasswordEnc?: string;
  openingBalancePaise: number;
  openingBalanceDate?: Date;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AccountSchema = new Schema<any>({
  ownerId: ownerField,
  name: { type: String, required: true, trim: true },
  institution: { type: String, default: 'other', lowercase: true, trim: true },
  type: { type: String, enum: ACCOUNT_TYPES, default: 'savings' },
  last4: { type: String, default: '', trim: true },
  aliases: { type: [String], default: [] },
  cardLast4s: { type: [String], default: [] },
  ifsc: { type: String, default: '', uppercase: true, trim: true },
  holderName: { type: String, default: '' },
  // Write-only from the client: never serialised (see hidden fields below).
  statementPasswordEnc: { type: String, default: '' },
  openingBalancePaise: { type: Number, default: 0 },
  openingBalanceDate: { type: Date },
  currency: { type: String, default: 'INR' },
  isActive: { type: Boolean, default: true },
}, financeSchemaOptions(['statementPasswordEnc']));
AccountSchema.index({ ownerId: 1, last4: 1 });
AccountSchema.virtual('hasStatementPassword').get(function (this: IAccount) {
  return Boolean(this.statementPasswordEnc);
});
export const Account = model<IAccount>('FinAccount', AccountSchema);

// ---------------------------------------------------------------- RawEvent

export const RAW_SOURCES = ['gmail', 'statement', 'manual', 'receipt', 'sms'] as const;
export const RAW_STATUSES = ['parsed', 'needs_review', 'ignored', 'error'] as const;

export interface IRawEvent {
  _id: Types.ObjectId;
  ownerId: string;
  source: (typeof RAW_SOURCES)[number];
  sourceId: string;
  sender: string;
  subject: string;
  receivedAt: Date;
  /** AES-GCM packed string; plaintext is never stored. Cleared after 30 days. */
  bodyEnc: string;
  bodyPurgedAt?: Date;
  attachmentsMeta: { filename: string; mimeType: string; size: number; documentId?: string }[];
  detectedType: string;
  parser: string;
  parserVersion: number;
  extracted: Record<string, any> | null;
  confidence: number;
  status: (typeof RAW_STATUSES)[number];
  reviewReason?: string;
  transactionIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const RawEventSchema = new Schema<any>({
  ownerId: ownerField,
  source: { type: String, enum: RAW_SOURCES, required: true },
  sourceId: { type: String, required: true },
  sender: { type: String, default: '', lowercase: true, trim: true },
  subject: { type: String, default: '' },
  receivedAt: { type: Date, default: () => new Date() },
  bodyEnc: { type: String, default: '' },
  bodyPurgedAt: { type: Date },
  attachmentsMeta: { type: [{ filename: String, mimeType: String, size: Number, documentId: String, _id: false }], default: [] },
  detectedType: { type: String, default: 'unknown' },
  parser: { type: String, default: '' },
  parserVersion: { type: Number, default: 1 },
  extracted: { type: Schema.Types.Mixed, default: null },
  confidence: { type: Number, default: 0 },
  status: { type: String, enum: RAW_STATUSES, default: 'needs_review', index: true },
  reviewReason: { type: String, default: '' },
  transactionIds: { type: [Schema.Types.ObjectId], default: [] },
}, financeSchemaOptions(['bodyEnc']));
RawEventSchema.index({ ownerId: 1, source: 1, sourceId: 1 }, { unique: true });
RawEventSchema.index({ ownerId: 1, status: 1, receivedAt: -1 });
export const RawEvent = model<IRawEvent>('FinRawEvent', RawEventSchema);

// ---------------------------------------------------------------- Transaction

export const TXN_KINDS = ['expense', 'income', 'refund', 'self_transfer', 'cc_bill_payment', 'reversal', 'fee', 'investment', 'emi'] as const;
export const TXN_STATUSES = ['pending', 'settled', 'declined', 'reversed'] as const;
export const TXN_CHANNELS = ['card', 'upi', 'imps', 'neft', 'rtgs', 'netbanking', 'autodebit', 'cash', 'other'] as const;
/** Kinds that never count as spending or income. */
export const NON_SPEND_KINDS = ['self_transfer', 'cc_bill_payment'];

export interface ISplitPart {
  categoryId: Types.ObjectId | null;
  amountPaise: number;
  note?: string;
  lineItems?: { name: string; qty?: number; amountPaise?: number }[];
}

export interface ITransaction {
  _id: Types.ObjectId;
  ownerId: string;
  accountId: Types.ObjectId | null;
  postedAt: Date;
  amountPaise: number;
  direction: 'debit' | 'credit';
  currency: string;
  originalAmountMinor?: number;
  originalCurrency?: string;
  merchantRaw: string;
  merchant: string;
  description: string;
  channel: (typeof TXN_CHANNELS)[number];
  referenceIds: string[];
  kind: (typeof TXN_KINDS)[number];
  status: (typeof TXN_STATUSES)[number];
  expectedAt?: Date;
  linkedTransactionId: Types.ObjectId | null;
  categoryId: Types.ObjectId | null;
  categorySource: 'rule' | 'dictionary' | 'user' | 'split' | '';
  splits: ISplitPart[];
  tags: string[];
  tripId: string | null;
  sharedExpenseId: string | null;
  mySharePaise: number | null;
  notes: string;
  attachmentDocIds: Types.ObjectId[];
  rawEventIds: Types.ObjectId[];
  /** Where evidence for this transaction came from: 'bank' alert, 'merchant' receipt, 'statement', 'manual'. */
  sourceKinds: string[];
  counterpartyName: string;
  counterpartyAccount: string;
  counterpartyIfsc: string;
  reconciled: boolean;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

const SplitPartSchema = new Schema<any>({
  categoryId: { type: Schema.Types.ObjectId, default: null },
  amountPaise: { type: Number, required: true },
  note: { type: String, default: '' },
  lineItems: { type: [{ name: String, qty: Number, amountPaise: Number, _id: false }], default: undefined },
}, { _id: false });

const TransactionSchema = new Schema<any>({
  ownerId: ownerField,
  accountId: { type: Schema.Types.ObjectId, default: null },
  postedAt: { type: Date, required: true },
  amountPaise: { type: Number, required: true, min: 0 },
  direction: { type: String, enum: ['debit', 'credit'], required: true },
  currency: { type: String, default: 'INR' },
  originalAmountMinor: { type: Number },
  originalCurrency: { type: String },
  merchantRaw: { type: String, default: '' },
  merchant: { type: String, default: '' },
  description: { type: String, default: '' },
  channel: { type: String, enum: TXN_CHANNELS, default: 'other' },
  referenceIds: { type: [String], default: [] },
  kind: { type: String, enum: TXN_KINDS, default: 'expense' },
  status: { type: String, enum: TXN_STATUSES, default: 'settled' },
  expectedAt: { type: Date },
  linkedTransactionId: { type: Schema.Types.ObjectId, default: null },
  categoryId: { type: Schema.Types.ObjectId, default: null },
  categorySource: { type: String, default: '' },
  splits: { type: [SplitPartSchema], default: [] },
  tags: { type: [String], default: [] },
  tripId: { type: String, default: null, index: true },
  sharedExpenseId: { type: String, default: null },
  mySharePaise: { type: Number, default: null },
  notes: { type: String, default: '' },
  attachmentDocIds: { type: [Schema.Types.ObjectId], default: [] },
  rawEventIds: { type: [Schema.Types.ObjectId], default: [] },
  sourceKinds: { type: [String], default: [] },
  counterpartyName: { type: String, default: '' },
  counterpartyAccount: { type: String, default: '' },
  counterpartyIfsc: { type: String, default: '' },
  reconciled: { type: Boolean, default: false },
  source: { type: String, default: 'manual' },
}, financeSchemaOptions());
TransactionSchema.index({ ownerId: 1, postedAt: -1 });
TransactionSchema.index({ ownerId: 1, accountId: 1, postedAt: -1 });
TransactionSchema.index({ ownerId: 1, referenceIds: 1 });
export const Transaction = model<ITransaction>('FinTransaction', TransactionSchema);

// ---------------------------------------------------------------- Statement

export interface IStatement {
  _id: Types.ObjectId;
  ownerId: string;
  accountId: Types.ObjectId;
  periodStart: Date;
  periodEnd: Date;
  openingBalancePaise: number;
  closingBalancePaise: number;
  fileDocId: Types.ObjectId | null;
  format: 'csv' | 'pdf';
  lineCount: number;
  matchedCount: number;
  createdCount: number;
  status: 'parsed' | 'reconciled' | 'mismatch';
  mismatchPaise: number;
  issues: { line: number; message: string; amountPaise?: number }[];
  createdAt: Date;
  updatedAt: Date;
}

const StatementSchema = new Schema<any>({
  ownerId: ownerField,
  accountId: { type: Schema.Types.ObjectId, required: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  openingBalancePaise: { type: Number, default: 0 },
  closingBalancePaise: { type: Number, default: 0 },
  fileDocId: { type: Schema.Types.ObjectId, default: null },
  format: { type: String, enum: ['csv', 'pdf'], default: 'csv' },
  lineCount: { type: Number, default: 0 },
  matchedCount: { type: Number, default: 0 },
  createdCount: { type: Number, default: 0 },
  status: { type: String, enum: ['parsed', 'reconciled', 'mismatch'], default: 'parsed' },
  mismatchPaise: { type: Number, default: 0 },
  issues: { type: [{ line: Number, message: String, amountPaise: Number, _id: false }], default: [] },
}, financeSchemaOptions());
StatementSchema.index({ ownerId: 1, accountId: 1, periodEnd: -1 });
export const Statement = model<IStatement>('FinStatement', StatementSchema);
