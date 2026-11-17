import { Schema, Types } from 'mongoose';
import { financeSchemaOptions, model, ownerField } from './common';

export const HOLDING_TYPES = ['mutual_fund', 'stock', 'fd', 'rd', 'ppf', 'epf', 'nps', 'gold', 'bond', 'real_estate', 'crypto', 'other'] as const;

export interface IHolding {
  _id: Types.ObjectId;
  ownerId: string;
  name: string;
  type: (typeof HOLDING_TYPES)[number];
  /** Fund house, broker or bank. */
  provider: string;
  /** Folio, demat or account number (shown masked in the app). */
  reference: string;
  investedPaise: number;
  currentValuePaise: number;
  valueAsOf: Date;
  startDate?: Date;
  maturityDate?: Date;
  interestRatePct?: number;
  /** SIP that feeds this holding, if any. */
  commitmentId: Types.ObjectId | null;
  /** One point per value update, for the "value over time" graph. */
  history: { date: Date; investedPaise: number; valuePaise: number }[];
  notes: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const HoldingSchema = new Schema<any>({
  ownerId: ownerField,
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: HOLDING_TYPES, default: 'mutual_fund' },
  provider: { type: String, default: '', trim: true },
  reference: { type: String, default: '', trim: true },
  investedPaise: { type: Number, default: 0 },
  currentValuePaise: { type: Number, default: 0 },
  valueAsOf: { type: Date, default: () => new Date() },
  startDate: { type: Date },
  maturityDate: { type: Date },
  interestRatePct: { type: Number },
  commitmentId: { type: Schema.Types.ObjectId, default: null },
  history: {
    type: [{ date: Date, investedPaise: Number, valuePaise: Number, _id: false }],
    default: [],
  },
  notes: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
}, financeSchemaOptions());
HoldingSchema.index({ ownerId: 1, type: 1 });
export const Holding = model<IHolding>('FinHolding', HoldingSchema);
