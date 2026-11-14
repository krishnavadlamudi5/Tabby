import { Router, Response } from 'express';
import { User } from '../models/User';
import { Group } from '../models/Group';
import { Expense } from '../models/Expense';
import { Activity } from '../models/Activity';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { findVisibleUsers } from '../services/userVisibility';

const router = Router();

router.use(requireAuth);

// GET /api/sync/me - fast unified sync for the authenticated caller only.
// The old GET /api/sync/:userId let anyone pull any other user's full
// profile, groups, expenses and activities just by knowing/guessing their
// id. There is no legitimate reason to sync anyone but yourself, so the
// param is gone entirely.
router.get('/me', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId as string;

    const currentUser = await User.findOne({ id: userId });

    const [users, groups, expenses, activities] = await Promise.all([
      findVisibleUsers(userId),
      Group.find({ members: userId }).sort({ createdAt: -1 }),
      Expense.find({
        $or: [
          { paidBy: userId },
          { involvedUserIds: userId },
          { createdBy: userId },
          { 'splits.userId': userId }
        ]
      }).sort({ createdAt: -1 }),
      Activity.find({
        $or: [
          { userId },
          { type: 'app_update' }
        ]
      }).sort({ timestamp: -1 }).limit(50)
    ]);

    res.json({
      success: true,
      currentUser,
      users,
      groups,
      expenses,
      activities
    });
  } catch (error: any) {
    console.error('Sync error:', error);
    res.status(500).json({ error: error.message || 'Failed to sync data' });
  }
});

export default router;
