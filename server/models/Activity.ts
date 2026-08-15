import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IActivity extends Document {
  id: string;
  type: string;
  userId: string;
  description: string;
  timestamp: string;
}

const ActivitySchema: Schema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  type: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  description: { type: String, required: true },
  timestamp: { type: String, default: () => new Date().toISOString() },
});

export const Activity: Model<IActivity> = (mongoose.models.Activity as Model<IActivity>) || mongoose.model<IActivity>('Activity', ActivitySchema);
