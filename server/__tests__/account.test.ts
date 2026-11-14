import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { useTestDb, makeUser } from './helpers';
import { User } from '../models/User';
import { Alert } from '../finance/models';
import { raiseAlert } from '../finance/services/alerts';
import { largeDebitThresholdPaise } from '../finance/services/ingest/pipeline';

useTestDb();
const app = createApp();

describe('sign out of all devices', () => {
  it('invalidates every existing token', async () => {
    const { auth } = await makeUser('owner');
    expect((await request(app).get('/api/sync/me').set('Authorization', auth)).status).toBe(200);
    expect((await request(app).post('/api/auth/logout-all').set('Authorization', auth)).status).toBe(200);
    expect((await request(app).get('/api/sync/me').set('Authorization', auth)).status).toBe(401);
    expect((await User.findOne({ id: 'owner' }))!.tokenVersion).toBe(1);
  });

  it('a token for a deleted account stops working', async () => {
    const { auth } = await makeUser('gone');
    await User.deleteOne({ id: 'gone' });
    expect((await request(app).get('/api/sync/me').set('Authorization', auth)).status).toBe(401);
  });
});

describe('preferences', () => {
  it('merge only the fields sent and validate them', async () => {
    const { auth } = await makeUser('owner');
    await request(app).put('/api/users/me/preferences').set('Authorization', auth).send({ homeView: 'money', alerts: { renewals: 'email' } }).expect(200);
    const r = await request(app).put('/api/users/me/preferences').set('Authorization', auth).send({ largeDebitPaise: 1000000, alerts: { declined: 'off' } });
    expect(r.body.preferences).toEqual({ homeView: 'money', largeDebitPaise: 1000000, alerts: { renewals: 'email', declined: 'off' } });
    expect((await request(app).put('/api/users/me/preferences').set('Authorization', auth).send({ homeView: 'nope' })).status).toBe(400);
    expect((await request(app).get('/api/users/me/preferences').set('Authorization', auth)).body.alertGroups).toContain('documents');
  });

  it('alert choices: off skips, app = no email, email forces email', async () => {
    await makeUser('owner', { preferences: { alerts: { declined: 'off', renewals: 'app', refunds: 'email' } } });
    expect(await raiseAlert('owner', { type: 'declined', title: 'x', email: true })).toBeNull();
    const renewal = await raiseAlert('owner', { type: 'renewal', title: 'r', email: true });
    expect(renewal!.channels).toEqual(['in_app']);
    const refund = await raiseAlert('owner', { type: 'refund_overdue', title: 'f' });
    expect(refund!.channels).toEqual(['in_app', 'email']);
    const other = await raiseAlert('owner', { type: 'large_debit', title: 'l', email: true });
    expect(other!.channels).toEqual(['in_app', 'email']);
    expect(await Alert.countDocuments()).toBe(3);
  });

  it('large payment threshold can be set per user', () => {
    expect(largeDebitThresholdPaise(1000000)).toBe(1000000);
    expect(largeDebitThresholdPaise(null)).toBe(2500000);
  });
});

describe('Gmail import status', () => {
  it('reports counts and configuration', async () => {
    const { auth } = await makeUser('owner', { email: 'owner@example.com' });
    process.env.INGEST_OWNER_EMAIL = 'owner@example.com';
    const r = await request(app).get('/api/finance/ingest/status').set('Authorization', auth);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ isIngestOwner: true, emailsThisWeek: 0, lastReceivedAt: null });
    expect(r.body.features.encryption).toBe(true);
  });
});
