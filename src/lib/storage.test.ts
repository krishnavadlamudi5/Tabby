import { describe, expect, it } from 'vitest';
import { migrateLegacyStorage } from './storage';

function memoryStorage(initial: Record<string, string>): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

describe('migrateLegacyStorage', () => {
  it('renames splitwise_* keys to tabby_* and removes the old ones', () => {
    const s = memoryStorage({
      splitwise_currency: 'USD',
      'splitwise_data_user-1': '{"groups":[]}',
      other_key: 'x',
    });
    migrateLegacyStorage(s);
    expect(s.getItem('tabby_currency')).toBe('USD');
    expect(s.getItem('tabby_data_user-1')).toBe('{"groups":[]}');
    expect(s.getItem('splitwise_currency')).toBeNull();
    expect(s.getItem('other_key')).toBe('x');
  });

  it('never overwrites an existing tabby_* value and is safe to run twice', () => {
    const s = memoryStorage({ splitwise_currency: 'USD', tabby_currency: 'INR' });
    migrateLegacyStorage(s);
    migrateLegacyStorage(s);
    expect(s.getItem('tabby_currency')).toBe('INR');
    expect(s.getItem('splitwise_currency')).toBeNull();
  });
});
