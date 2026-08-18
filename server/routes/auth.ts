import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { Group } from '../models/Group';
import { Expense } from '../models/Expense';
import { Activity } from '../models/Activity';
import { sendEmailOtp, sendSmsOtp } from '../services/notificationService';

const router = Router();

// In-memory OTP storage with timestamp (TTL: 10 minutes)
interface OtpEntry {
  code: string;
  destination: string;
  expiresAt: number;
  type: 'register' | 'reset';
}
const otpStore = new Map<string, OtpEntry>();

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
      ghostUser = await User.findOne({ email: email.toLowerCase().trim(), id: /^user-/ });
    }
    if (!ghostUser && phone) {
      ghostUser = await User.findOne({ phone: phone.trim(), id: /^user-/ });
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
router.post('/send-otp', async (req: Request, res: Response): Promise<void> => {
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
      type: type as 'register' | 'reset'
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
router.post('/verify-otp', async (req: Request, res: Response): Promise<void> => {
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
      res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
      return;
    }

    res.json({ success: true, message: 'OTP verified successfully' });
  } catch (error: any) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: error.message || 'Failed to verify OTP' });
  }
});

// POST /api/auth/reset-password (Reset password after OTP verification)
router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
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

    if (!entry || entry.code !== code.trim()) {
      res.status(400).json({ error: 'Invalid or expired OTP code' });
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
    await user.save();

    // Invalidate OTP
    otpStore.delete(key);

    const userObj = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      friendIds: user.friendIds
    };

    res.json({ success: true, message: 'Password updated successfully', user: userObj });
  } catch (error: any) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: error.message || 'Failed to reset password' });
  }
});

// POST /api/auth/register (Create account with OTP check)
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, phone, password, otp } = req.body;
    if (!name || !email) {
      res.status(400).json({ error: 'Name and email are required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    
    // If OTP provided, verify it
    if (otp) {
      const entry = otpStore.get(normalizedEmail) || (phone ? otpStore.get(phone.trim().toLowerCase()) : null);
      if (entry && entry.code !== otp.trim()) {
        res.status(400).json({ error: 'Invalid verification OTP code. Please check and try again.' });
        return;
      }
      if (entry) {
        otpStore.delete(normalizedEmail);
        if (phone) otpStore.delete(phone.trim().toLowerCase());
      }
    }

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser && !existingUser.id.startsWith('user-')) {
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
      if (!existingUser.avatar) existingUser.avatar = avatar;
      userDoc = await existingUser.save();
    } else {
      userDoc = await User.create({
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
        phone: phone || '',
        password: hashedPassword,
        avatar,
        friendIds: [],
        createdAt: new Date().toISOString()
      });
    }

    await linkGhostUser(userId, normalizedEmail, phone);

    const userObj = {
      id: userDoc.id,
      name: userDoc.name,
      email: userDoc.email,
      phone: userDoc.phone,
      avatar: userDoc.avatar,
      friendIds: userDoc.friendIds
    };

    res.json({ success: true, user: userObj });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

// POST /api/auth/login (Sign In with Email/Phone + Password)
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, password } = req.body;
    if (!identifier) {
      res.status(400).json({ error: 'Please enter your email or phone number' });
      return;
    }

    const trimmed = identifier.trim();
    let user = null;

    if (trimmed.includes('@')) {
      user = await User.findOne({ email: trimmed.toLowerCase() });
    } else {
      const phoneConditions = getPhoneQuery(trimmed);
      user = await User.findOne({ $or: phoneConditions });
    }

    if (!user) {
      res.status(404).json({ error: 'No account found with this email or mobile number. Please create an account.' });
      return;
    }

    if (user.password && password) {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        res.status(401).json({ error: 'Incorrect password. Please try again or reset your password.' });
        return;
      }
    }

    const userObj = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      friendIds: user.friendIds
    };

    res.json({ success: true, user: userObj });
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
      friendIds: [],
      createdAt: new Date().toISOString()
    });
  } else {
    if (profile.name && (!user.name || user.name === 'Google User')) user.name = profile.name;
    if (profile.avatar && !user.avatar) user.avatar = profile.avatar;
    await user.save();
  }

  await linkGhostUser(user.id, normalizedEmail);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    friendIds: user.friendIds
  };
}

// POST /api/auth/google (Google Authentication)
// Preferred body: { credential } - a Google ID token, verified server-side.
// Legacy body: { email, name, avatar, googleId } - kept so already-installed app
// bundles that predate token verification keep working.
router.post('/google', async (req: Request, res: Response): Promise<void> => {
  try {
    const { credential, email, name, avatar, googleId } = req.body;

    let profile: GoogleProfile;
    if (credential) {
      profile = await verifyGoogleIdToken(credential);
    } else if (email) {
      profile = { email, name, avatar, googleId };
    } else {
      res.status(400).json({ error: 'Google credential is required' });
      return;
    }

    const userObj = await upsertGoogleUser(profile);
    res.json({ success: true, user: userObj });
  } catch (error: any) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: error.message || 'Google login failed' });
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
router.post('/mobile-session/start', async (req: Request, res: Response): Promise<void> => {
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

    entry.status = 'complete';
    entry.user = userObj;
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
    res.json({ status: 'complete', user: entry.user });
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
