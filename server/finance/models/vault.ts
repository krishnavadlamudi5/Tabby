import { Schema, Types } from 'mongoose';
import { financeSchemaOptions, model, ownerField } from './common';

export const DOCUMENT_TYPES = ['policy', 'renewal_notice', 'premium_receipt', 'tax_certificate', 'claim', 'statement', 'invoice', 'warranty', 'loan', 'id', 'other'] as const;
export const LINK_KINDS = ['policy', 'transaction', 'trip', 'claim', 'statement'] as const;

export interface IDocument {
  _id: Types.ObjectId;
  ownerId: string;
  title: string;
  type: (typeof DOCUMENT_TYPES)[number];
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  encryption: { alg: string; iv: string; tag: string; keyVersion: number };
  linkedTo: { kind: (typeof LINK_KINDS)[number]; id: string }[];
  extractedFields: Record<string, any> | null;
  source: 'upload' | 'gmail';
  /** Warranty end, PUC/licence/passport expiry… reminders 30 and 7 days before. */
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema<any>({
  ownerId: ownerField,
  title: { type: String, required: true, trim: true },
  type: { type: String, enum: DOCUMENT_TYPES, default: 'other' },
  filename: { type: String, default: '' },
  mimeType: { type: String, required: true },
  sizeBytes: { type: Number, required: true },
  sha256: { type: String, required: true },
  storageKey: { type: String, required: true },
  encryption: { alg: String, iv: String, tag: String, keyVersion: Number },
  linkedTo: { type: [{ kind: { type: String, enum: LINK_KINDS }, id: String, _id: false }], default: [] },
  extractedFields: { type: Schema.Types.Mixed, default: null },
  source: { type: String, enum: ['upload', 'gmail'], default: 'upload' },
  expiresAt: { type: Date, default: null, index: true },
}, financeSchemaOptions(['storageKey', 'encryption']));
DocumentSchema.index({ ownerId: 1, sha256: 1 }, { unique: true });
DocumentSchema.index({ ownerId: 1, 'linkedTo.kind': 1, 'linkedTo.id': 1 });
export const FinDocument = model<IDocument>('FinDocument', DocumentSchema);
