import { Router, Request, Response } from 'express';
import { Group } from '../models/Group';

const router = Router();

// GET /api/groups?userId=...
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.query.userId as string;
    let groups;
    if (userId) {
      groups = await Group.find({ members: userId }).sort({ createdAt: -1 });
    } else {
      groups = await Group.find().sort({ createdAt: -1 });
    }

    res.json({ success: true, groups });
  } catch (error: any) {
    console.error('Fetch groups error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch groups' });
  }
});

// POST /api/groups (create or upsert group)
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const groupData = req.body;
    if (!groupData.id || !groupData.name) {
      res.status(400).json({ error: 'Group ID and name are required' });
      return;
    }

    const group = await Group.findOneAndUpdate(
      { id: groupData.id },
      { $set: groupData },
      { upsert: true, new: true }
    );

    res.json({ success: true, group });
  } catch (error: any) {
    console.error('Save group error:', error);
    res.status(500).json({ error: error.message || 'Failed to save group' });
  }
});

export default router;
