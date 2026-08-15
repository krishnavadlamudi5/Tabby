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

// POST /api/auth/google (Google Authentication)
router.post('/google', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, name, avatar, googleId } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Google email is required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      const userId = googleId || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      user = await User.create({
        id: userId,
        name: name || 'Google User',
        email: normalizedEmail,
        avatar: avatar || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80`,
        friendIds: [],
        createdAt: new Date().toISOString()
      });
    } else {
      if (name && (!user.name || user.name === 'Google User')) user.name = name;
      if (avatar && !user.avatar) user.avatar = avatar;
      await user.save();
    }

    await linkGhostUser(user.id, normalizedEmail);

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
    console.error('Google auth error:', error);
    res.status(500).json({ error: error.message || 'Google login failed' });
  }
});

export default router;
