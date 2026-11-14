import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { User } from '../models/User';
import { signToken } from '../middleware/auth';

/** Starts an in-memory MongoDB for the current test file and wipes it between tests. */
export function useTestDb(): void {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });

  afterEach(async () => {
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  });
}

/** Creates a signed-in user and returns it with a valid Authorization header value. */
export async function makeUser(id: string, overrides: Record<string, any> = {}) {
  const email = `${id}@example.com`;
  const user = await User.create({
    id,
    name: id,
    email,
    authProvider: 'google',
    friendIds: [],
    ...overrides,
  });
  return { user, auth: `Bearer ${signToken(id, email)}` };
}
