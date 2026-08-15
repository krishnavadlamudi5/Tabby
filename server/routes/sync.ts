import { Router, Request, Response } from 'express';
import { User } from '../models/User';
import { Group } from '../models/Group';
import { Expense } from '../models/Expense';
import { Activity } from '../models/Activity';
import { seedDemoData } from '../seedDemo';

const router = Router();

// GET /api/sync/:userId - Fast unified sync
router.get('/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    // Auto-seed demo data if demo user requested and not yet seeded
    if (userId === 'user-alex' || userId === 'user-sarah') {
      const demoCount = await Group.countDocuments({ members: userId });
      if (demoCount === 0) {
        await seedDemoData();
      }
    }

    let currentUser = await User.findOne({ id: userId });
    const friendIds = currentUser?.friendIds || [];
    const idsToFetch = Array.from(new Set([userId, ...friendIds]));

    const [users, groups, expenses, activities] = await Promise.all([
      User.find({
        $or: [
          { id: { $in: idsToFetch } },
          { friendIds: userId }
        ]
      }),
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
