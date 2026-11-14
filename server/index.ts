// Must be the first import: ES modules evaluate imports before any code in
// this file runs, and some route modules read process.env at import time.
import 'dotenv/config';

import mongoose from 'mongoose';
import { connectDB } from './db';
import { createApp } from './app';
import { assertAuthConfigured } from './middleware/auth';
import { seedDemoData } from './seedDemo';

// Refuse to boot without a JWT secret, rather than ever issuing or accepting
// tokens signed with a guessable default.
assertAuthConfigured();

const PORT = process.env.PORT || 5000;
const app = createApp();

if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGINS) {
  console.warn(
    '\nWARNING: CORS_ORIGINS is not set in production. Only the Capacitor app ' +
    '(https://localhost / capacitor://localhost) will be able to call this API - ' +
    'the deployed web frontend will be blocked by CORS until you set it.\n'
  );
}

// Personal-finance features need these; the shared-expense app runs without them.
const financeMissing = ['DATA_ENCRYPTION_KEY', 'INGEST_HMAC_SECRET', 'INGEST_OWNER_EMAIL', 'JOBS_SECRET']
  .filter((k) => !process.env[k]);
if (financeMissing.length) {
  console.warn(`Finance: not configured yet (${financeMissing.join(', ')}). See .env.example.`);
}
if (!process.env.R2_BUCKET && process.env.NODE_ENV === 'production') {
  console.warn('Finance: R2 is not configured; uploaded documents would be lost on redeploy.');
}

async function startServer() {
  await connectDB();
  // Demo users/groups/expenses are only ever written when explicitly asked
  // for (local development). Production databases never get them.
  if (process.env.SEED_DEMO === 'true' && mongoose.connection.readyState === 1) {
    await seedDemoData();
  }
  app.listen(PORT, () => {
    console.log(`🚀 Tabby Backend Server running at http://localhost:${PORT}`);
  });
}

startServer();
