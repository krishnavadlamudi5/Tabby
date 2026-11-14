import { Response } from 'express';
import { ZodError, ZodType } from 'zod';
import { AuthedRequest } from '../../middleware/auth';

/** Every finance query is filtered by this. */
export function scoped(req: AuthedRequest): { ownerId: string } {
  if (!req.userId) throw new Error('scoped() used on an unauthenticated request');
  return { ownerId: req.userId };
}

/**
 * Validates `data` with a zod schema. On failure sends 400 with field errors
 * and returns undefined, so handlers can `if (!body) return;`.
 */
export function validate<T>(schema: ZodType<T>, data: unknown, res: Response): T | undefined {
  const result = schema.safeParse(data);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid request', details: formatZod(result.error) });
    return undefined;
  }
  return result.data;
}

export function formatZod(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function isObjectId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);
}

/** Wraps an async handler so thrown errors become a JSON 500 instead of a hang. */
export function handler(fn: (req: AuthedRequest, res: Response) => Promise<void>) {
  return (req: AuthedRequest, res: Response) => {
    fn(req, res).catch((err) => {
      console.error('Finance route error:', err);
      if (!res.headersSent) {
        const status = err?.status && err.status < 500 ? err.status : 500;
        res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : err.message });
      }
    });
  };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function pageLimit(raw: unknown, def = 50, max = 200): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(max, Math.floor(n));
}
