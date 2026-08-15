import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISplit {
  userId: string;
  amount: number;
  percentage?: number;
}

export interface IExpense extends Document {
  id: string;
  description: string;
  amount: number;
  date: string;
  paidBy: string;
  groupId: string | null;
  involvedUserIds: string[];
  splits: ISplit[];
  splitMethod: string;
  category?: string;
  isSettlement: boolean;
  createdBy: string;
  createdAt: string;
}

const SplitSchema = new Schema({
  userId: { type: String, required: true },
  amount: { type: Number, required: true },
  percentage: { type: Number },
}, { _id: false });

const ExpenseSchema: Schema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  description: { type: String, required: true, trim: true },
  amount: { type: Number, required: true },
  date: { type: String, required: true },
  paidBy: { type: String, required: true, index: true },
  groupId: { type: String, default: null, index: true },
  involvedUserIds: { type: [String], default: [], index: true },
  splits: { type: [SplitSchema], default: [] },
  splitMethod: { type: String, default: 'equally' },
  category: { type: String, default: 'other' },
  isSettlement: { type: Boolean, default: false },
  createdBy: { type: String, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
});

export const Expense: Model<IExpense> = (mongoose.models.Expense as Model<IExpense>) || mongoose.model<IExpense>('Expense', ExpenseSchema);
