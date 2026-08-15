import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IGroup extends Document {
  id: string;
  name: string;
  category: string;
  members: string[];
  createdAt: string;
}

const GroupSchema: Schema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, default: 'other' },
  members: { type: [String], default: [], index: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
});

export const Group: Model<IGroup> = (mongoose.models.Group as Model<IGroup>) || mongoose.model<IGroup>('Group', GroupSchema);
