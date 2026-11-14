import { Router } from 'express';
import { handler, validate } from '../lib/http';
import { yearQuery } from '../validation/schemas';
import { yearReport } from '../services/reports';

const router = Router();

// GET /api/finance/reports/year?year=2026&basis=fy|calendar
router.get('/year', handler(async (req, res) => {
  const q = validate(yearQuery, req.query, res);
  if (!q) return;
  res.json({ success: true, ...(await yearReport(req.userId!, q.year, q.basis)) });
}));

export default router;
