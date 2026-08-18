import mongoose, { Schema, Document, Model } from 'mongoose';

// 'local'  = registered with a password via /api/auth/register (or reset one)
// 'google' = created/claimed via Google sign-in, never has a usable password
// 'ghost'  = a placeholder created by someone adding them as a friend; they
//            have never signed up and cannot log in until they register
export type AuthProvider = 'local' | 'google' | 'ghost';

export interface IUser extends Document {
  id: string;
  name: string;
  email: string;
  phone?: string;
  password?: string;
  authProvider?: AuthProvider;
  avatar?: string;
  friendIds: string[];
  createdAt: string;
}

const UserSchema: Schema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  phone: { type: String, default: '' },
  // select: false keeps the hash out of every default query result (user lists,
  // sync, friend lookups, etc.) - it must be explicitly requested with
  // .select('+password') by the handful of routes that actually need it.
  password: { type: String, default: '', select: false },
  authProvider: { type: String, enum: ['local', 'google', 'ghost'], default: 'ghost' },
  avatar: { type: String, default: '' },
  friendIds: { type: [String], default: [] },
  createdAt: { type: String, default: () => new Date().toISOString() },
});

export const User: Model<IUser> = (mongoose.models.User as Model<IUser>) || mongoose.model<IUser>('User', UserSchema);
