import { Router, Response } from 'express';
import { Group } from '../models/Group';
import { requireAuth, AuthedRequest } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// GET /api/groups - always scoped to the authenticated caller. The old
// ?userId= query param let anyone read any other user's groups; it's gone.
router.get('/', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const groups = await Group.find({ members: req.userId }).sort({ createdAt: -1 });
    res.json({ success: true, groups });
  } catch (error: any) {
    console.error('Fetch groups error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch groups' });
  }
});

// POST /api/groups (create or upsert group)
// The caller must be a member of the group they're creating/editing, and -
// for edits - must already be a member of the existing group. This stops an
// outsider from creating a group that excludes themselves-as-owner or from
// tampering with a group id they aren't part of.
router.post('/', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const groupData = req.body;
    if (!groupData.id || !groupData.name) {
      res.status(400).json({ error: 'Group ID and name are required' });
      return;
    }

    const members: string[] = Array.isArray(groupData.members) ? groupData.members : [];
    if (!members.includes(req.userId)) {
      res.status(403).json({ error: 'You must include yourself as a member of the group.' });
      return;
    }

    const existing = await Group.findOne({ id: groupData.id });
    if (existing && !existing.members.includes(req.userId as string)) {
      res.status(403).json({ error: 'You are not a member of this group.' });
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
