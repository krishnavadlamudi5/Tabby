import { Router, Request, Response } from 'express';
import { User } from '../models/User';

const router = Router();

// GET /api/users?ids=id1,id2
router.get('/', async (req: Request, res: Response): Promise<void> => {
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

// POST /api/users (upsert/save user)
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userData = req.body;
    if (!userData.id) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    const updated = await User.findOneAndUpdate(
      { id: userData.id },
      { $set: userData },
      { upsert: true, new: true }
    );

    res.json({ success: true, user: updated });
  } catch (error: any) {
    console.error('Save user error:', error);
    res.status(500).json({ error: error.message || 'Failed to save user' });
  }
});

// PUT /api/users/:id (update profile)
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const user = await User.findOneAndUpdate(
      { id },
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
router.post('/friend', async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentUserId, name, email } = req.body;
    if (!currentUserId || !name) {
      res.status(400).json({ error: 'currentUserId and name are required' });
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
