import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { Group } from '../models/Group';
import { User } from '../models/User';
import { useTestDb, makeUser } from './helpers';

useTestDb();
const app = createApp();

async function setup() {
  const me = await makeUser('me', { friendIds: ['friend'], phone: '111' });
  await makeUser('friend', { phone: '222' });
  await makeUser('groupmate', { phone: '333' });
  await makeUser('admirer', { phone: '444', friendIds: ['me'] });
  await makeUser('stranger', { phone: '555' });
  await User.updateOne({ id: 'me' }, { $set: { password: 'hash' } });
  await Group.create({ id: 'g1', name: 'Flat', members: ['me', 'groupmate'] });
  return me;
}

describe('GET /api/users', () => {
  it('returns only me, my friends, people who added me and my group members', async () => {
    const me = await setup();
    const res = await request(app).get('/api/users').set('Authorization', me.auth);
    expect(res.status).toBe(200);
    const ids = res.body.users.map((u: any) => u.id).sort();
    expect(ids).toEqual(['admirer', 'friend', 'groupmate', 'me']);
  });

  it('filters ?ids= to the same visible set', async () => {
    const me = await setup();
    const res = await request(app).get('/api/users?ids=stranger,friend').set('Authorization', me.auth);
    expect(res.body.users.map((u: any) => u.id)).toEqual(['friend']);
  });

  it('never returns a password, and only shows phone numbers for me and my friends', async () => {
    const me = await setup();
    const res = await request(app).get('/api/users').set('Authorization', me.auth);
    const byId = Object.fromEntries(res.body.users.map((u: any) => [u.id, u]));
    for (const u of res.body.users) expect(u.password).toBeUndefined();
    expect(byId.me.phone).toBe('111');
    expect(byId.friend.phone).toBe('222');
    expect(byId.groupmate.phone).toBeUndefined();
    expect(byId.admirer.phone).toBeUndefined();
  });

  it('applies the same rules to /api/sync/me', async () => {
    const me = await setup();
    const res = await request(app).get('/api/sync/me').set('Authorization', me.auth);
    const ids = res.body.users.map((u: any) => u.id).sort();
    expect(ids).toEqual(['admirer', 'friend', 'groupmate', 'me']);
    const byId = Object.fromEntries(res.body.users.map((u: any) => [u.id, u]));
    expect(byId.groupmate.phone).toBeUndefined();
  });

  it('does not seed demo data when a demo id syncs', async () => {
    const alex = await makeUser('user-alex');
    const res = await request(app).get('/api/sync/me').set('Authorization', alex.auth);
    expect(res.body.groups).toHaveLength(0);
    expect(await Group.countDocuments()).toBe(0);
  });
});
