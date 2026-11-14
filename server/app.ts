import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import groupRoutes from './routes/groups';
import expenseRoutes from './routes/expenses';
import activityRoutes from './routes/activities';
import syncRoutes from './routes/sync';
import receiptRoutes from './routes/receipt';
import financeRoutes from './finance/routes';

// ---------------------------------------------------------------------------
// CORS allowlist
//
// `cors()` with no options reflects *any* request origin. Lock it down to the
// origins this app actually runs from.
//
// - The Capacitor Android build always calls this API from a WebView whose
//   origin is the Capacitor default `https://localhost` (no `server.url`
//   override is configured - see capacitor.config.ts), so that's allowed
//   unconditionally.
// - Non-production (local dev) additionally allows any `http(s)://localhost:*`
//   origin, since Vite's dev proxy (vite.config.ts) forwards `/api` calls to
//   this server with a rewritten Origin matching whatever port it's running on.
// - The deployed web frontend's origin(s) (Netlify, custom domains, etc.)
//   must be set via CORS_ORIGINS (comma-separated) in production.
// - Requests with no Origin header (curl, server-to-server, most native HTTP
//   clients) are allowed - there's no browser session for a malicious page to
//   ride along with, so CORS provides no protection there anyway.
const CAPACITOR_ORIGINS = new Set(['https://localhost', 'capacitor://localhost']);

export function createApp() {
  const configuredOrigins = new Set(
    (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  );
  const isProduction = process.env.NODE_ENV === 'production';

  function isAllowedOrigin(origin: string): boolean {
    if (CAPACITOR_ORIGINS.has(origin)) return true;
    if (configuredOrigins.has(origin)) return true;
    if (!isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
    return false;
  }

  const app = express();

  // Render (and most PaaS hosts) sit behind one proxy hop; without this every
  // request appears to come from the proxy's IP and the rate limiter below
  // would throttle all users as one.
  app.set('trust proxy', 1);

  // Security headers. This server only ever returns JSON, so the defaults
  // (which include a strict CSP) are safe; cross-origin resource policy is
  // relaxed because the web app and the API live on different origins.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

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

  // Global per-IP limit for every API route. Individual routes (receipt scan,
  // Google sign-in) add their own stricter limits on top of this.
  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a few minutes and try again.' },
  }));

  // Database connection check
  app.use('/api', (req, res, next) => {
    if (req.path === '/health') return next();
    if (mongoose.connection.readyState !== 1) {
      res.status(503).json({
        error: 'The database is not connected yet. Please try again in a moment.'
      });
      return;
    }
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'Tabby API (MongoDB)' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/activities', activityRoutes);
  app.use('/api/sync', syncRoutes);
  app.use('/api/receipt', receiptRoutes);
  app.use('/api/finance', financeRoutes);

  // Anything else under /api is an unknown route - still JSON, never HTML.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // JSON error handler - without this, an error passed to next() (e.g. the
  // CORS middleware rejecting a disallowed origin, or malformed JSON) falls
  // through to Express's default handler, which renders an HTML stack trace.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.message === 'Not allowed by CORS') {
      res.status(403).json({ error: 'This origin is not allowed to access the API.' });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Request body is not valid JSON.' });
      return;
    }
    console.error('Unhandled error:', err);
    res.status(err?.status || 500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
