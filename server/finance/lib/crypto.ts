import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// AES-256-GCM with DATA_ENCRYPTION_KEY (32 random bytes, base64). Used for
// documents, statement passwords and stored email bodies. keyVersion allows a
// future key rotation: old data keeps naming the key it was encrypted with.
// Losing the key means losing everything encrypted with it - back it up.

export const ALG = 'aes-256-gcm';

function loadKey(): { key: Buffer; version: number } {
  const b64 = process.env.DATA_ENCRYPTION_KEY;
  if (!b64) throw new Error('DATA_ENCRYPTION_KEY is not set');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  return { key, version: Number(process.env.DATA_ENCRYPTION_KEY_VERSION) || 1 };
}

export function isEncryptionConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

export interface EncryptedBuffer {
  data: Buffer;
  iv: string;
  tag: string;
  keyVersion: number;
}

export function encryptBuffer(plain: Buffer): EncryptedBuffer {
  const { key, version } = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { data, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), keyVersion: version };
}

export function decryptBuffer(enc: { data: Buffer; iv: string; tag: string }): Buffer {
  const { key } = loadKey();
  const decipher = createDecipheriv(ALG, key, Buffer.from(enc.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(enc.tag, 'base64'));
  return Buffer.concat([decipher.update(enc.data), decipher.final()]);
}

/** Compact string form "v1:iv:tag:ciphertext" for small secrets stored in Mongo. */
export function encryptString(plain: string): string {
  const e = encryptBuffer(Buffer.from(plain, 'utf8'));
  return `v${e.keyVersion}:${e.iv}:${e.tag}:${e.data.toString('base64')}`;
}

export function decryptString(packed: string): string {
  const [, iv, tag, data] = packed.split(':');
  return decryptBuffer({ iv, tag, data: Buffer.from(data, 'base64') }).toString('utf8');
}

export function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}
