import { Router, Response } from 'express';
import { Expense } from '../models/Expense';
import { requireAuth, AuthedRequest } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

function isParty(expenseData: any, userId: string): boolean {
  if (!userId) return false;
  if (expenseData.paidBy === userId) return true;
  if (expenseData.createdBy === userId) return true;
  if (Array.isArray(expenseData.splits) && expenseData.splits.some((s: any) => s?.userId === userId)) return true;
  if (Array.isArray(expenseData.involvedUserIds) && expenseData.involvedUserIds.includes(userId)) return true;
  return false;
}

// GET /api/expenses - always scoped to the authenticated caller.
router.get('/', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const expenses = await Expense.find({
      $or: [
        { paidBy: userId },
        { involvedUserIds: userId },
        { createdBy: userId },
        { 'splits.userId': userId }
      ]
    }).sort({ createdAt: -1 });

    res.json({ success: true, expenses });
  } catch (error: any) {
    console.error('Fetch expenses error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch expenses' });
  }
});

// POST /api/expenses (create expense)
// The caller must actually be a party to the expense (payer, creator, or in
// the splits) - this stops a signed-in user from writing expenses onto
// other people's ledgers that don't involve them at all.
router.post('/', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const expenseData = req.body;
    if (!expenseData.id || !expenseData.description || expenseData.amount === undefined) {
      res.status(400).json({ error: 'id, description, and amount are required' });
      return;
    }

    if (!isParty(expenseData, req.userId as string)) {
      res.status(403).json({ error: 'You are not a party to this expense.' });
      return;
    }

    const existing = await Expense.findOne({ id: expenseData.id });
    if (existing && !isParty(existing, req.userId as string)) {
      res.status(403).json({ error: 'You are not a party to this expense.' });
      return;
    }

    const involved = new Set<string>();
    if (expenseData.paidBy) involved.add(expenseData.paidBy);
    if (Array.isArray(expenseData.splits)) {
      expenseData.splits.forEach((s: any) => {
        if (s.userId) involved.add(s.userId);
      });
    }
    expenseData.involvedUserIds = Array.from(involved);

    const expense = await Expense.findOneAndUpdate(
      { id: expenseData.id },
      { $set: expenseData },
      { upsert: true, new: true }
    );

    res.json({ success: true, expense });
  } catch (error: any) {
    console.error('Save expense error:', error);
    res.status(500).json({ error: error.message || 'Failed to save expense' });
  }
});

// PUT /api/expenses/:id (update expense)
// Only someone already party to the existing expense may edit it.
router.put('/:id', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const expenseData = req.body;

    const existing = await Expense.findOne({ id });
    if (!existing) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }
    if (!isParty(existing, req.userId as string)) {
      res.status(403).json({ error: 'You are not a party to this expense.' });
      return;
    }

    const involved = new Set<string>();
    if (expenseData.paidBy) involved.add(expenseData.paidBy);
    if (Array.isArray(expenseData.splits)) {
      expenseData.splits.forEach((s: any) => {
        if (s.userId) involved.add(s.userId);
      });
    }
    expenseData.involvedUserIds = Array.from(involved);

    const expense = await Expense.findOneAndUpdate(
      { id },
      { $set: expenseData },
      { new: true }
    );

    res.json({ success: true, expense });
  } catch (error: any) {
    console.error('Update expense error:', error);
    res.status(500).json({ error: error.message || 'Failed to update expense' });
  }
});

// DELETE /api/expenses/:id (delete expense)
// Only someone party to the expense may delete it.
router.delete('/:id', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const existing = await Expense.findOne({ id });
    if (!existing) {
      res.json({ success: true, message: 'Expense already deleted' });
      return;
    }
    if (!isParty(existing, req.userId as string)) {
      res.status(403).json({ error: 'You are not a party to this expense.' });
      return;
    }

    await Expense.findOneAndDelete({ id });
    res.json({ success: true, message: 'Expense deleted' });
  } catch (error: any) {
    console.error('Delete expense error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete expense' });
  }
});

export default router;
