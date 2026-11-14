import { Router } from 'express';
import multer from 'multer';
import { Claim, FinDocument, Policy, Transaction } from '../models';
import { handler, isObjectId, scoped, validate } from '../lib/http';
import { documentFields, documentUpdate } from '../validation/schemas';
import { deleteDocumentFile, MAX_UPLOAD_BYTES, readDocument, saveDocument, UploadError } from '../services/storage/documents';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
const notFound = (res: any) => res.status(404).json({ error: 'Document not found' });

/** Keeps the reverse links on policies/claims/transactions in step. */
async function syncBackLink(ownerId: string, kind: string, id: string, docId: unknown, add: boolean) {
  if (!isObjectId(id)) return;
  const op = add ? { $addToSet: {} as any } : { $pull: {} as any };
  if (kind === 'policy') {
    (add ? op.$addToSet : (op as any).$pull).documentIds = docId;
    await Policy.updateOne({ _id: id, ownerId }, op);
  } else if (kind === 'claim') {
    (add ? op.$addToSet : (op as any).$pull).documentIds = docId;
    await Claim.updateOne({ _id: id, ownerId }, op);
  } else if (kind === 'transaction') {
    (add ? op.$addToSet : (op as any).$pull).attachmentDocIds = docId;
    await Transaction.updateOne({ _id: id, ownerId }, op);
  }
}

// POST /api/finance/documents (multipart: file, [title, type, linkKind, linkId])
router.post('/', upload.single('file'), handler(async (req, res) => {
  const fields = validate(documentFields, req.body, res);
  if (!fields) return;
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) { res.status(400).json({ error: 'Choose a file to upload' }); return; }
  try {
    const link = fields.linkKind && fields.linkId ? { kind: fields.linkKind, id: fields.linkId } : undefined;
    const { doc, existed } = await saveDocument(req.userId!, {
      buffer: file.buffer, filename: file.originalname, mimeType: file.mimetype,
      title: fields.title || file.originalname, type: fields.type, link,
    });
    if (fields.expiresAt) await FinDocument.updateOne({ _id: doc._id }, { $set: { expiresAt: fields.expiresAt } });
    if (link) await syncBackLink(req.userId!, link.kind, link.id, doc._id, true);
    res.status(existed ? 200 : 201).json({ success: true, document: doc, existed });
  } catch (err) {
    if (err instanceof UploadError) { res.status(400).json({ error: err.message }); return; }
    throw err;
  }
}));

// GET /api/finance/documents?q=&type=&linkKind=&linkId=
router.get('/', handler(async (req, res) => {
  const q = req.query as Record<string, string>;
  const filter: Record<string, any> = scoped(req);
  if (q.type) filter.type = q.type;
  if (q.expiring === '1') filter.expiresAt = { $ne: null, $lte: new Date(Date.now() + 60 * 86_400_000) };
  if (q.linkKind && q.linkId) filter.linkedTo = { $elemMatch: { kind: q.linkKind, id: q.linkId } };
  else if (q.linkKind) filter['linkedTo.kind'] = q.linkKind;
  if (q.q) {
    const re = new RegExp(q.q.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: re }, { filename: re }];
  }
  const documents = await FinDocument.find(filter).sort({ createdAt: -1 }).limit(500);
  res.json({ success: true, documents });
}));

// Streams the decrypted file to its owner only.
router.get('/:id/download', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res);
  const doc = await FinDocument.findOne({ _id: req.params.id, ...scoped(req) });
  if (!doc) return notFound(res);
  const data = await readDocument(doc);
  const safeName = (doc.filename || doc.title).replace(/[^\w.\- ]+/g, '_');
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Length', String(data.length));
  res.setHeader('Content-Disposition', `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${safeName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(data);
}));

router.patch('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res);
  const body = validate(documentUpdate, req.body, res);
  if (!body) return;
  const doc = await FinDocument.findOne({ _id: req.params.id, ...scoped(req) });
  if (!doc) return notFound(res);
  if (body.title) doc.title = body.title;
  if (body.type) doc.type = body.type;
  if (body.expiresAt !== undefined) doc.expiresAt = body.expiresAt;
  if (body.link && !doc.linkedTo.some((l) => l.kind === body.link!.kind && l.id === body.link!.id)) {
    doc.linkedTo.push(body.link);
    await syncBackLink(req.userId!, body.link.kind, body.link.id, doc._id, true);
  }
  if (body.unlink) {
    doc.linkedTo = doc.linkedTo.filter((l) => !(l.kind === body.unlink!.kind && l.id === body.unlink!.id));
    await syncBackLink(req.userId!, body.unlink.kind, body.unlink.id, doc._id, false);
  }
  await doc.save();
  res.json({ success: true, document: doc });
}));

router.delete('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res);
  const doc = await FinDocument.findOne({ _id: req.params.id, ...scoped(req) });
  if (!doc) return notFound(res);
  for (const l of doc.linkedTo) await syncBackLink(req.userId!, l.kind, l.id, doc._id, false);
  await deleteDocumentFile(doc).catch((e) => console.warn('File delete failed:', e?.message));
  await FinDocument.deleteOne({ _id: doc._id });
  res.json({ success: true });
}));

export default router;
