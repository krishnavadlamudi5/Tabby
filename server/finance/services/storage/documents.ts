import { randomUUID } from 'crypto';
import { FinDocument, IDocument } from '../../models';
import { decryptBuffer, encryptBuffer, sha256 } from '../../lib/crypto';
import { getFileStore } from './fileStore';

export const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'];
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export class UploadError extends Error {
  status = 400;
}

/**
 * Encrypts and stores a file, deduplicated per owner by SHA-256 of the
 * plaintext. Returns the existing document when the same file was saved before.
 */
export async function saveDocument(ownerId: string, input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  title?: string;
  type?: IDocument['type'];
  source?: 'upload' | 'gmail';
  link?: { kind: IDocument['linkedTo'][number]['kind']; id: string };
}): Promise<{ doc: IDocument; existed: boolean }> {
  const mimeType = input.mimeType.toLowerCase();
  if (!ALLOWED_MIME.includes(mimeType)) throw new UploadError('Only PDF, JPG, PNG and HEIC files are allowed');
  if (input.buffer.length > MAX_UPLOAD_BYTES) throw new UploadError('Files must be 20 MB or smaller');
  if (input.buffer.length === 0) throw new UploadError('The file is empty');

  const hash = sha256(input.buffer);
  const existing = await FinDocument.findOne({ ownerId, sha256: hash });
  if (existing) {
    if (input.link && !existing.linkedTo.some((l) => l.kind === input.link!.kind && l.id === input.link!.id)) {
      existing.linkedTo.push(input.link);
      await existing.save();
    }
    return { doc: existing, existed: true };
  }

  const enc = encryptBuffer(input.buffer);
  const storageKey = `${ownerId}/${randomUUID()}`;
  await getFileStore().put(storageKey, enc.data, 'application/octet-stream');
  try {
    const doc = await FinDocument.create({
      ownerId,
      title: input.title || input.filename || 'Document',
      type: input.type || 'other',
      filename: input.filename,
      mimeType,
      sizeBytes: input.buffer.length,
      sha256: hash,
      storageKey,
      encryption: { alg: 'aes-256-gcm', iv: enc.iv, tag: enc.tag, keyVersion: enc.keyVersion },
      linkedTo: input.link ? [input.link] : [],
      source: input.source || 'upload',
    });
    return { doc, existed: false };
  } catch (err: any) {
    await getFileStore().delete(storageKey).catch(() => {});
    if (err?.code === 11000) {
      const doc = await FinDocument.findOne({ ownerId, sha256: hash });
      if (doc) return { doc, existed: true };
    }
    throw err;
  }
}

export async function readDocument(doc: IDocument): Promise<Buffer> {
  const data = await getFileStore().get(doc.storageKey);
  return decryptBuffer({ data, iv: doc.encryption.iv, tag: doc.encryption.tag });
}

export async function deleteDocumentFile(doc: IDocument): Promise<void> {
  await getFileStore().delete(doc.storageKey);
}
