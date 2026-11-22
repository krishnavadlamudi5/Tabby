import { Schema, Types } from 'mongoose';
import { financeSchemaOptions, model, ownerField } from './common';

/**
 * A user's "Connect Gmail" link: read-only Gmail access granted through
 * Google sign-in. The refresh token is encrypted at rest and never returned
 * by the API.
 */
export interface IGmailConnection {
  _id: Types.ObjectId;
  ownerId: string;
  email: string;
  refreshTokenEnc: string;
  scope: string;
  connectedAt: Date;
  lastSyncAt: Date | null;
  /** Newest message time already imported; the next sync starts just before it. */
  syncedUntil: Date | null;
  lastError: string;
  lastErrorAt: Date | null;
  imported: number;
  createdAt: Date;
  updatedAt: Date;
}

const GmailConnectionSchema = new Schema<any>({
  ownerId: { ...ownerField, unique: true },
  email: { type: String, default: '', lowercase: true, trim: true },
  refreshTokenEnc: { type: String, required: true },
  scope: { type: String, default: '' },
  connectedAt: { type: Date, default: () => new Date() },
  lastSyncAt: { type: Date, default: null },
  syncedUntil: { type: Date, default: null },
  lastError: { type: String, default: '' },
  lastErrorAt: { type: Date, default: null },
  imported: { type: Number, default: 0 },
}, financeSchemaOptions(['refreshTokenEnc']));
export const GmailConnection = model<IGmailConnection>('FinGmailConnection', GmailConnectionSchema);
