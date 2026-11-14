import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { connectDB } from './db';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import groupRoutes from './routes/groups';
import expenseRoutes from './routes/expenses';
import activityRoutes from './routes/activities';
import syncRoutes from './routes/sync';
import receiptRoutes from './routes/receipt';

import { seedDemoData } from './seedDemo';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ---------------------------------------------------------------------------
// CORS allowlist
//
// `cors()` with no options reflects *any* request origin, which - combined
// with the fact that these routes now carry a Bearer token, not a cookie -
// is mostly a data-exfiltration risk for logged-in users on other tabs
// running malicious page JS (fetch() still runs same-origin-policy-free
// cross-origin without CORS, but a browser will only let the calling page
// *read* the response if the origin was allowed). Lock it down to origins
// this app actually runs from.
//
// - The Capacitor Android build always calls this API from a WebView whose
//   origin is the Capacitor default `https://localhost` (no `server.url`
//   override is configured - see capacitor.config.ts), so that's allowed
//   unconditionally.
// - Non-production (local dev) additionally allows any `http(s)://localhost:*`
//   origin, since Vite's dev proxy (vite.config.ts) forwards `/api` calls to
//   this server with a rewritten Origin matching whatever port it's running
//   on - hardcoding one port would break `npm run dev` on a different port.
// - The deployed web frontend's origin(s) (Netlify, custom domains, etc.)
//   must be set via CORS_ORIGINS (comma-separated) in production.
// - Requests with no Origin header (curl, server-to-server, most native HTTP
//   clients) are allowed - there's no browser session/cookie for a
//   malicious page to ride along with, so CORS provides no protection there
//   anyway.
const CAPACITOR_ORIGINS = new Set(['https://localhost', 'capacitor://localhost']);
const configuredOrigins = new Set(
  (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
);
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && configuredOrigins.size === 0) {
  console.warn(
    '\nWARNING: CORS_ORIGINS is not set in production. Only the Capacitor app ' +
    '(https://localhost / capacitor://localhost) will be able to call this API - ' +
    'the deployed web frontend will be blocked by CORS until you set it.\n'
  );
}

function isAllowedOrigin(origin: string): boolean {
  if (CAPACITOR_ORIGINS.has(origin)) return true;
  if (configuredOrigins.has(origin)) return true;
  if (!isProduction && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: false, // Bearer tokens are sent explicitly, not via cookies.
}));
app.use(express.json({ limit: '10mb' }));

// Database connection check middleware
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({
      error: 'MongoDB is not connected yet. Please check your database password in the .env file and restart the server.'
    });
    return;
  }
  next();
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'Tabby API (MongoDB)' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/receipt', receiptRoutes);

// JSON error handler - without this, an error passed to next() (e.g. the
// CORS middleware rejecting a disallowed origin) falls through to Express's
// default handler, which renders an HTML page with a full stack trace. Every
// route already catches its own errors and responds with JSON, so this is
// mainly a safety net for CORS rejections and anything unexpected.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.message === 'Not allowed by CORS') {
    res.status(403).json({ error: 'This origin is not allowed to access the API.' });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(err?.status || 500).json({ error: 'Something went wrong. Please try again.' });
});

// Start Server
async function startServer() {
  await connectDB();
  if (mongoose.connection.readyState === 1) {
    await seedDemoData();
  }
  app.listen(PORT, () => {
    console.log(`🚀 Tabby Backend Server running at http://localhost:${PORT}`);
  });
}

startServer();
