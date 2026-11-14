import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../models/User';
import { signToken } from '../middleware/auth';
import { DEMO_USERS_SEED } from '../seedDemo';
import { ensureDefaultCategories } from '../finance/services/categories';

const router = Router();

// The web client ID is public (it ships in the web bundle and the APK), so a
// default is fine; override with env vars if the Google Cloud project changes.
const DEFAULT_WEB_CLIENT_ID = '888676247797-cn7buordb6vqmd7qm6a35u8n6smievcr.apps.googleusercontent.com';

function allowedAudiences(): string[] {
  const ids = [
    process.env.GOOGLE_WEB_CLIENT_ID || DEFAULT_WEB_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ];
  return ids.filter((id): id is string => Boolean(id && id.trim())).map((id) => id.trim());
}

const DEMO_IDS = new Set(DEMO_USERS_SEED.map((u) => u.id));

export interface GoogleProfile {
  email: string;
  name?: string;
  picture?: string;
}

const googleClient = new OAuth2Client();

/**
 * Verifies a Google ID token's signature, issuer, expiry and audience, and
 * returns the verified profile. Exported so tests can replace it.
 */
export const googleVerifier = {
  async verify(idToken: string): Promise<GoogleProfile> {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: allowedAudiences() });
    const payload = ticket.getPayload();
    if (!payload?.email) throw new Error('Google account did not provide an email address.');
    if (!payload.email_verified) throw new Error('This Google account does not have a verified email address.');
    return { email: payload.email, name: payload.name, picture: payload.picture };
  },
};

const googleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' },
});

/** Initials avatar as an inline SVG data URI (no third-party image service sees the name). */
export function initialsAvatar(name: string): string {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="48" fill="#3C5A48"/><text x="50%" y="54%" font-family="Arial,sans-serif" font-size="38" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="middle">${initials.replace(/[<&>"]/g, '')}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function newUserId(): string {
  return `u_${randomBytes(9).toString('base64url')}`;
}

// POST /api/auth/google - body { idToken } (also accepts { credential }, the
// field name Google Identity Services uses on the web).
// Returns { success, token, user }.
router.post('/google', googleLimiter, async (req: Request, res: Response): Promise<void> => {
  const idToken = req.body?.idToken || req.body?.credential;
  if (!idToken || typeof idToken !== 'string') {
    res.status(400).json({ error: 'idToken is required.' });
    return;
  }

  let profile: GoogleProfile;
  try {
    profile = await googleVerifier.verify(idToken);
  } catch (err: any) {
    console.warn('Google token rejected:', err?.message);
    res.status(401).json({ error: 'Google sign-in could not be verified. Please try again.' });
    return;
  }

  try {
    const email = profile.email.toLowerCase().trim();
    let user = await User.findOne({ email });

    if (user && DEMO_IDS.has(user.id)) {
      // Seeded demo accounts use real-looking addresses; never hand one of
      // them (and its demo groups) to whoever owns that Gmail address.
      res.status(409).json({ error: 'This email is reserved for demo data. Please use another Google account.' });
      return;
    }

    if (!user) {
      user = await User.create({
        id: newUserId(),
        name: profile.name || email.split('@')[0],
        email,
        avatar: profile.picture || initialsAvatar(profile.name || email),
        authProvider: 'google',
        friendIds: [],
        createdAt: new Date().toISOString(),
      });
    } else {
      // A verified Google sign-in proves ownership of the email, so a ghost
      // placeholder (created when a friend added this address) is claimed
      // here and keeps all the expenses already shared with it.
      let changed = false;
      if (user.authProvider !== 'google') {
        user.authProvider = 'google';
        changed = true;
      }
      if (profile.name && (!user.name || user.name === email.split('@')[0])) {
        user.name = profile.name;
        changed = true;
      }
      if (!user.avatar) {
        user.avatar = profile.picture || initialsAvatar(user.name || email);
        changed = true;
      }
      if (changed) await user.save();
    }

    // Default finance categories on first sign-in. Never blocks login.
    try {
      await ensureDefaultCategories(user.id);
    } catch (err) {
      console.warn('Category seeding failed:', err);
    }

    const token = signToken(user.id, email);
    res.json({ success: true, token, user: user.toJSON() });
  } catch (err: any) {
    console.error('Google sign-in error:', err);
    res.status(500).json({ error: 'Sign-in failed. Please try again.' });
  }
});

export default router;
