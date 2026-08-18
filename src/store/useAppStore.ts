import { create } from 'zustand';
import { User, Group, Expense, Activity, GroupCategory } from '../types';
import {
  saveGroupToDb,
  saveExpenseToDb,
  updateExpenseInDb,
  deleteExpenseFromDb,
  saveActivityToDb,
  updateUserProfileInDb,
  addFriendInDb,
  signOutUser,
  syncUserData,
  setAuthToken,
  getAuthToken,
  onUnauthorized
} from '../lib/api';
import { formatAmount } from '../utils/currency';
import { isDemoUser, getDemoInitialData, DEMO_USERS, DEMO_GROUPS, DEMO_EXPENSES, DEMO_ACTIVITIES } from '../data/demoData';

interface AppState {
  currentUser: User | null;
  users: User[];
  groups: Group[];
  expenses: Expense[];
  activities: Activity[];
  currency: string;
  
  // Actions
  setCurrentUser: (user: User | null) => void;
  setUsers: (users: User[]) => void;
  setGroups: (groups: Group[]) => void;
  setExpenses: (expenses: Expense[]) => void;
  setActivities: (activities: Activity[]) => void;
  setCurrency: (currency: string) => void;
  
  initStore: () => void;
  syncWithBackend: (userId: string) => Promise<void>;
  login: (user: User, token: string) => void;
  logout: () => void;
  updateProfile: (updatedFields: Partial<User>) => void;
  resetData: () => void;
  
  createGroup: (name: string, category: GroupCategory, memberIds: string[]) => string;
  addFriend: (name: string, email: string) => Promise<void>;
  saveExpense: (expenseData: Omit<Expense, 'id' | 'createdBy' | 'createdAt'> | Expense) => void;
  deleteExpense: (expenseId: string) => void;
  settleDebt: (fromUserId: string, toUserId: string, amount: number, groupId: string | null) => void;
  simulateAppUpdate: () => void;
}

// Helper to save per-user scoped cache
function persistUserData(userId: string, data: { users: User[]; groups: Group[]; expenses: Expense[]; activities: Activity[] }) {
  try {
    localStorage.setItem(`splitwise_data_${userId}`, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to persist user cache:', e);
  }
}

// Helper to load per-user scoped cache
function loadUserData(user: User): { users: User[]; groups: Group[]; expenses: Expense[]; activities: Activity[] } {
  try {
    const raw = localStorage.getItem(`splitwise_data_${user.id}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.groups)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse user cache:', e);
  }

  // If demo user and no valid cached data, return complete demo dataset
  if (isDemoUser(user.id)) {
    return getDemoInitialData(user.id);
  }

  // If regular / new user, return completely fresh empty data
  return {
    users: [user],
    groups: [],
    expenses: [],
    activities: [],
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  currentUser: null,
  users: [],
  groups: [],
  expenses: [],
  activities: [],
  currency: 'USD',

  setCurrentUser: (user) => set({ currentUser: user }),
  setUsers: (users) => set({ users }),
  setGroups: (groups) => set({ groups }),
  setExpenses: (expenses) => set({ expenses }),
  setActivities: (activities) => set({ activities }),
  
  setCurrency: (newCurrency) => {
    localStorage.setItem('splitwise_currency', newCurrency);
    set({ currency: newCurrency });
  },

  initStore: () => {
    // Any 401 from the backend (expired/invalid token) drops the app back to
    // the login screen instead of spinning on failed requests forever.
    onUnauthorized(() => get().logout());

    try {
      const savedCurrency = localStorage.getItem('splitwise_currency');
      if (savedCurrency) set({ currency: savedCurrency });

      const rawUser = localStorage.getItem('splitwise_user');
      const token = getAuthToken();

      // A cached user with no token means this is a session from before
      // authenticated sync existed (or a corrupted/cleared token) - it can't
      // be restored, so require a fresh sign-in rather than showing stale
      // local data the backend will now reject.
      if (rawUser && token) {
        const user = JSON.parse(rawUser) as User;
        const initial = loadUserData(user);
        set({
          currentUser: user,
          users: initial.users,
          groups: initial.groups,
          expenses: initial.expenses,
          activities: initial.activities,
        });
        get().syncWithBackend(user.id);
      } else if (rawUser && !token) {
        localStorage.removeItem('splitwise_user');
      }
    } catch (e) {
      console.error('Failed to initialize store:', e);
    }
  },

  syncWithBackend: async (userId: string) => {
    const isDemo = isDemoUser(userId);
    const data = await syncUserData();

    if (data) {
      set((state) => {
        // If demo user and server returned empty groups, keep demo initial data
        let finalGroups = data.groups || [];
        let finalExpenses = data.expenses || [];
        let finalActivities = data.activities || [];
        let finalUsers = data.users && data.users.length > 0 ? data.users : state.users;

        if (isDemo && (!data.groups || data.groups.length === 0)) {
          const demoInit = getDemoInitialData(userId);
          finalGroups = demoInit.groups;
          finalExpenses = demoInit.expenses;
          finalActivities = demoInit.activities;
          finalUsers = demoInit.users;
        }

        const nextState = {
          currentUser: data.currentUser ? { ...state.currentUser, ...data.currentUser } : state.currentUser,
          users: finalUsers,
          groups: finalGroups,
          expenses: finalExpenses,
          activities: finalActivities,
        };

        if (state.currentUser) {
          persistUserData(state.currentUser.id, {
            users: nextState.users,
            groups: nextState.groups,
            expenses: nextState.expenses,
            activities: nextState.activities,
          });
        }

        return nextState;
      });
    }
  },

  login: (user, token) => {
    const isDemo = isDemoUser(user.id);
    let initialData: { users: User[]; groups: Group[]; expenses: Expense[]; activities: Activity[] };

    if (isDemo) {
      initialData = getDemoInitialData(user.id);
    } else {
      initialData = loadUserData(user);
    }

    setAuthToken(token);
    localStorage.setItem('splitwise_user', JSON.stringify(user));
    persistUserData(user.id, initialData);

    set({
      currentUser: user,
      users: initialData.users,
      groups: initialData.groups,
      expenses: initialData.expenses,
      activities: initialData.activities,
    });

    // The auth endpoint that produced `user` (login/register/google/demo)
    // already persisted the authoritative record server-side - no separate
    // "save user" call is needed (or safe: that call used to be an
    // unauthenticated mass-assignment upsert, now removed).
    get().syncWithBackend(user.id);
  },

  logout: () => {
    signOutUser();
    localStorage.removeItem('splitwise_user');
    set({
      currentUser: null,
      users: [],
      groups: [],
      expenses: [],
      activities: [],
    });
  },

  updateProfile: (updatedFields) => {
    const { currentUser, users, groups, expenses, activities } = get();
    if (!currentUser) return;
    
    const updatedUser = { ...currentUser, ...updatedFields };
    localStorage.setItem('splitwise_user', JSON.stringify(updatedUser));
    updateUserProfileInDb(updatedFields);
    
    const updatedUsers = users.map((u) => (u.id === currentUser.id ? updatedUser : u));
    persistUserData(currentUser.id, { users: updatedUsers, groups, expenses, activities });
    
    set({ currentUser: updatedUser, users: updatedUsers });
  },

  resetData: () => {
    const { currentUser } = get();
    if (currentUser) {
      localStorage.removeItem(`splitwise_data_${currentUser.id}`);
    }
    
    set({
      users: currentUser ? [currentUser] : [],
      groups: [],
      expenses: [],
      activities: [],
      currency: 'USD'
    });
  },

  createGroup: (name, category, memberIds) => {
    const { currentUser, groups, activities, users, expenses } = get();
    if (!currentUser) return '';

    const finalMembers = Array.from(new Set([currentUser.id, ...memberIds]));
    const newGroup: Group = {
      id: `group-${Date.now()}`,
      name: name.trim(),
      category,
      members: finalMembers,
      createdAt: new Date().toISOString(),
    };

    saveGroupToDb(newGroup);
    const updatedGroups = [newGroup, ...groups];

    const newAct: Activity = {
      id: `act-${Date.now()}`,
      type: 'group_create',
      userId: currentUser.id,
      description: `created the group "${newGroup.name}"`,
      timestamp: new Date().toISOString(),
    };
    saveActivityToDb(newAct);
    const updatedActs = [newAct, ...activities];

    persistUserData(currentUser.id, { users, groups: updatedGroups, expenses, activities: updatedActs });
    set({ groups: updatedGroups, activities: updatedActs });
    return newGroup.id;
  },

  addFriend: async (name, email) => {
    const { currentUser, users, activities, groups, expenses } = get();
    if (!currentUser) return;

    const newFriend: User = {
      id: `user-${Date.now()}`,
      name: name.trim(),
      email: email.trim(),
      avatar: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 1000000)}?auto=format&fit=crop&w=150&h=150&q=80`,
    };

    const updatedUser = {
      ...currentUser,
      friendIds: Array.from(new Set([...(currentUser.friendIds || []), newFriend.id])),
    };
    const updatedUsers = [...users, newFriend];

    localStorage.setItem('splitwise_user', JSON.stringify(updatedUser));
    const newAct: Activity = {
      id: `act-${Date.now()}`,
      type: 'friend_add',
      userId: currentUser.id,
      description: `added "${newFriend.name}" as a friend`,
      timestamp: new Date().toISOString(),
    };

    const updatedActs = [newAct, ...activities];
    persistUserData(currentUser.id, { users: updatedUsers, groups, expenses, activities: updatedActs });

    set({ users: updatedUsers, currentUser: updatedUser, activities: updatedActs });

    // Sync to DB
    addFriendInDb(name, email);
    saveActivityToDb(newAct);
  },

  saveExpense: (expenseData) => {
    const { currentUser, groups, expenses, activities, users, currency } = get();
    if (!currentUser) return;

    let updatedExpenses = [...expenses];
    let newAct: Activity;

    if ('id' in expenseData && expenseData.id) {
      const updatedExpense = expenseData as Expense;
      updateExpenseInDb(updatedExpense);
      updatedExpenses = expenses.map((e) => (e.id === updatedExpense.id ? updatedExpense : e));
      
      let scopeText = 'outside of any group';
      if (updatedExpense.groupId) {
        const grp = groups.find((g) => g.id === updatedExpense.groupId);
        if (grp) scopeText = `in "${grp.name}"`;
      }

      newAct = {
        id: `act-${Date.now()}`,
        type: 'expense_add',
        userId: currentUser.id,
        description: `updated "${updatedExpense.description}" (${formatAmount(updatedExpense.amount, currency)}) ${scopeText}`,
        timestamp: new Date().toISOString(),
      };
    } else {
      const newExpense: Expense = {
        ...(expenseData as Omit<Expense, 'id' | 'createdBy' | 'createdAt'>),
        id: `exp-${Date.now()}`,
        createdBy: currentUser.id,
        createdAt: new Date().toISOString(),
      };
      saveExpenseToDb(newExpense);
      updatedExpenses = [newExpense, ...expenses];
      
      let scopeText = 'outside of any group';
      if (newExpense.groupId) {
        const grp = groups.find((g) => g.id === newExpense.groupId);
        if (grp) scopeText = `in "${grp.name}"`;
      }

      newAct = {
        id: `act-${Date.now()}`,
        type: 'expense_add',
        userId: currentUser.id,
        description: `added "${newExpense.description}" (${formatAmount(newExpense.amount, currency)}) ${scopeText}`,
        timestamp: new Date().toISOString(),
      };
    }

    saveActivityToDb(newAct);
    const updatedActs = [newAct, ...activities];
    persistUserData(currentUser.id, { users, groups, expenses: updatedExpenses, activities: updatedActs });

    set({ expenses: updatedExpenses, activities: updatedActs });
  },

  deleteExpense: (expenseId) => {
    const { currentUser, expenses, activities, users, groups, currency } = get();
    if (!currentUser) return;

    const target = expenses.find((e) => e.id === expenseId);
    if (!target) return;

    deleteExpenseFromDb(expenseId);
    const updatedExpenses = expenses.filter((e) => e.id !== expenseId);

    const newAct: Activity = {
      id: `act-${Date.now()}`,
      type: 'expense_delete',
      userId: currentUser.id,
      description: `deleted "${target.description}" (${formatAmount(target.amount, currency)})`,
      timestamp: new Date().toISOString(),
    };

    saveActivityToDb(newAct);
    const updatedActs = [newAct, ...activities];
    persistUserData(currentUser.id, { users, groups, expenses: updatedExpenses, activities: updatedActs });

    set({ expenses: updatedExpenses, activities: updatedActs });
  },

  settleDebt: (fromUserId, toUserId, amount, groupId) => {
    const { currentUser, users, expenses, activities, groups, currency } = get();
    if (!currentUser) return;

    const settlementExpense: Expense = {
      id: `settle-${Date.now()}`,
      description: 'Settle Up Payment',
      amount,
      date: new Date().toISOString().split('T')[0],
      paidBy: fromUserId,
      groupId,
      splitMethod: 'equally',
      involvedUserIds: [fromUserId, toUserId],
      isSettlement: true,
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
      splits: [{ userId: toUserId, amount }],
    };

    saveExpenseToDb(settlementExpense);
    const updatedExpenses = [settlementExpense, ...expenses];

    const fromUser = users.find((u) => u.id === fromUserId);
    const toUser = users.find((u) => u.id === toUserId);
    const desc = `recorded a payment of ${formatAmount(amount, currency)} from ${fromUserId === currentUser.id ? 'You' : fromUser?.name} to ${toUserId === currentUser.id ? 'You' : toUser?.name}`;

    const newAct: Activity = {
      id: `act-${Date.now()}`,
      type: 'settlement',
      userId: currentUser.id,
      description: desc,
      timestamp: new Date().toISOString(),
    };

    saveActivityToDb(newAct);
    const updatedActs = [newAct, ...activities];
    persistUserData(currentUser.id, { users, groups, expenses: updatedExpenses, activities: updatedActs });

    set({ expenses: updatedExpenses, activities: updatedActs });
  },

  simulateAppUpdate: () => {
    const { currentUser, activities } = get();
    const updateAct: Activity = {
      id: `act-update-${Date.now()}`,
      type: 'app_update' as any,
      userId: currentUser?.id || 'user-alex',
      description: '🚀 Tabby System Update v1.2 installed: Added category pie charts, bar comparison, and fast contact search.',
      timestamp: new Date().toISOString(),
    };
    saveActivityToDb(updateAct);
    const updatedActs = [updateAct, ...activities];
    set({ activities: updatedActs });
  }
}));
