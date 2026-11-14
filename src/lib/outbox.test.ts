import { describe, expect, it, vi } from 'vitest';
import { Outbox, OutboxEntry, OutboxOp, backoffDelay } from './outbox';

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

function memoryStorage(initial: OutboxEntry[] = []) {
  let saved = initial;
  return {
    load: () => saved,
    save: (e: OutboxEntry[]) => {
      saved = JSON.parse(JSON.stringify(e));
    },
    get saved() {
      return saved;
    },
  };
}

function setup(execute: (op: OutboxOp) => Promise<void>, storage = memoryStorage()) {
  const timers: { fn: () => void; ms: number }[] = [];
  const failures: OutboxEntry[] = [];
  const outbox = new Outbox({
    storage,
    execute,
    isTransient: (e) => !(e instanceof HttpError) || e.status >= 500,
    isUnauthorized: (e) => e instanceof HttpError && e.status === 401,
    onPermanentFailure: (entry) => failures.push(entry),
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: () => {},
  });
  return { outbox, storage, timers, failures };
}

const op = (id: string): OutboxOp => ({ kind: 'deleteExpense', payload: { id } });

describe('Outbox', () => {
  it('sends queued operations in order and empties the queue', async () => {
    const sent: string[] = [];
    const { outbox, storage } = setup(async (o) => {
      sent.push((o.payload as any).id);
    });
    outbox.enqueue(op('a'));
    outbox.enqueue(op('b'));
    await outbox.flush();
    expect(sent).toEqual(['a', 'b']);
    expect(outbox.size).toBe(0);
    expect(storage.saved).toEqual([]);
  });

  it('keeps changes queued while the server is unreachable, then sends them', async () => {
    let online = false;
    const sent: string[] = [];
    const { outbox, storage, timers } = setup(async (o) => {
      if (!online) throw new TypeError('Failed to fetch');
      sent.push((o.payload as any).id);
    });

    outbox.enqueue(op('a'));
    outbox.enqueue(op('b'));
    await outbox.flush();
    expect(outbox.size).toBe(2);
    expect(storage.saved).toHaveLength(2);
    expect(timers.length).toBeGreaterThan(0);

    online = true;
    timers[timers.length - 1].fn();
    await outbox.flush();
    expect(sent).toEqual(['a', 'b']);
    expect(outbox.size).toBe(0);
  });

  it('survives a reload: entries saved earlier are loaded and sent', async () => {
    const storage = memoryStorage([
      { id: '1', op: op('old'), attempts: 3, createdAt: new Date().toISOString() },
    ]);
    const sent: string[] = [];
    const { outbox } = setup(async (o) => {
      sent.push((o.payload as any).id);
    }, storage);
    expect(outbox.size).toBe(1);
    await outbox.flush();
    expect(sent).toEqual(['old']);
  });

  it('drops a permanently rejected change and continues with the rest', async () => {
    const sent: string[] = [];
    const { outbox, failures } = setup(async (o) => {
      if ((o.payload as any).id === 'bad') throw new HttpError(403);
      sent.push((o.payload as any).id);
    });
    outbox.enqueue(op('bad'));
    outbox.enqueue(op('good'));
    await outbox.flush();
    expect(failures.map((f) => (f.op.payload as any).id)).toEqual(['bad']);
    expect(sent).toEqual(['good']);
    expect(outbox.size).toBe(0);
  });

  it('pauses without dropping anything when the session has expired', async () => {
    const { outbox, timers } = setup(async () => {
      throw new HttpError(401);
    });
    outbox.enqueue(op('a'));
    await outbox.flush();
    expect(outbox.size).toBe(1);
    expect(timers).toHaveLength(0);
  });

  it('retries server errors with growing delays', async () => {
    const { outbox, timers } = setup(async () => {
      throw new HttpError(503);
    });
    outbox.enqueue(op('a'));
    await outbox.flush();
    timers[0].fn();
    await outbox.flush();
    expect(timers[1].ms).toBeGreaterThan(timers[0].ms);
    expect(outbox.list()[0].attempts).toBe(2);
  });

  it('reports the pending count on every change', async () => {
    const counts: number[] = [];
    const outbox = new Outbox({
      storage: memoryStorage(),
      execute: vi.fn().mockResolvedValue(undefined),
      isTransient: () => true,
      isUnauthorized: () => false,
      onChange: (n) => counts.push(n),
    });
    outbox.enqueue(op('a'));
    await outbox.flush();
    expect(counts[0]).toBe(1);
    expect(counts[counts.length - 1]).toBe(0);
  });
});

describe('backoffDelay', () => {
  it('doubles and caps at five minutes', () => {
    expect(backoffDelay(1)).toBe(2000);
    expect(backoffDelay(2)).toBe(4000);
    expect(backoffDelay(20)).toBe(5 * 60 * 1000);
  });
});
