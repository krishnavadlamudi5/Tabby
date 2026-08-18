import { Router, Response } from 'express';
import { User } from '../models/User';
import { Group } from '../models/Group';
import { Expense } from '../models/Expense';
import { Activity } from '../models/Activity';
import { seedDemoData } from '../seedDemo';
import { requireAuth, AuthedRequest } from '../middleware/auth';

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

    // Auto-seed demo data only for the fixed demo accounts, and only once.
    // This used to be reachable by anyone who could guess 'user-alex' as a
    // query param on the old public GET /api/sync/:userId. Now that this
    // route requires a valid session (router.use(requireAuth) above), the
    // only way to hold a token for these ids at all is via
    // POST /api/auth/demo-login, which only ever issues one for this exact
    // allowlist - so this check is effectively also access-controlled, not
    // just a data-shape check.
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
