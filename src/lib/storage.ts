// Small safe wrappers around localStorage (it can throw in private mode or
// when storage is full) plus the one-time move from the old `splitwise_*`
// key names to `tabby_*`.

export const KEYS = {
  token: 'tabby_auth_token',
  user: 'tabby_user',
  demo: 'tabby_demo',
  currency: 'tabby_currency',
  data: (userId: string) => `tabby_data_${userId}`,
  outbox: (userId: string) => `tabby_outbox_${userId}`,
} as const;

export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (e) {
    console.warn(`Could not write ${key} to localStorage:`, e);
  }
}

export function readJson<T>(key: string): T | null {
  const raw = readString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  writeString(key, value === null || value === undefined ? null : JSON.stringify(value));
}

/**
 * Renames every `splitwise_*` key to `tabby_*` once. An existing `tabby_*`
 * value always wins, so running this repeatedly is harmless.
 */
export function migrateLegacyStorage(storage: Storage = localStorage): void {
  try {
    const legacyKeys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith('splitwise_')) legacyKeys.push(key);
    }
    for (const key of legacyKeys) {
      const newKey = 'tabby_' + key.slice('splitwise_'.length);
      const value = storage.getItem(key);
      if (value !== null && storage.getItem(newKey) === null) {
        storage.setItem(newKey, value);
      }
      storage.removeItem(key);
    }
  } catch (e) {
    console.warn('Legacy storage migration skipped:', e);
  }
}
