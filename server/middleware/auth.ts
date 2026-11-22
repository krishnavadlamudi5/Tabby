import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { User } from '../models/User';

const TOKEN_TTL = '30d';

export interface AuthedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

interface TokenPayload {
  sub: string;
  email?: string;
  /** User.tokenVersion when issued (absent on older tokens = 0). */
  v?: number;
}

// Read lazily (not at import time) so tests and scripts can set the env first.
export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

/**
 * Called once at server start. Exits the process when JWT_SECRET is missing
 * so the server can never run with forgeable sessions.
 */
export function assertAuthConfigured(): void {
  if (!process.env.JWT_SECRET) {
    console.error(
      '\nFATAL: JWT_SECRET environment variable is not set.\n' +
      'Set JWT_SECRET to a long random string in your .env file (and in your Render env vars) before starting the server.\n' +
      'Example: JWT_SECRET="' + randomBytes(48).toString('hex') + '"\n'
    );
    process.exit(1);
  }
}

/** Issues a signed 30-day session token for an internal user id. */
export function signToken(userId: string, email?: string, version = 0): string {
  const payload: TokenPayload = { sub: userId, v: version };
  if (email) payload.email = email;
  return jwt.sign(payload, jwtSecret(), { expiresIn: TOKEN_TTL });
}

/**
 * Requires a valid `Authorization: Bearer <token>` header and attaches the
 * verified user id to `req.userId`. Every route that acts on "the current
 * user" must read identity from here, never from the body or query string.
 */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'Not signed in. Please sign in again.' });
    return;
  }

  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, jwtSecret()) as TokenPayload;
  } catch {
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return;
  }
  if (!payload?.sub) {
    res.status(401).json({ error: 'Invalid session. Please sign in again.' });
    return;
  }
  // The account must still exist and the token must not predate a
  // "sign out of all devices".
  User.findOne({ id: payload.sub }, { tokenVersion: 1 }).lean()
    .then((user: any) => {
      if (!user || (user.tokenVersion || 0) !== (payload.v || 0)) {
        res.status(401).json({ error: 'You were signed out. Please sign in again.' });
        return;
      }
      req.userId = payload.sub;
      req.userEmail = payload.email;
      next();
    })
    .catch(() => res.status(503).json({ error: 'Please try again in a moment.' }));
}

/**
 * Optional allowlist for the personal-finance routes (/api/finance/*).
 * When ALLOWED_EMAILS is set (comma-separated), only those accounts may use
 * them; shared-expense features stay open to every signed-in user.
 * Must run after requireAuth.
 */
export function requireAllowedEmail(req: AuthedRequest, res: Response, next: NextFunction): void {
  const allowed = (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) {
    next();
    return;
  }
  const email = (req.userEmail || '').toLowerCase();
  if (!email || !allowed.includes(email)) {
    res.status(403).json({ error: 'This account is not allowed to use finance features.' });
    return;
  }
  next();
}
