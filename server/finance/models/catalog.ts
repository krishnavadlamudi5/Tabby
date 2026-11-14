import { Schema, Types } from 'mongoose';
import { financeSchemaOptions, model, ownerField } from './common';

export interface ICategory {
  _id: Types.ObjectId;
  ownerId: string;
  name: string;
  parentId: Types.ObjectId | null;
  icon: string;
  color: string;
  kind: 'expense' | 'income' | 'transfer';
  isSystem: boolean;
  sortOrder: number;
  /** Monthly budget in paise; 0 = no budget. */
  budgetPaise: number;
  /** Stable key for seeded categories, used by dictionaries ("groceries.vegetables"). */
  key: string;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<any>({
  ownerId: ownerField,
  name: { type: String, required: true, trim: true },
  parentId: { type: Schema.Types.ObjectId, default: null },
  icon: { type: String, default: 'tag' },
  color: { type: String, default: '#736F6A' },
  kind: { type: String, enum: ['expense', 'income', 'transfer'], default: 'expense' },
  isSystem: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0 },
  budgetPaise: { type: Number, default: 0, min: 0 },
  key: { type: String, default: '' },
}, financeSchemaOptions());
CategorySchema.index({ ownerId: 1, parentId: 1, sortOrder: 1 });
CategorySchema.index({ ownerId: 1, key: 1 });
export const Category = model<ICategory>('FinCategory', CategorySchema);

export interface IRule {
  _id: Types.ObjectId;
  ownerId: string;
  match: { merchantContains?: string; senderEquals?: string; channel?: string; amountMinPaise?: number; amountMaxPaise?: number };
  action: { categoryId?: Types.ObjectId; kind?: string; tags?: string[]; splitTemplateId?: Types.ObjectId };
  priority: number;
  createdFrom: 'user_correction' | 'default' | 'manual';
  hits: number;
  createdAt: Date;
  updatedAt: Date;
}

const RuleSchema = new Schema<any>({
  ownerId: ownerField,
  match: {
    merchantContains: { type: String, lowercase: true, trim: true },
    senderEquals: { type: String, lowercase: true, trim: true },
    channel: { type: String },
    amountMinPaise: { type: Number },
    amountMaxPaise: { type: Number },
  },
  action: {
    categoryId: { type: Schema.Types.ObjectId },
    kind: { type: String },
    tags: { type: [String], default: undefined },
    splitTemplateId: { type: Schema.Types.ObjectId },
  },
  priority: { type: Number, default: 0 },
  createdFrom: { type: String, enum: ['user_correction', 'default', 'manual'], default: 'manual' },
  hits: { type: Number, default: 0 },
}, financeSchemaOptions());
RuleSchema.index({ ownerId: 1, priority: -1 });
export const Rule = model<IRule>('FinRule', RuleSchema);

export interface ISplitTemplate {
  _id: Types.ObjectId;
  ownerId: string;
  name: string;
  parts: { categoryId: Types.ObjectId; percent: number }[];
  createdAt: Date;
  updatedAt: Date;
}

const SplitTemplateSchema = new Schema<any>({
  ownerId: ownerField,
  name: { type: String, required: true, trim: true },
  parts: { type: [{ categoryId: Schema.Types.ObjectId, percent: Number, _id: false }], default: [] },
}, financeSchemaOptions());
export const SplitTemplate = model<ISplitTemplate>('FinSplitTemplate', SplitTemplateSchema);

export interface ISenderProfile {
  _id: Types.ObjectId;
  ownerId: string;
  sender: string;
  displayName: string;
  parser: string;
  ignored: boolean;
  confirmedExamples: Types.ObjectId[];
  stats: { seen: number; autoAccepted: number; corrected: number };
  createdAt: Date;
  updatedAt: Date;
}

const SenderProfileSchema = new Schema<any>({
  ownerId: ownerField,
  sender: { type: String, required: true, lowercase: true, trim: true },
  displayName: { type: String, default: '' },
  parser: { type: String, default: '' },
  ignored: { type: Boolean, default: false },
  confirmedExamples: { type: [Schema.Types.ObjectId], default: [] },
  stats: {
    seen: { type: Number, default: 0 },
    autoAccepted: { type: Number, default: 0 },
    corrected: { type: Number, default: 0 },
  },
}, financeSchemaOptions());
SenderProfileSchema.index({ ownerId: 1, sender: 1 }, { unique: true });
export const SenderProfile = model<ISenderProfile>('FinSenderProfile', SenderProfileSchema);
