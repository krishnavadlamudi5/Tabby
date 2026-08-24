import { Request, Response, NextFunction } from 'express';

export interface AuthedRequest extends Request {
  userId?: string;
}

export function signToken(userId: string): string {
  return 'mock-token';
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  // Hardcoded to user-alex since login is removed
  req.userId = 'user-alex';
  next();
}
