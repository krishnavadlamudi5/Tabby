import mongoose, { Schema, Model } from 'mongoose';

// Note: these helpers deliberately avoid Mongoose's generic inference
// (typed SchemaOptions / model<T>(name, schema) overloads), which makes the
// TypeScript checker run out of memory on schemas this size. Each model file
// declares an explicit interface instead.

/** Shared options: createdAt/updatedAt, and JSON with `id` instead of `_id`. */
export function financeSchemaOptions(hidden: string[] = []): any {
  return {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(_doc: unknown, ret: Record<string, any>) {
        ret.id = String(ret._id);
        delete ret._id;
        for (const field of hidden) delete ret[field];
        return ret;
      },
    },
  };
}

/** Re-uses a compiled model in watch mode / tests instead of recompiling it. */
export function model<T>(name: string, schema: Schema<any>): Model<T> {
  const existing = (mongoose.models as Record<string, unknown>)[name];
  if (existing) return existing as Model<T>;
  return (mongoose.model as any)(name, schema) as Model<T>;
}

export const ownerField = { type: String, required: true, index: true };
