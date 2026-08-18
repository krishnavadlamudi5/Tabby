import { Router, Response } from 'express';
import { Activity } from '../models/Activity';
import { requireAuth, AuthedRequest } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// GET /api/activities - always scoped to the authenticated caller.
router.get('/', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const activities = await Activity.find({
      $or: [
        { userId: req.userId },
        { type: 'app_update' }
      ]
    }).sort({ timestamp: -1 }).limit(100);

    res.json({ success: true, activities });
  } catch (error: any) {
    console.error('Fetch activities error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch activities' });
  }
});

// POST /api/activities (create activity)
// userId is always the authenticated caller - a client can no longer log an
// activity as if it were performed by someone else.
router.post('/', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const actData = { ...req.body, userId: req.userId };
    if (!actData.id || !actData.description) {
      res.status(400).json({ error: 'id and description are required' });
      return;
    }

    const activity = await Activity.findOneAndUpdate(
      { id: actData.id },
      { $set: actData },
      { upsert: true, new: true }
    );

    res.json({ success: true, activity });
  } catch (error: any) {
    console.error('Save activity error:', error);
    res.status(500).json({ error: error.message || 'Failed to save activity' });
  }
});

export default router;
