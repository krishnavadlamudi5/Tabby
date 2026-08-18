import { User, Group, Expense, Activity } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_STORAGE_KEY = 'tabby_auth_token';

// --- Session token -----------------------------------------------------
// The backend now requires a Bearer token on every data route. The token is
// kept in localStorage alongside the cached user object (see useAppStore),
// and every request() call attaches it automatically.

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable (private mode, etc.) - session just won't persist.
  }
}

// Called when the backend rejects the current token (expired/invalid) so the
// app can drop back to the login screen instead of silently failing every
// request. Wired up by the store on startup.
let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401 && unauthorizedHandler) {
        unauthorizedHandler();
      }
      throw new Error(data.error || `HTTP error! status: ${res.status}`);
    }
    return data as T;
  } catch (err: any) {
    console.warn(`API call failed for ${endpoint}:`, err.message);
    throw err;
  }
}

// Authentication
export async function sendOtpApi(destination: string, type: 'register' | 'reset' = 'register'): Promise<{ success: boolean; code?: string; message: string }> {
  return await request('/auth/send-otp', {
    method: 'POST',
    body: JSON.stringify({ destination, type }),
  });
}

export async function verifyOtpApi(destination: string, code: string): Promise<{ success: boolean; message: string }> {
  return await request('/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ destination, code }),
  });
}

export interface AuthResult {
  user: User;
  token: string;
}

export async function resetPasswordApi(destination: string, code: string, newPassword: string): Promise<AuthResult> {
  const data = await request<{ success: boolean; user: User; token: string }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ destination, code, newPassword }),
  });
  return { user: data.user, token: data.token };
}

export async function signInWithEmail(identifier: string, passwordVal: string): Promise<AuthResult> {
  const data = await request<{ success: boolean; user: User; token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password: passwordVal }),
  });
  return { user: data.user, token: data.token };
}

export async function registerWithEmail(
  nameVal: string,
  emailVal: string,
  phoneVal: string,
  passwordVal: string,
  otpVal?: string
): Promise<AuthResult> {
  const data = await request<{ success: boolean; user: User; token: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: nameVal,
      email: emailVal,
      phone: phoneVal,
      password: passwordVal,
      otp: otpVal,
    }),
  });
  return { user: data.user, token: data.token };
}

// 1-click demo accounts. This hits a dedicated backend endpoint (rather than
// logging in locally with no token) so demo sessions are real, authenticated
// sessions like any other - every data route requires one now.
export async function demoLoginApi(userId: string): Promise<AuthResult> {
  const data = await request<{ success: boolean; user: User; token: string }>('/auth/demo-login', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  return { user: data.user, token: data.token };
}

// signInWithGoogle expects a verified Google ID token (credential) obtained
// from Google Identity Services. There is no more "offline/demo" fallback
// that fabricates a user client-side - the backend is the source of truth.
export async function signInWithGoogle(credential: string): Promise<AuthResult> {
  const data = await request<{ success: boolean; user: User; token: string }>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
  return { user: data.user, token: data.token };
}

// --- Mobile Google Sign-In handoff -----------------------------------------
// Google refuses to run inside the Capacitor WebView, so the app hands sign-in
// off to the system browser and polls the backend for the result.

export interface MobileGoogleSession {
  sessionId: string;
  loginUrl: string;
  expiresIn: number;
}

export async function startMobileGoogleSession(): Promise<MobileGoogleSession> {
  return await request<MobileGoogleSession>('/auth/mobile-session/start', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function pollMobileGoogleSession(
  sessionId: string
): Promise<{ status: 'pending' | 'complete' | 'expired'; user?: User; token?: string }> {
  return await request(`/auth/mobile-session/${encodeURIComponent(sessionId)}`);
}

export async function signOutUser(): Promise<void> {
  localStorage.removeItem('splitwise_user');
  setAuthToken(null);
}

// Data persistence
export async function updateUserProfileInDb(updates: Partial<User>): Promise<User | null> {
  try {
    const data = await request<{ success: boolean; user: User }>('/users/me', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return data.user;
  } catch (e) {
    console.error('Error updating user profile in DB:', e);
    return null;
  }
}

export async function addFriendInDb(name: string, email: string): Promise<any> {
  try {
    return await request('/users/friend', {
      method: 'POST',
      body: JSON.stringify({ name, email }),
    });
  } catch (e) {
    console.error('Error adding friend in DB:', e);
    return null;
  }
}

export async function saveGroupToDb(group: Group): Promise<void> {
  try {
    await request('/groups', {
      method: 'POST',
      body: JSON.stringify(group),
    });
  } catch (e) {
    console.error('Error saving group to DB:', e);
  }
}

export async function saveExpenseToDb(expense: Expense): Promise<void> {
  try {
    await request('/expenses', {
      method: 'POST',
      body: JSON.stringify(expense),
    });
  } catch (e) {
    console.error('Error saving expense to DB:', e);
  }
}

export async function updateExpenseInDb(expense: Expense): Promise<void> {
  try {
    await request(`/expenses/${expense.id}`, {
      method: 'PUT',
      body: JSON.stringify(expense),
    });
  } catch (e) {
    console.error('Error updating expense in DB:', e);
  }
}

export async function deleteExpenseFromDb(expenseId: string): Promise<void> {
  try {
    await request(`/expenses/${expenseId}`, {
      method: 'DELETE',
    });
  } catch (e) {
    console.error('Error deleting expense from DB:', e);
  }
}

export async function saveActivityToDb(activity: Activity): Promise<void> {
  try {
    await request('/activities', {
      method: 'POST',
      body: JSON.stringify(activity),
    });
  } catch (e) {
    console.error('Error saving activity to DB:', e);
  }
}

// Full sync
export interface SyncData {
  currentUser?: User;
  users: User[];
  groups: Group[];
  expenses: Expense[];
  activities: Activity[];
}

export async function syncUserData(): Promise<SyncData | null> {
  try {
    const data = await request<{
      success: boolean;
      currentUser?: User;
      users: User[];
      groups: Group[];
      expenses: Expense[];
      activities: Activity[];
    }>('/sync/me');
    return data;
  } catch (e) {
    console.warn('Sync failed, using offline cache:', e);
    return null;
  }
}

// Receipt scanning - the Gemini call now runs server-side (server/routes/receipt.ts)
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
