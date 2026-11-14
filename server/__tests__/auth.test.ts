import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createApp } from '../app';
import { User } from '../models/User';
import { googleVerifier } from '../routes/auth';
import { useTestDb, makeUser } from './helpers';

useTestDb();
const app = createApp();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requireAuth', () => {
  const protectedRoutes: [string, string][] = [
    ['get', '/api/sync/me'],
    ['get', '/api/users'],
    ['put', '/api/users/me'],
    ['post', '/api/users/friend'],
    ['get', '/api/groups'],
    ['post', '/api/groups'],
    ['get', '/api/expenses'],
    ['post', '/api/expenses'],
    ['put', '/api/expenses/x'],
    ['delete', '/api/expenses/x'],
    ['get', '/api/activities'],
    ['post', '/api/activities'],
    ['post', '/api/receipt/scan'],
  ];

  it.each(protectedRoutes)('%s %s returns 401 without a token', async (method, path) => {
    const res = await (request(app) as any)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with another secret', async () => {
    const forged = jwt.sign({ sub: 'someone' }, 'wrong-secret');
    const res = await request(app).get('/api/sync/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign({ sub: 'someone' }, process.env.JWT_SECRET as string, { expiresIn: -10 });
    const res = await request(app).get('/api/sync/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('rejects the old mock token', async () => {
    const res = await request(app).get('/api/sync/me').set('Authorization', 'Bearer mock-token');
    expect(res.status).toBe(401);
  });

  it('leaves /api/health open', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/google', () => {
  it('requires an idToken', async () => {
    const res = await request(app).post('/api/auth/google').send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 for a token Google rejects', async () => {
    vi.spyOn(googleVerifier, 'verify').mockRejectedValue(new Error('bad token'));
    const res = await request(app).post('/api/auth/google').send({ idToken: 'nope' });
    expect(res.status).toBe(401);
  });

  it('creates a new user and returns a working session token', async () => {
    vi.spyOn(googleVerifier, 'verify').mockResolvedValue({ email: 'New.Person@Gmail.com', name: 'New Person' });
    const res = await request(app).post('/api/auth/google').send({ idToken: 'good' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('new.person@gmail.com');
    expect(res.body.user.password).toBeUndefined();

    const sync = await request(app).get('/api/sync/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(sync.status).toBe(200);
    expect(sync.body.currentUser.id).toBe(res.body.user.id);
  });

  it('signs an existing Google user back into the same account', async () => {
    vi.spyOn(googleVerifier, 'verify').mockResolvedValue({ email: 'same@example.com', name: 'Same' });
    const first = await request(app).post('/api/auth/google').send({ idToken: 'a' });
    const second = await request(app).post('/api/auth/google').send({ idToken: 'b' });
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(await User.countDocuments({ email: 'same@example.com' })).toBe(1);
  });

  it('claims a ghost user created by a friend', async () => {
    await User.create({ id: 'ghost-1', name: 'Pal', email: 'pal@example.com', authProvider: 'ghost' });
    vi.spyOn(googleVerifier, 'verify').mockResolvedValue({ email: 'pal@example.com', name: 'Pal Real' });
    const res = await request(app).post('/api/auth/google').send({ idToken: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe('ghost-1');
    expect(res.body.user.authProvider).toBe('google');
  });

  it('never hands out a seeded demo account', async () => {
    await User.create({ id: 'user-alex', name: 'Alex', email: 'alex.split@gmail.com' });
    vi.spyOn(googleVerifier, 'verify').mockResolvedValue({ email: 'alex.split@gmail.com' });
    const res = await request(app).post('/api/auth/google').send({ idToken: 'x' });
    expect(res.status).toBe(409);
    expect(res.body.token).toBeUndefined();
  });
});

describe('two signed-in users only see their own data', () => {
  it('scopes groups, expenses, activities and sync', async () => {
    const a = await makeUser('alice');
    const b = await makeUser('bob');

    await request(app).post('/api/groups').set('Authorization', a.auth)
      .send({ id: 'g-a', name: 'Alice trip', category: 'trip', members: ['alice'] }).expect(200);
    await request(app).post('/api/expenses').set('Authorization', a.auth)
      .send({ id: 'e-a', description: 'Hotel', amount: 100, paidBy: 'alice', groupId: 'g-a', splits: [{ userId: 'alice', amount: 100 }] })
      .expect(200);
    await request(app).post('/api/activities').set('Authorization', a.auth)
      .send({ id: 'act-a', type: 'expense_add', description: 'added Hotel', timestamp: new Date().toISOString() })
      .expect(200);

    const bSync = await request(app).get('/api/sync/me').set('Authorization', b.auth);
    expect(bSync.status).toBe(200);
    expect(bSync.body.groups).toHaveLength(0);
    expect(bSync.body.expenses).toHaveLength(0);
    expect(bSync.body.activities).toHaveLength(0);
    expect(bSync.body.users.map((u: any) => u.id)).toEqual(['bob']);

    const bGroups = await request(app).get('/api/groups').set('Authorization', b.auth);
    expect(bGroups.body.groups).toHaveLength(0);
    const bExpenses = await request(app).get('/api/expenses').set('Authorization', b.auth);
    expect(bExpenses.body.expenses).toHaveLength(0);

    const aSync = await request(app).get('/api/sync/me').set('Authorization', a.auth);
    expect(aSync.body.groups.map((g: any) => g.id)).toEqual(['g-a']);
    expect(aSync.body.expenses.map((e: any) => e.id)).toEqual(['e-a']);
  });

  it('stops one user editing or deleting the other user\'s expense', async () => {
    const a = await makeUser('alice');
    const b = await makeUser('bob');
    await request(app).post('/api/expenses').set('Authorization', a.auth)
      .send({ id: 'e-a', description: 'Hotel', amount: 100, paidBy: 'alice', groupId: null, splits: [{ userId: 'alice', amount: 100 }] })
      .expect(200);

    await request(app).put('/api/expenses/e-a').set('Authorization', b.auth)
      .send({ description: 'hacked' }).expect(403);
    await request(app).delete('/api/expenses/e-a').set('Authorization', b.auth).expect(403);
  });
});
