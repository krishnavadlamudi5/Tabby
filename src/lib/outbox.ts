import { User, Group, Expense, Activity } from '../types';

// Every change the app makes to shared data goes through this queue. The UI
// updates immediately (optimistic), the change is saved to localStorage, and
// it is sent to the server in order. Transient failures (offline, server
// asleep, 5xx) are retried with backoff; a change the server permanently
// rejects (4xx) is dropped and reported. Sync with the server only replaces
// local data once the queue is empty, so pending changes are never lost.

export type OutboxOp =
  | { kind: 'saveGroup'; payload: Group }
  | { kind: 'saveExpense'; payload: Expense }
  | { kind: 'updateExpense'; payload: Expense }
  | { kind: 'deleteExpense'; payload: { id: string } }
  | { kind: 'saveActivity'; payload: Activity }
  | { kind: 'updateProfile'; payload: Partial<User> }
  | { kind: 'addFriend'; payload: { name: string; email: string } };

export interface OutboxEntry {
  id: string;
  op: OutboxOp;
  attempts: number;
  createdAt: string;
  lastError?: string;
}

export interface OutboxStorage {
  load(): OutboxEntry[];
  save(entries: OutboxEntry[]): void;
}

export interface OutboxOptions {
  storage: OutboxStorage;
  /** Sends one operation to the server; throws on failure. */
  execute: (op: OutboxOp) => Promise<void>;
  /** Whether a thrown error should be retried later. */
  isTransient: (err: unknown) => boolean;
  /** Whether a thrown error means the session is gone (stop until sign-in). */
  isUnauthorized: (err: unknown) => boolean;
  onPermanentFailure?: (entry: OutboxEntry, err: unknown) => void;
  onChange?: (pending: number) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export function backoffDelay(attempts: number, baseMs = 2000, maxMs = 5 * 60 * 1000): number {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempts - 1));
}

let seq = 0;
function entryId(): string {
  seq += 1;
  return `ob-${Date.now().toString(36)}-${seq}`;
}

export class Outbox {
  private entries: OutboxEntry[];
  private flushing: Promise<void> | null = null;
  private timer: unknown = null;
  private stopped = false;
  /** Increments on every enqueue; lets sync detect changes made while it was fetching. */
  version = 0;

  constructor(private opts: OutboxOptions) {
    this.entries = opts.storage.load();
  }

  get size(): number {
    return this.entries.length;
  }

  list(): OutboxEntry[] {
    return [...this.entries];
  }

  enqueue(op: OutboxOp): void {
    this.entries.push({ id: entryId(), op, attempts: 0, createdAt: new Date().toISOString() });
    this.version += 1;
    this.persist();
    void this.flush();
  }

  /** Stops retry timers (on sign-out). Entries stay saved for the next sign-in. */
  stop(): void {
    this.stopped = true;
    this.cancelTimer();
  }

  /**
   * Sends queued operations in order until the queue is empty or a send
   * fails. Concurrent calls share the same run.
   */
  flush(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (!this.flushing) {
      this.cancelTimer();
      this.flushing = this.run().finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  private async run(): Promise<void> {
    while (this.entries.length > 0 && !this.stopped) {
      const entry = this.entries[0];
      try {
        await this.opts.execute(entry.op);
        this.entries.shift();
        this.persist();
      } catch (err) {
        if (this.opts.isUnauthorized(err)) {
          // Wait for the user to sign in again; keep everything queued.
          return;
        }
        if (this.opts.isTransient(err)) {
          entry.attempts += 1;
          entry.lastError = err instanceof Error ? err.message : String(err);
          this.persist();
          this.schedule(backoffDelay(entry.attempts, this.opts.baseDelayMs, this.opts.maxDelayMs));
          return;
        }
        // Permanent rejection: retrying would fail forever and block every
        // later change, so drop it and tell the user.
        this.entries.shift();
        this.persist();
        this.opts.onPermanentFailure?.(entry, err);
      }
    }
  }

  private schedule(ms: number): void {
    this.cancelTimer();
    const setTimer = this.opts.setTimer || ((fn, delay) => setTimeout(fn, delay));
    this.timer = setTimer(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      const clearTimer = this.opts.clearTimer || ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
      clearTimer(this.timer);
      this.timer = null;
    }
  }

  private persist(): void {
    this.opts.storage.save(this.entries);
    this.opts.onChange?.(this.entries.length);
  }
}
