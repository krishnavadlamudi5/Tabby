import { Router } from 'express';
import { requireAuth, requireAllowedEmail } from '../../middleware/auth';
import accountsRouter from './accounts';
import { categoriesRouter, rulesRouter, templatesRouter } from './catalog';
import transactionsRouter from './transactions';
import reviewRouter from './review';
import statementsRouter from './statements';
import { manualIngestRouter } from './ingest';

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

export default router;
