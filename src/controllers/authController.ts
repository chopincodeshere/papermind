import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import ChatFirestoreService from '../services/firebase';
import { signAuthToken } from '../services/authService';

const firestoreService = ChatFirestoreService.getInstance();
const MIN_PASSWORD_LENGTH = 6;

export const signUp = async (req: Request, res: Response): Promise<void> => {
  try {
    const identifier = String(req.body?.identifier || '').trim();
    const password = String(req.body?.password || '');

    if (!identifier || !password) {
      logAuthWarning('signup', 'missing_credentials', identifier);
      res.status(400).json({ message: 'Username/email and password are required.' });
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      logAuthWarning('signup', 'weak_password', identifier);
      res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await firestoreService.createAuthUser(identifier, passwordHash);
    if (!created.ok || !created.userId) {
      logAuthWarning('signup', created.message || 'signup_conflict', identifier);
      res.status(409).json({ message: created.message || 'An account with this username/email already exists.' });
      return;
    }

    const token = signAuthToken({ userId: created.userId, identifier });
    res.status(201).json({
      data: {
        token,
        user: {
          userId: created.userId,
          identifier,
        },
      },
      message: 'Signup successful',
    });
  } catch (error) {
    logAuthError('signup', error);
    res.status(500).json({ message: 'Unable to complete signup right now. Please try again.' });
  }
};

export const signIn = async (req: Request, res: Response): Promise<void> => {
  try {
    const identifier = String(req.body?.identifier || '').trim();
    const password = String(req.body?.password || '');

    if (!identifier || !password) {
      logAuthWarning('signin', 'missing_credentials', identifier);
      res.status(400).json({ message: 'Username/email and password are required.' });
      return;
    }

    const user = await firestoreService.findAuthUserByIdentifier(identifier);
    if (!user) {
      logAuthWarning('signin', 'user_not_found', identifier);
      res.status(401).json({ message: 'Invalid username/email or password.' });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      logAuthWarning('signin', 'invalid_password', identifier);
      res.status(401).json({ message: 'Invalid username/email or password.' });
      return;
    }

    const token = signAuthToken({ userId: user.id, identifier: user.identifier });
    res.json({
      data: {
        token,
        user: {
          userId: user.id,
          identifier: user.identifier,
        },
      },
      message: 'Signin successful',
    });
  } catch (error) {
    logAuthError('signin', error);
    res.status(500).json({ message: 'Unable to sign in right now. Please try again.' });
  }
};

export const me = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      logAuthWarning('me', 'missing_request_user');
      res.status(401).json({ message: 'Unauthorized. Please sign in again.' });
      return;
    }

    const user = await firestoreService.getAuthUserById(req.user.userId);
    if (!user) {
      logAuthWarning('me', 'user_not_found', req.user.userId);
      res.status(401).json({ message: 'Your account could not be found. Please sign in again.' });
      return;
    }

    res.json({
      data: {
        userId: user.id,
        identifier: user.identifier,
      },
    });
  } catch (error) {
    logAuthError('me', error);
    res.status(500).json({ message: 'Unable to load your profile right now.' });
  }
};

function logAuthWarning(action: string, reason: string, identifier?: string): void {
  console.warn(`[AUTH] ${action} failed: ${reason}${identifier ? ` (id=${identifier})` : ''}`);
}

function logAuthError(action: string, error: unknown): void {
  console.error(`[AUTH] ${action} error:`, error);
}
