import { Router, Request, Response } from 'express';
import { Activity } from '../models/Activity';

const router = Router();

// GET /api/activities?userId=...
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.query.userId as string;
    let activities;
    if (userId) {
      activities = await Activity.find({
        $or: [
          { userId },
          { type: 'app_update' }
        ]
      }).sort({ timestamp: -1 }).limit(100);
    } else {
      activities = await Activity.find().sort({ timestamp: -1 }).limit(100);
    }

    res.json({ success: true, activities });
  } catch (error: any) {
    console.error('Fetch activities error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch activities' });
  }
});

// POST /api/activities (create activity)
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const actData = req.body;
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
