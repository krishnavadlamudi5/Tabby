import { Router, Response } from 'express';
import { User } from '../models/User';
import { requireAuth, AuthedRequest } from '../middleware/auth';

const router = Router();

// Fields a user is allowed to change about themselves via this router.
// id, email, password and authProvider are deliberately excluded - those
// have their own dedicated, more carefully-guarded flows (auth.ts).
const PROFILE_WHITELIST = ['name', 'phone', 'avatar'] as const;

function pickWhitelisted(body: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of PROFILE_WHITELIST) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

// All routes below require a valid session.
router.use(requireAuth);

// GET /api/users?ids=id1,id2 - used to resolve names/avatars for friends and
// group members. Read-only and deliberately not restricted to "my" ids
// (any signed-in user can look up public profile fields for anyone they
// already know the id of), but the password hash is never selected/returned.
router.get('/', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const idsQuery = req.query.ids as string;
    let users;
    if (idsQuery) {
      const ids = idsQuery.split(',').map(i => i.trim()).filter(Boolean);
      users = await User.find({ id: { $in: ids } });
    } else {
      users = await User.find().limit(100);
    }

    res.json({ success: true, users });
  } catch (error: any) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch users' });
  }
});

// PUT /api/users/me (update own profile)
// Replaces the old unauthenticated POST / upsert, which let any caller
// overwrite any user document (including the password field) just by
// supplying an id. Only the caller's own row, and only whitelisted fields,
// can ever be touched here.
router.put('/me', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const updates = pickWhitelisted(req.body);
    const user = await User.findOneAndUpdate(
      { id: req.userId },
      { $set: updates },
      { new: true }
    );

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ success: true, user });
  } catch (error: any) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: error.message || 'Failed to update profile' });
  }
});

// PUT /api/users/:id - kept for backward compatibility with the shape the
// frontend historically used, but it can only ever target the caller's own
// account (mismatched ids are rejected) and only whitelisted fields apply.
router.put('/:id', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    if (req.params.id !== req.userId) {
      res.status(403).json({ error: 'You can only update your own profile.' });
      return;
    }

    const updates = pickWhitelisted(req.body);
    const user = await User.findOneAndUpdate(
      { id: req.userId },
      { $set: updates },
      { new: true }
    );

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ success: true, user });
  } catch (error: any) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: error.message || 'Failed to update profile' });
  }
});

// POST /api/users/friend (add a friend)
// currentUserId is now always taken from the authenticated session, never
// the request body, so a caller can no longer add friends onto someone
// else's account.
router.post('/friend', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const { name, email } = req.body;
    const currentUserId = req.userId as string;
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const cleanEmail = (email || '').toLowerCase().trim();
    let friendUser = null;

    if (cleanEmail) {
      friendUser = await User.findOne({ email: cleanEmail });
    }

    if (!friendUser) {
      const friendId = `user-${Date.now()}`;
      const avatar = `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 1000000)}?auto=format&fit=crop&w=150&h=150&q=80`;
      friendUser = await User.create({
        id: friendId,
        name: name.trim(),
        email: cleanEmail || `${friendId}@tabby.local`,
        avatar,
        authProvider: 'ghost',
        friendIds: [currentUserId],
        createdAt: new Date().toISOString()
      });
    }

    // Add friend ID to current user's friendIds
    const currentUser = await User.findOneAndUpdate(
      { id: currentUserId },
      { $addToSet: { friendIds: friendUser.id } },
      { new: true }
    );

    res.json({ success: true, friend: friendUser, currentUser });
  } catch (error: any) {
    console.error('Add friend error:', error);
    res.status(500).json({ error: error.message || 'Failed to add friend' });
  }
});

export default router;
