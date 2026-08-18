import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { randomBytes } from 'crypto';

dotenv.config();

// JWT_SECRET is mandatory. Refusing to boot without one prevents the server
// from ever silently issuing/accepting tokens signed with a guessable default.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error(
    '\nFATAL: JWT_SECRET environment variable is not set.\n' +
    'Set JWT_SECRET to a long random string in your .env file (and in your Render/host env vars) before starting the server.\n' +
    'Example: JWT_SECRET="' + randomBytes(48).toString('hex') + '"\n'
  );
  process.exit(1);
}

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
