import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tabby';

let retryTimer: NodeJS.Timeout | null = null;
let attempt = 0;

/** Hides the password in a connection string before logging it. */
function redact(uri: string): string {
  return uri.replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:****@');
}

async function tryConnect(): Promise<boolean> {
  attempt += 1;
  try {
    console.log(`Connecting to MongoDB (attempt ${attempt})...`);
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
    console.log('Connected to MongoDB successfully!');
    attempt = 0;
    return true;
  } catch (error: any) {
    console.error(`MongoDB connection error (${redact(MONGODB_URI)}):`, error?.code || '', error?.message || error);
    if (error?.code === 'ENOTFOUND' || /querySrv/.test(error?.message || '')) {
      console.error('-> The cluster address in MONGODB_URI does not exist. In Atlas: Connect -> Drivers, copy the connection string again.');
    } else if (/auth|bad auth|Authentication/i.test(error?.message || '')) {
      console.error('-> Wrong database username or password in MONGODB_URI.');
    } else if (/whitelist|IP|timed out|ServerSelection/i.test(error?.message || '')) {
      console.error('-> Atlas may be blocking this server: Network Access must allow 0.0.0.0/0.');
    }
    return false;
  }
}

/**
 * Connects once, and if that fails keeps retrying in the background
 * (15 s, 30 s, then every 60 s) instead of giving up. The HTTP server starts
 * either way, so the health check passes and API calls return a clear 503
 * until the database is reachable.
 */
export async function connectDB(): Promise<void> {
  if (mongoose.connection.readyState >= 1) return;
  if (await tryConnect()) return;
  scheduleRetry();
}

function scheduleRetry() {
  if (retryTimer) return;
  const delay = Math.min(60_000, 15_000 * Math.max(1, attempt));
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    if (mongoose.connection.readyState >= 1) return;
    if (!(await tryConnect())) scheduleRetry();
  }, delay);
}

mongoose.connection.on('disconnected', () => {
  // The driver reconnects on its own after a successful first connection.
  console.warn('MongoDB disconnected; the driver will reconnect.');
});
