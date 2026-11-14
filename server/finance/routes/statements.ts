import { Router } from 'express';
import multer from 'multer';
import { Account, Statement, Transaction } from '../models';
import { handler, isObjectId, scoped, validate } from '../lib/http';
import { statementUploadFields } from '../validation/schemas';
import { decryptString } from '../lib/crypto';
import { parseCsvStatement, parsePdfStatement, StatementParseError } from '../services/statements/parse';
import { importStatement } from '../services/statements/importStatement';
import { saveDocument, MAX_UPLOAD_BYTES } from '../services/storage/documents';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

// POST /api/finance/statements/upload (multipart: file, accountId, [password, openingBalancePaise, closingBalancePaise])
router.post('/upload', upload.single('file'), handler(async (req, res) => {
  const fields = validate(statementUploadFields, req.body, res);
  if (!fields) return;
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) { res.status(400).json({ error: 'Attach the statement file (CSV or PDF)' }); return; }
  const account = await Account.findOne({ _id: fields.accountId, ...scoped(req) });
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const isPdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
  try {
    let parsed;
    let fileDocId = null;
    if (isPdf) {
      const password = fields.password || (account.statementPasswordEnc ? decryptString(account.statementPasswordEnc) : undefined);
      parsed = await parsePdfStatement(file.buffer, password);
      const { doc } = await saveDocument(req.userId!, {
        buffer: file.buffer, filename: file.originalname, mimeType: 'application/pdf', title: `${account.name} statement`,
        type: 'statement', link: { kind: 'statement', id: String(account._id) },
      });
      fileDocId = doc._id;
    } else {
      parsed = parseCsvStatement(file.buffer.toString('utf8'));
    }
    const result = await importStatement(req.userId!, account, parsed, {
      format: isPdf ? 'pdf' : 'csv', fileDocId,
      openingBalancePaise: fields.openingBalancePaise, closingBalancePaise: fields.closingBalancePaise,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof StatementParseError) {
      res.status(400).json({ error: err.message, code: err.code });
      return;
    }
    throw err;
  }
}));

router.get('/', handler(async (req, res) => {
  const filter: Record<string, any> = scoped(req);
  if (typeof req.query.accountId === 'string' && isObjectId(req.query.accountId)) filter.accountId = req.query.accountId;
  const statements = await Statement.find(filter).sort({ periodEnd: -1 }).limit(100);
  res.json({ success: true, statements });
}));

// Reconciliation report: the statement, its issues, and ledger transactions
// in the period on that account that no statement line matched.
router.get('/:id/reconciliation', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) { res.status(404).json({ error: 'Statement not found' }); return; }
  const statement = await Statement.findOne({ _id: req.params.id, ...scoped(req) });
  if (!statement) { res.status(404).json({ error: 'Statement not found' }); return; }
  const end = new Date(statement.periodEnd.getTime() + 86_400_000);
  const unmatched = await Transaction.find({
    ...scoped(req), accountId: statement.accountId, reconciled: false, status: 'settled',
    postedAt: { $gte: statement.periodStart, $lt: end },
  }).sort({ postedAt: 1 });
  res.json({ success: true, statement, unmatchedTransactions: unmatched });
}));

export default router;
