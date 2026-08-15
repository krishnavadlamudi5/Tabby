import { Router, Request, Response } from 'express';
import { Expense } from '../models/Expense';

const router = Router();

// GET /api/expenses?userId=...
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.query.userId as string;
    let expenses;
    if (userId) {
      expenses = await Expense.find({
        $or: [
          { paidBy: userId },
          { involvedUserIds: userId },
          { createdBy: userId },
          { 'splits.userId': userId }
        ]
      }).sort({ createdAt: -1 });
    } else {
      expenses = await Expense.find().sort({ createdAt: -1 });
    }

    res.json({ success: true, expenses });
  } catch (error: any) {
    console.error('Fetch expenses error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch expenses' });
  }
});

// POST /api/expenses (create expense)
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const expenseData = req.body;
    if (!expenseData.id || !expenseData.description || expenseData.amount === undefined) {
      res.status(400).json({ error: 'id, description, and amount are required' });
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
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const expenseData = req.body;

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

    if (!expense) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }

    res.json({ success: true, expense });
  } catch (error: any) {
    console.error('Update expense error:', error);
    res.status(500).json({ error: error.message || 'Failed to update expense' });
  }
});

// DELETE /api/expenses/:id (delete expense)
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await Expense.findOneAndDelete({ id });
    res.json({ success: true, message: 'Expense deleted' });
  } catch (error: any) {
    console.error('Delete expense error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete expense' });
  }
});

export default router;
