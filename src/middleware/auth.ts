import { NextFunction, Request, Response } from 'express';
import { verifyAuthToken } from '../services/authService';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn(`[AUTH] middleware missing/invalid authorization header on ${req.method} ${req.originalUrl}`);
    res.status(401).json({ message: 'Unauthorized. Missing Bearer token.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    console.warn(`[AUTH] middleware empty bearer token on ${req.method} ${req.originalUrl}`);
    res.status(401).json({ message: 'Unauthorized. Token was empty.' });
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    req.user = payload;
    next();
  } catch (error) {
    console.warn(`[AUTH] middleware token verification failed on ${req.method} ${req.originalUrl}:`, error);
    res.status(401).json({ message: 'Invalid or expired token. Please sign in again.' });
  }
}
