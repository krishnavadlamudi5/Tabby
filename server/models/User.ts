import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
  id: string;
  name: string;
  email: string;
  phone?: string;
  password?: string;
  avatar?: string;
  friendIds: string[];
  createdAt: string;
}

const UserSchema: Schema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  phone: { type: String, default: '' },
  password: { type: String, default: '' },
  avatar: { type: String, default: '' },
  friendIds: { type: [String], default: [] },
  createdAt: { type: String, default: () => new Date().toISOString() },
});

export const User: Model<IUser> = (mongoose.models.User as Model<IUser>) || mongoose.model<IUser>('User', UserSchema);
