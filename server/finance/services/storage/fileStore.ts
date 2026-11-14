import fs from 'fs/promises';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// Encrypted blobs only ever pass through here (see documents.ts): R2 never
// sees plaintext. One interface, three backends:
//  - Cloudflare R2 (production, free 10 GB) when R2_* env vars are set
//  - in-memory for tests (FILE_STORE=memory or NODE_ENV=test)
//  - local disk for development (FILE_STORE_DIR, default .data/files)

export interface FileStore {
  readonly name: string;
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class R2Store implements FileStore {
  readonly name = 'r2';
  private client: S3Client;
  constructor(private bucket: string, accountId: string, accessKeyId: string, secretAccessKey: string) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  async put(key: string, data: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }));
  }
  async get(key: string) {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await out.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export class MemoryStore implements FileStore {
  readonly name = 'memory';
  readonly files = new Map<string, Buffer>();
  async put(key: string, data: Buffer) {
    this.files.set(key, Buffer.from(data));
  }
  async get(key: string) {
    const f = this.files.get(key);
    if (!f) throw new Error('File not found');
    return f;
  }
  async delete(key: string) {
    this.files.delete(key);
  }
}

class LocalStore implements FileStore {
  readonly name = 'local';
  constructor(private dir: string) {}
  private file(key: string) {
    return path.join(this.dir, key.replace(/[^a-zA-Z0-9/_-]/g, '_'));
  }
  async put(key: string, data: Buffer) {
    const f = this.file(key);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, data);
  }
  async get(key: string) {
    return fs.readFile(this.file(key));
  }
  async delete(key: string) {
    await fs.rm(this.file(key), { force: true });
  }
}

let store: FileStore | null = null;

export function getFileStore(): FileStore {
  if (store) return store;
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (R2_BUCKET && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && (R2_ACCOUNT_ID || process.env.R2_ENDPOINT)) {
    store = new R2Store(R2_BUCKET, R2_ACCOUNT_ID || '', R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY);
  } else if (process.env.FILE_STORE === 'memory' || process.env.NODE_ENV === 'test') {
    store = new MemoryStore();
  } else {
    if (process.env.NODE_ENV === 'production') {
      console.warn('WARNING: R2 is not configured; documents are stored on local disk, which Render wipes on every deploy.');
    }
    store = new LocalStore(process.env.FILE_STORE_DIR || path.join(process.cwd(), '.data', 'files'));
  }
  return store;
}

/** Tests can swap the backend. */
export function setFileStore(s: FileStore | null): void {
  store = s;
}
