import { Router } from 'express';
import { requireAuth, requireAllowedEmail } from '../../middleware/auth';
import accountsRouter from './accounts';
import { categoriesRouter, rulesRouter, templatesRouter } from './catalog';
import transactionsRouter from './transactions';
import reviewRouter from './review';
import statementsRouter from './statements';
import { manualIngestRouter } from './ingest';
import documentsRouter from './vault';
import { policiesRouter, peopleRouter, claimsRouter } from './insurance';
import { commitmentsRouter, alertsRouter, dashboardRouter } from './planning';
import tripsRouter from './trips';
import exportRouter from './exportData';

// Everything under /api/finance (except the HMAC-signed ingest webhook and
// the jobs endpoint, mounted separately in server/app.ts) needs a signed-in
// user, and ALLOWED_EMAILS when it is set.
const router = Router();
router.use(requireAuth, requireAllowedEmail);

router.use('/accounts', accountsRouter);
router.use('/categories', categoriesRouter);
router.use('/rules', rulesRouter);
router.use('/split-templates', templatesRouter);
router.use('/transactions', transactionsRouter);
router.use('/review', reviewRouter);
router.use('/statements', statementsRouter);
router.use('/ingest/manual', manualIngestRouter);
router.use('/documents', documentsRouter);
router.use('/policies', policiesRouter);
router.use('/people', peopleRouter);
router.use('/claims', claimsRouter);
router.use('/commitments', commitmentsRouter);
router.use('/alerts', alertsRouter);
router.use('/dashboard', dashboardRouter);
router.use('/trips', tripsRouter);
router.use('/export', exportRouter);

export default router;
