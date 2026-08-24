import { User, Group, Expense, Activity } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    // A CORS rejection or a proxy/gateway error can return HTML rather than
    // JSON; res.json() would then throw something far less useful than the
    // status we already have.
    let data: any;
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      throw new Error(data.error || `HTTP error! status: ${res.status}`);
    }
    return data as T;
  } catch (err: any) {
    console.warn(`API call failed for ${endpoint}:`, err.message);

    // fetch() rejects with a bare TypeError("Failed to fetch") for anything
    // that stops the request at the network layer - most often a CORS
    // rejection (the API's CORS_ORIGINS not listing this site's origin), but
    // also DNS/offline or a cold-started backend. That message tells a user
    // nothing and sends debugging in the wrong direction, so name the likely
    // causes instead.
    if (err instanceof TypeError) {
      throw new Error(
        `Could not reach the Tabby server at ${API_BASE}. This is usually the API ` +
        `rejecting this site's origin (CORS), or the server being asleep or offline.`
      );
    }
    throw err;
  }
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
