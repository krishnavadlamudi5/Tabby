import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { User } from '../models/User';
import { Group } from '../models/Group';
import { Expense } from '../models/Expense';
import { Activity } from '../models/Activity';
import { sendEmailOtp, sendSmsOtp } from '../services/notificationService';
import { signToken } from '../middleware/auth';

const router = Router();

// ---------------------------------------------------------------------------
// Rate limiting
//
// Previously every /api/auth/* route (most importantly send-otp and
// verify-otp) had no throttling at all: a code is only 6 digits (1e6
// possibilities) and was valid for 10 minutes with unlimited guesses, and
// send-otp could be hit with an arbitrary destination with no limit -
// letting anyone email/SMS-bomb a victim for free. Two layers here:
//  1. IP-based rate limits (below) blunt both brute force and bombing from
//     any single source.
//  2. A per-destination attempt cap on the OTP entry itself (see
//     verify-otp/register) blunts distributed brute force that spreads
//     requests across many IPs against one target.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // generous ceiling for the whole auth surface
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
const sendOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // at most 5 codes requested per IP per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification code requests. Please wait a few minutes and try again.' },
});
const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // at most 20 verification attempts per IP per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});
// Applied per-route below (not router-wide) - the mobile Google handoff polls
// GET /mobile-session/:sessionId every 2.5s for up to 10 minutes while
// waiting for the system browser, which would blow through a router-wide
// limit on its own and break that sign-in flow.

// Ids allowed to use the zero-friction "1-click demo" login. Real accounts are
// never in this list, so this can't be used to bypass auth for anyone else -
// it just issues a normal session token for these specific seeded accounts.
const DEMO_USER_IDS = new Set(['user-alex', 'user-sarah']);

// Fields safe to hand back to a client - never the password hash.
function toPublicUser(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    friendIds: user.friendIds,
  };
}

// In-memory OTP storage with timestamp (TTL: 10 minutes)
interface OtpEntry {
  code: string;
  destination: string;
  expiresAt: number;
  type: 'register' | 'reset';
  attempts: number;
}
const otpStore = new Map<string, OtpEntry>();
const MAX_OTP_ATTEMPTS = 5;

// Records one failed verification attempt against a stored OTP and evicts it
// once too many wrong guesses have been made - even spread across many IPs,
// a code can't be brute forced more than MAX_OTP_ATTEMPTS times.
function registerFailedOtpAttempt(key: string, entry: OtpEntry): boolean {
  entry.attempts += 1;
  if (entry.attempts >= MAX_OTP_ATTEMPTS) {
    otpStore.delete(key);
    return true; // locked out
  }
  otpStore.set(key, entry);
  return false;
}

// Clean expired OTPs every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of otpStore.entries()) {
    if (val.expiresAt < now) {
      otpStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Helper to link temporary "ghost" friends created before actual user signup
async function linkGhostUser(newUserId: string, email: string, phone?: string) {
  try {
    let ghostUser = null;
    if (email) {
      ghostUser = await User.findOne({ email: email.toLowerCase().trim(), authProvider: 'ghost' });
    }
    if (!ghostUser && phone) {
      ghostUser = await User.findOne({ phone: phone.trim(), authProvider: 'ghost' });
    }

    if (!ghostUser || ghostUser.id === newUserId) return;
    const ghostId = ghostUser.id;

    // 1. Update friend IDs in other users
    await User.updateMany(
      { friendIds: ghostId },
      { $set: { 'friendIds.$[elem]': newUserId } },
      { arrayFilters: [{ elem: ghostId }] }
    );

    // 2. Update members in groups
    await Group.updateMany(
      { members: ghostId },
      { $set: { 'members.$[elem]': newUserId } },
      { arrayFilters: [{ elem: ghostId }] }
    );

    // 3. Update expenses
    await Expense.updateMany(
      { paidBy: ghostId },
      { $set: { paidBy: newUserId } }
    );
    await Expense.updateMany(
      { createdBy: ghostId },
      { $set: { createdBy: newUserId } }
    );
    await Expense.updateMany(
      { involvedUserIds: ghostId },
      { $set: { 'involvedUserIds.$[elem]': newUserId } },
      { arrayFilters: [{ elem: ghostId }] }
    );
    await Expense.updateMany(
      { 'splits.userId': ghostId },
      { $set: { 'splits.$[elem].userId': newUserId } },
      { arrayFilters: [{ 'elem.userId': ghostId }] }
    );

    // 4. Update activities
    await Activity.updateMany(
      { userId: ghostId },
      { $set: { userId: newUserId } }
    );

    // 5. Delete old ghost document
    await User.deleteOne({ id: ghostId });
    console.log(`Successfully linked ghost user ${ghostId} to real user ${newUserId}`);
  } catch (err) {
    console.error('Error linking ghost user:', err);
  }
}

// Helper to construct flexible phone queries
function getPhoneQuery(phoneInput: string) {
  const clean = phoneInput.trim();
  const digits = phoneInput.replace(/\D/g, '');
  const conditions: any[] = [{ phone: clean }];
  if (digits.length >= 7) {
    const suffix = digits.slice(-10);
    conditions.push({ phone: new RegExp(`${suffix}$`) });
    conditions.push({ email: `${digits}@tabby.app` });
  }
  return conditions;
}

// POST /api/auth/send-otp (Send 6-digit verification code for register or reset)
router.post('/send-otp', sendOtpLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { destination, type = 'register' } = req.body;
    if (!destination || !destination.trim()) {
      res.status(400).json({ error: 'Destination (email or phone) is required' });
      return;
    }

    const key = destination.trim().toLowerCase();
    
    if (type === 'reset') {
      // For reset, check if user exists
      let user = null;
      if (key.includes('@')) {
        user = await User.findOne({ email: key });
      } else {
        const phoneConditions = getPhoneQuery(destination);
        user = await User.findOne({ $or: phoneConditions });
      }

      if (!user) {
        res.status(404).json({ error: 'No account found with this email or phone number.' });
        return;
      }
    }

    // Generate secure 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpStore.set(key, {
      code,
      destination: key,
      expiresAt,
      type: type as 'register' | 'reset',
      attempts: 0
    });

    // Dispatch real email or SMS notification
    if (key.includes('@')) {
      await sendEmailOtp(key, code, type as 'register' | 'reset');
    } else {
      await sendSmsOtp(destination.trim(), code, type as 'register' | 'reset');
    }

    res.json({
      success: true,
      message: `Verification code sent to ${destination}`,
      expiresIn: 600
    });
  } catch (error: any) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: error.message || 'Failed to send OTP' });
  }
});

// POST /api/auth/verify-otp (Verify OTP)
router.post('/verify-otp', verifyOtpLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { destination, code } = req.body;
    if (!destination || !code) {
      res.status(400).json({ error: 'Destination and code are required' });
      return;
    }

    const key = destination.trim().toLowerCase();
    const entry = otpStore.get(key);

    if (!entry) {
      res.status(400).json({ error: 'Verification code expired or not requested. Please resend.' });
      return;
    }

    if (Date.now() > entry.expiresAt) {
      otpStore.delete(key);
      res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
      return;
    }

    if (entry.code !== code.trim()) {
      const lockedOut = registerFailedOtpAttempt(key, entry);
      res.status(400).json({
        error: lockedOut
          ? 'Too many incorrect attempts. Please request a new verification code.'
          : 'Invalid verification code. Please check and try again.'
      });
      return;
    }

    res.json({ success: true, message: 'OTP verified successfully' });
  } catch (error: any) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: error.message || 'Failed to verify OTP' });
  }
});

// POST /api/auth/reset-password (Reset password after OTP verification)
router.post('/reset-password', verifyOtpLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { destination, code, newPassword } = req.body;
    if (!destination || !code || !newPassword) {
      res.status(400).json({ error: 'Destination, code, and new password are required' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long' });
      return;
    }

    const key = destination.trim().toLowerCase();
    const entry = otpStore.get(key);

    if (!entry) {
      res.status(400).json({ error: 'Invalid or expired OTP code' });
      return;
    }
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(key);
      res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
      return;
    }
    if (entry.code !== code.trim()) {
      const lockedOut = registerFailedOtpAttempt(key, entry);
      res.status(400).json({
        error: lockedOut
          ? 'Too many incorrect attempts. Please request a new verification code.'
          : 'Invalid or expired OTP code'
      });
      return;
    }

    let user = null;
    if (key.includes('@')) {
      user = await User.findOne({ email: key });
    } else {
      const phoneConditions = getPhoneQuery(destination);
      user = await User.findOne({ $or: phoneConditions });
    }

    if (!user) {
      res.status(404).json({ error: 'User account not found' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    // Setting a real password makes this a password-loginable account.
    // Covers both "forgot password" for an existing local account and a
    // ghost placeholder claiming their account for the first time.
    user.authProvider = 'local';
    await user.save();

    // Invalidate OTP
    otpStore.delete(key);

    const token = signToken(user.id);
    res.json({ success: true, message: 'Password updated successfully', user: toPublicUser(user), token });
  } catch (error: any) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: error.message || 'Failed to reset password' });
  }
});

// POST /api/auth/register (Create account with OTP check)
router.post('/register', verifyOtpLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, phone, password, otp } = req.body;
    if (!name || !email) {
      res.status(400).json({ error: 'Name and email are required' });
      return;
    }
    // Server-side password policy - the client already enforces this, but the
    // API must never trust that. A 'local' account with no/weak password is
    // either unusable or an easy target, so reject it here regardless of what
    // the client sent.
    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // OTP is mandatory, not optional - previously this whole block only ran
    // `if (otp)`, and even then only rejected on a *mismatch*: if no entry
    // existed at all (send-otp was never called, or it had already expired),
    // the check silently passed and the account was created with the email
    // never actually verified. Now a missing/expired/mismatched code always
    // rejects registration.
    if (!otp || !otp.trim()) {
      res.status(400).json({ error: 'A verification code is required. Please request one first.' });
      return;
    }
    const otpKey = normalizedEmail;
    const phoneKey = phone ? phone.trim().toLowerCase() : null;
    const entry = otpStore.get(otpKey) || (phoneKey ? otpStore.get(phoneKey) : null);
    const matchedKey = otpStore.has(otpKey) ? otpKey : (phoneKey && otpStore.has(phoneKey) ? phoneKey : null);

    if (!entry || !matchedKey) {
      res.status(400).json({ error: 'Verification code expired or not requested. Please resend.' });
      return;
    }
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(matchedKey);
      res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
      return;
    }
    if (entry.code !== otp.trim()) {
      const lockedOut = registerFailedOtpAttempt(matchedKey, entry);
      res.status(400).json({
        error: lockedOut
          ? 'Too many incorrect attempts. Please request a new verification code.'
          : 'Invalid verification OTP code. Please check and try again.'
      });
      return;
    }
    otpStore.delete(matchedKey);

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser && existingUser.authProvider !== 'ghost') {
      res.status(400).json({ error: 'An account with this email address already exists. Please sign in instead.' });
      return;
    }

    const userId = existingUser ? existingUser.id : `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const hashedPassword = password ? await bcrypt.hash(password, 10) : '';
    const avatar = `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 1000000)}?auto=format&fit=crop&w=150&h=150&q=80`;

    let userDoc;
    if (existingUser) {
      existingUser.name = name.trim();
      existingUser.phone = phone || existingUser.phone;
      if (hashedPassword) existingUser.password = hashedPassword;
      existingUser.authProvider = 'local';
      if (!existingUser.avatar) existingUser.avatar = avatar;
      userDoc = await existingUser.save();
    } else {
      userDoc = await User.create({
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
        phone: phone || '',
        password: hashedPassword,
        authProvider: 'local',
        avatar,
        friendIds: [],
        createdAt: new Date().toISOString()
      });
    }

    await linkGhostUser(userId, normalizedEmail, phone);

    const token = signToken(userDoc.id);
    res.json({ success: true, user: toPublicUser(userDoc), token });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

// POST /api/auth/login (Sign In with Email/Phone + Password)
router.post('/login', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, password } = req.body;
    if (!identifier) {
      res.status(400).json({ error: 'Please enter your email or phone number' });
      return;
    }

    const trimmed = identifier.trim();
    let user = null;

    // .select('+password') is required - the schema hides the hash by default.
    if (trimmed.includes('@')) {
      user = await User.findOne({ email: trimmed.toLowerCase() }).select('+password');
    } else {
      const phoneConditions = getPhoneQuery(trimmed);
      user = await User.findOne({ $or: phoneConditions }).select('+password');
    }

    if (!user) {
      res.status(404).json({ error: 'No account found with this email or mobile number. Please create an account.' });
      return;
    }

    // Explicit provider check - never infer "no password required" from a
    // falsy field, since that also matches "field was never set". Legacy
    // documents created before `authProvider` existed are classified from
    // whether they have a password hash, and the classification is written
    // back so every future login for that account is unambiguous.
    let provider = user.authProvider;
    if (!provider) {
      provider = user.password ? 'local' : 'ghost';
      user.authProvider = provider;
      user.save().catch((e) => console.warn('authProvider backfill failed:', e));
    }

    if (provider === 'ghost') {
      res.status(403).json({ error: 'This contact has not created a Tabby account yet. Ask them to sign up first.' });
      return;
    }

    if (provider === 'google') {
      res.status(401).json({ error: 'This account uses Google Sign-In. Please continue with Google instead of a password.' });
      return;
    }

    // provider === 'local' from here on - a password match is mandatory.
    if (!password) {
      res.status(400).json({ error: 'Please enter your password.' });
      return;
    }
    if (!user.password) {
      // Defensive: a 'local' account should always have a hash. If it
      // somehow doesn't, there is no password to check it against - refuse
      // rather than silently letting the request through.
      res.status(401).json({ error: 'This account has no password set. Please use "Forgot password" to set one.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ error: 'Incorrect password. Please try again or reset your password.' });
      return;
    }

    const token = signToken(user.id);
    res.json({ success: true, user: toPublicUser(user), token });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message || 'Login failed' });
  }
});

// ---------------------------------------------------------------------------
// Google Authentication
// ---------------------------------------------------------------------------

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  '888676247797-cn7buordb6vqmd7qm6a35u8n6smievcr.apps.googleusercontent.com';

interface GoogleProfile {
  email: string;
  name?: string;
  avatar?: string;
  googleId?: string;
}

// Verifies a Google ID token (JWT credential) with Google and returns the profile.
// Never trust a raw email posted by a client - always go through this for new flows.
async function verifyGoogleIdToken(credential: string): Promise<GoogleProfile> {
  const resp = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
  );
  if (!resp.ok) {
    throw new Error('Google token verification failed. Please try signing in again.');
  }
  const payload: any = await resp.json();

  if (payload.aud !== GOOGLE_CLIENT_ID) {
    throw new Error('Google token was issued for a different application.');
  }
  if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
    throw new Error('Google token has an untrusted issuer.');
  }
  if (!payload.email) {
    throw new Error('Google token did not contain an email address.');
  }
  if (payload.email_verified === 'false' || payload.email_verified === false) {
    throw new Error('This Google account does not have a verified email address.');
  }

  return {
    email: payload.email,
    name: payload.name,
    avatar: payload.picture,
    googleId: payload.sub
  };
}

// Verifies a Google access token with Google userinfo API and returns the profile.
async function verifyGoogleAccessToken(accessToken: string): Promise<GoogleProfile> {
  const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!resp.ok) {
    throw new Error('Google token verification failed. Please try signing in again.');
  }
  const payload: any = await resp.json();

  if (!payload.email) {
    throw new Error('Google account did not provide an email address.');
  }
  if (payload.email_verified === false || payload.email_verified === 'false') {
    throw new Error('This Google account does not have a verified email address.');
  }

  return {
    email: payload.email,
    name: payload.name,
    avatar: payload.picture,
    googleId: payload.sub
  };
}

// Finds or creates the Tabby account behind a Google profile.
async function upsertGoogleUser(profile: GoogleProfile) {
  const normalizedEmail = profile.email.toLowerCase().trim();
  let user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    const userId = profile.googleId || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    user = await User.create({
      id: userId,
      name: profile.name || 'Google User',
      email: normalizedEmail,
      avatar: profile.avatar || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80`,
      authProvider: 'google',
      friendIds: [],
      createdAt: new Date().toISOString()
    });
  } else {
    if (profile.name && (!user.name || user.name === 'Google User')) user.name = profile.name;
    if (profile.avatar && !user.avatar) user.avatar = profile.avatar;
    // A verified Google login is proof of email ownership - it's safe to
    // upgrade a placeholder ('ghost') account here. Never downgrade an
    // existing 'local' account; they keep their password too.
    if (!user.authProvider || user.authProvider === 'ghost') user.authProvider = 'google';
    await user.save();
  }

  await linkGhostUser(user.id, normalizedEmail);

  return toPublicUser(user);
}

// POST /api/auth/google (Google Authentication)
// Accepts either { credential } (Google ID token from One Tap / Native)
// or { accessToken } (Google OAuth2 token from Popup chooser)
router.post('/google', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { credential, accessToken } = req.body;
    if (!credential && !accessToken) {
      res.status(400).json({ error: 'Google credential or accessToken is required' });
      return;
    }

    let profile: GoogleProfile;
    if (credential) {
      profile = await verifyGoogleIdToken(credential);
    } else {
      profile = await verifyGoogleAccessToken(accessToken);
    }

    const userObj = await upsertGoogleUser(profile);
    const token = signToken(userObj.id);
    res.json({ success: true, user: userObj, token });
  } catch (error: any) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: error.message || 'Google login failed' });
  }
});

// POST /api/auth/demo-login - zero-friction login for the fixed, seeded demo
// accounts shown on the login screen. Only ids in DEMO_USER_IDS are ever
// accepted, so this cannot be used to authenticate as a real account.
router.post('/demo-login', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;
    if (!userId || !DEMO_USER_IDS.has(userId)) {
      res.status(403).json({ error: 'Unknown demo account.' });
      return;
    }

    const user = await User.findOne({ id: userId });
    if (!user) {
      res.status(404).json({ error: 'Demo account is not seeded yet. Please try again in a moment.' });
      return;
    }

    const token = signToken(user.id);
    res.json({ success: true, user: toPublicUser(user), token });
  } catch (error: any) {
    console.error('Demo login error:', error);
    res.status(500).json({ error: error.message || 'Demo login failed' });
  }
});

// ---------------------------------------------------------------------------
// Mobile Google Sign-In handoff
//
// Google blocks OAuth and Google Identity Services inside embedded WebViews, so
// the Capacitor app cannot run the sign-in itself. Instead the app opens a
// short-lived handoff page in the system browser (where a real Google session
// exists), the browser completes sign-in against this server, and the app polls
// for the resulting account.
// ---------------------------------------------------------------------------

interface MobileSession {
  status: 'pending' | 'complete';
  user?: any;
  token?: string;
  expiresAt: number;
}
const mobileSessions = new Map<string, MobileSession>();
const MOBILE_SESSION_TTL = 10 * 60 * 1000; // 10 minutes

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of mobileSessions.entries()) {
    if (val.expiresAt < now) mobileSessions.delete(key);
  }
}, 5 * 60 * 1000);

function publicBaseUrl(req: Request) {
  const configured = process.env.APP_PUBLIC_URL;
  if (configured) return configured.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  return `${proto}://${req.get('host')}`;
}

// POST /api/auth/mobile-session/start - app asks for a handoff URL
router.post('/mobile-session/start', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const sessionId = `ms_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 12)}`;
  mobileSessions.set(sessionId, { status: 'pending', expiresAt: Date.now() + MOBILE_SESSION_TTL });
  res.json({
    success: true,
    sessionId,
    loginUrl: `${publicBaseUrl(req)}/api/auth/mobile-login?s=${encodeURIComponent(sessionId)}`,
    expiresIn: MOBILE_SESSION_TTL / 1000
  });
});

// POST /api/auth/mobile-session/complete - called by the handoff page in the browser
router.post('/mobile-session/complete', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId, credential } = req.body;
    if (!sessionId || !credential) {
      res.status(400).json({ error: 'sessionId and credential are required' });
      return;
    }

    const entry = mobileSessions.get(sessionId);
    if (!entry || entry.expiresAt < Date.now()) {
      mobileSessions.delete(sessionId);
      res.status(400).json({ error: 'This sign-in link has expired. Please try again from the app.' });
      return;
    }

    const profile = await verifyGoogleIdToken(credential);
    const userObj = await upsertGoogleUser(profile);
    const token = signToken(userObj.id);

    entry.status = 'complete';
    entry.user = userObj;
    entry.token = token;
    mobileSessions.set(sessionId, entry);

    res.json({ success: true, name: userObj.name, email: userObj.email });
  } catch (error: any) {
    console.error('Mobile Google session error:', error);
    res.status(500).json({ error: error.message || 'Google login failed' });
  }
});

// GET /api/auth/mobile-session/:sessionId - app polls until the browser finishes
router.get('/mobile-session/:sessionId', async (req: Request, res: Response): Promise<void> => {
  const entry = mobileSessions.get(req.params.sessionId);
  if (!entry || entry.expiresAt < Date.now()) {
    mobileSessions.delete(req.params.sessionId);
    res.json({ status: 'expired' });
    return;
  }
  if (entry.status === 'complete') {
    mobileSessions.delete(req.params.sessionId); // single use
    res.json({ status: 'complete', user: entry.user, token: entry.token });
    return;
  }
  res.json({ status: 'pending' });
});

// GET /api/auth/mobile-login?s=<sessionId> - the page opened in the system browser
router.get('/mobile-login', (req: Request, res: Response): void => {
  const safeSessionId = JSON.stringify(String(req.query.s || ''));
  const clientId = JSON.stringify(GOOGLE_CLIENT_ID);

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sign in to Tabby</title>
<script src="https://accounts.google.com/gsi/client" async defer></script>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#F8F5F2; color:#2C2B29; font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; padding:24px; }
  .card { background:#fff; border:1px solid #E6E1DA; border-radius:24px; padding:32px 24px;
          max-width:380px; width:100%; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,.06); }
  h1 { font-size:20px; margin:0 0 6px; color:#3C5A48; }
  p { font-size:14px; color:#736F6A; margin:0 0 22px; line-height:1.5; }
  #btn { display:flex; justify-content:center; min-height:44px; }
  .msg { margin-top:18px; font-size:14px; font-weight:600; }
  .ok { color:#3C5A48; } .err { color:#C0392B; }
</style>
</head>
<body>
  <div class="card">
    <h1>Sign in to Tabby</h1>
    <p id="lead">Choose your Google account. You will be returned to the app automatically.</p>
    <div id="btn"></div>
    <div id="msg" class="msg"></div>
  </div>
<script>
  var SESSION_ID = ${safeSessionId};
  var CLIENT_ID = ${clientId};

  function show(text, cls) {
    var m = document.getElementById('msg');
    m.textContent = text;
    m.className = 'msg ' + cls;
  }

  function onCredential(response) {
    show('Signing you in...', 'ok');
    fetch('/api/auth/mobile-session/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, credential: response.credential })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Sign-in failed');
        document.getElementById('btn').style.display = 'none';
        document.getElementById('lead').textContent = 'Signed in as ' + res.d.email + '.';
        show('All set - you can close this tab and return to Tabby.', 'ok');
      })
      .catch(function (e) { show(e.message || 'Sign-in failed. Please try again.', 'err'); });
  }

  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (window.google && window.google.accounts && window.google.accounts.id) {
      clearInterval(timer);
      if (!SESSION_ID) { show('Missing session. Please start again from the Tabby app.', 'err'); return; }
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: onCredential });
      window.google.accounts.id.renderButton(document.getElementById('btn'), {
        theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 280
      });
    } else if (tries > 40) {
      clearInterval(timer);
      show('Could not load Google Sign-In. Please check your connection and reload.', 'err');
    }
  }, 250);
</script>
</body>
</html>`);
});

export default router;
