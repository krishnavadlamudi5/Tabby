import request from 'supertest';
import { createApp } from '../../app';
import { makeUser } from '../../__tests__/helpers';
export { useTestDb, makeUser } from '../../__tests__/helpers';

export const app = createApp();

/** Supertest agent preset with a user's Authorization header. */
export function as(auth: string) {
  return {
    get: (url: string) => request(app).get(url).set('Authorization', auth),
    post: (url: string) => request(app).post(url).set('Authorization', auth),
    patch: (url: string) => request(app).patch(url).set('Authorization', auth),
    put: (url: string) => request(app).put(url).set('Authorization', auth),
    delete: (url: string) => request(app).delete(url).set('Authorization', auth),
  };
}

export async function twoUsers() {
  const a = await makeUser('alice');
  const b = await makeUser('bob');
  return { a: { ...a, api: as(a.auth) }, b: { ...b, api: as(b.auth) } };
}
