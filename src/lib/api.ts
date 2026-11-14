import { User, Group, Expense, Activity } from '../types';
import { KEYS, readString, writeString } from './storage';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Error thrown by every API helper. `status` is the HTTP status, or 0 when
 * the request never got a response (offline, server asleep, CORS).
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** True for failures worth retrying later (network, timeouts, rate limits, server errors). */
export function isTransientError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500;
}

// --- Session token -----------------------------------------------------

export function getAuthToken(): string | null {
  return readString(KEYS.token);
}

export function setAuthToken(token: string | null): void {
  writeString(KEYS.token, token);
}

// Called when the backend rejects the current token so the app can drop back
// to the login screen instead of failing every request. Wired up by the store.
let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  } catch {
    // fetch() rejects with a bare TypeError for anything that stops the
    // request at the network layer: offline, DNS, a CORS rejection, or a
    // backend that is still waking up.
    throw new ApiError(
      `Could not reach the Tabby server. You may be offline, or the server is waking up.`,
      0
    );
  }

  // A proxy/gateway error can return HTML rather than JSON.
  let data: any;
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    if (res.status === 401 && token && unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw new ApiError(data.error || `Request failed (HTTP ${res.status})`, res.status);
  }
  return data as T;
}

// --- Auth --------------------------------------------------------------

export async function signInWithGoogleApi(idToken: string): Promise<{ token: string; user: User }> {
  const data = await request<{ success: boolean; token: string; user: User }>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
  return { token: data.token, user: data.user };
}

// --- Writes ------------------------------------------------------------
// These throw ApiError on failure. Callers go through the outbox
// (src/lib/outbox.ts), which retries transient failures.

export async function updateUserProfileInDb(updates: Partial<User>): Promise<User> {
  const data = await request<{ success: boolean; user: User }>('/users/me', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return data.user;
}

export async function addFriendInDb(name: string, email: string): Promise<{ friend: User; currentUser: User }> {
  return request('/users/friend', {
    method: 'POST',
    body: JSON.stringify({ name, email }),
  });
}

export async function saveGroupToDb(group: Group): Promise<void> {
  await request('/groups', { method: 'POST', body: JSON.stringify(group) });
}

export async function saveExpenseToDb(expense: Expense): Promise<void> {
  await request('/expenses', { method: 'POST', body: JSON.stringify(expense) });
}

export async function updateExpenseInDb(expense: Expense): Promise<void> {
  await request(`/expenses/${encodeURIComponent(expense.id)}`, {
    method: 'PUT',
    body: JSON.stringify(expense),
  });
}

export async function deleteExpenseFromDb(expenseId: string): Promise<void> {
  await request(`/expenses/${encodeURIComponent(expenseId)}`, { method: 'DELETE' });
}

export async function saveActivityToDb(activity: Activity): Promise<void> {
  await request('/activities', { method: 'POST', body: JSON.stringify(activity) });
}

// --- Full sync ---------------------------------------------------------

export interface SyncData {
  currentUser?: User;
  users: User[];
  groups: Group[];
  expenses: Expense[];
  activities: Activity[];
}

export async function syncUserData(): Promise<SyncData> {
  return request<SyncData & { success: boolean }>('/sync/me');
}

// Receipt scanning - the Gemini call runs server-side (server/routes/receipt.ts)
// so the API key never ships in the client bundle. `data` is the base64 image
// payload with no `data:...;base64,` prefix.
export interface ScannedReceipt {
  items: { name: string; price: number }[];
  total: number;
  tax: number;
}

export async function scanReceiptApi(mimeType: string, data: string): Promise<ScannedReceipt> {
  const res = await request<{ success: boolean } & ScannedReceipt>('/receipt/scan', {
    method: 'POST',
    body: JSON.stringify({ mimeType, data }),
  });
  return { items: res.items, total: res.total, tax: res.tax };
}
