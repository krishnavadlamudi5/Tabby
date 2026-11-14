import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { createHmac, randomBytes } from 'crypto';

dotenv.config();

// JWT_SECRET should be set explicitly. If it isn't (e.g. not yet added on
// Render), derive a stable secret from MONGODB_URI - itself a secret - so the
// API keeps running and sessions survive restarts, instead of crashing the
// whole backend. Never fall back to a guessable constant.
function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.MONGODB_URI) {
    console.warn(
      '\nWARNING: JWT_SECRET is not set; deriving one from MONGODB_URI. ' +
      'Set JWT_SECRET explicitly in your host env vars.\n'
    );
    return createHmac('sha256', process.env.MONGODB_URI).update('tabby-jwt-secret-v1').digest('hex');
  }
  console.error(
    '\nFATAL: JWT_SECRET environment variable is not set.\n' +
    'Set JWT_SECRET to a long random string in your .env file (and in your Render/host env vars) before starting the server.\n' +
    'Example: JWT_SECRET="' + randomBytes(48).toString('hex') + '"\n'
  );
  process.exit(1);
}

const JWT_SECRET = resolveJwtSecret();

const TOKEN_TTL = '90d';

export interface AuthedRequest extends Request {
  userId?: string;
}

/** Issues a signed session token for a given internal user id. */
export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET as string, { expiresIn: TOKEN_TTL });
}

/**
 * Requires a valid `Authorization: Bearer <token>` header and attaches the
 * verified user id to `req.userId`. Every data route that acts on "the
 * current user" must read identity from here, never from the request body
 * or query string, since those are attacker-controlled.
 */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'Not authenticated. Please sign in again.' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET as string) as { sub: string };
    if (!payload?.sub) {
      res.status(401).json({ error: 'Invalid session. Please sign in again.' });
      return;
    }
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}
