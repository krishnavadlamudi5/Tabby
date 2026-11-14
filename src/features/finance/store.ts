import { create } from 'zustand';
import { financeApi } from './api';
import type { Account, Category } from './types';

// Small cache of data almost every finance screen needs.
interface FinanceState {
  accounts: Account[];
  categories: Category[];
  reviewCount: number;
  loaded: boolean;
  loadBasics: (force?: boolean) => Promise<void>;
  refreshAccounts: () => Promise<void>;
  refreshCategories: () => Promise<void>;
  setReviewCount: (n: number) => void;
  reset: () => void;
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  accounts: [],
  categories: [],
  reviewCount: 0,
  loaded: false,
  loadBasics: async (force = false) => {
    if (get().loaded && !force) return;
    const [a, c] = await Promise.all([financeApi.accounts(), financeApi.categories()]);
    set({ accounts: a.accounts, categories: c.categories, loaded: true });
  },
  refreshAccounts: async () => set({ accounts: (await financeApi.accounts()).accounts }),
  refreshCategories: async () => set({ categories: (await financeApi.categories()).categories }),
  setReviewCount: (n) => set({ reviewCount: n }),
  reset: () => set({ accounts: [], categories: [], reviewCount: 0, loaded: false }),
}));

/** "Groceries › Dairy & eggs" */
export function categoryLabel(categories: Category[], id: string | null | undefined): string {
  if (!id) return 'Uncategorised';
  const c = categories.find((x) => x.id === id);
  if (!c) return 'Uncategorised';
  const parent = c.parentId ? categories.find((x) => x.id === c.parentId) : null;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}

export function categoryColor(categories: Category[], id: string | null | undefined): string {
  return categories.find((x) => x.id === id)?.color || '#A39E98';
}
