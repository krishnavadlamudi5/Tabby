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
  syncUserData,
  getAuthToken,
  setAuthToken,
  onUnauthorized,
  isTransientError,
  ApiError,
} from '../lib/api';
import { Outbox, OutboxEntry, OutboxOp } from '../lib/outbox';
import { KEYS, readJson, readString, writeJson, writeString, migrateLegacyStorage } from '../lib/storage';
import { nativeGoogleSignOut, webGoogleSignOut } from '../lib/googleAuth';
import { formatAmount } from '../utils/currency';
import { getDemoInitialData } from '../data/demoData';
import { useToastStore } from './useToastStore';

/**
 * - loading:   restoring a saved session
 * - signedOut: show the login screen
 * - demo:      local sample data only; nothing is ever sent to the server
 * - signedIn:  real account; the server is the source of truth
 */
export type AuthStatus = 'loading' | 'signedOut' | 'demo' | 'signedIn';

const DEMO_USER_ID = 'user-alex';

interface UserData {
  users: User[];
  groups: Group[];
  expenses: Expense[];
  activities: Activity[];
}

interface AppState extends UserData {
  currentUser: User | null;
  currency: string;
  authStatus: AuthStatus;
  pendingCount: number;

  setCurrentUser: (user: User | null) => void;
  setUsers: (users: User[]) => void;
  setGroups: (groups: Group[]) => void;
  setExpenses: (expenses: Expense[]) => void;
  setActivities: (activities: Activity[]) => void;
  setCurrency: (currency: string) => void;

  initStore: () => void;
  signIn: (user: User, token: string) => void;
  startDemo: () => void;
  signOut: () => void;
  syncWithBackend: () => Promise<void>;
  retrySync: () => void;

  updateProfile: (updatedFields: Partial<User>) => void;
  resetData: () => void;

  createGroup: (name: string, category: GroupCategory, memberIds: string[]) => string;
  addFriend: (name: string, email: string) => Promise<void>;
  saveExpense: (expenseData: Omit<Expense, 'id' | 'createdBy' | 'createdAt'> | Expense) => void;
  deleteExpense: (expenseId: string) => void;
  settleDebt: (fromUserId: string, toUserId: string, amount: number, groupId: string | null) => void;
  simulateAppUpdate: () => void;
}

// --- Local cache (per user) -------------------------------------------

function persistUserData(userId: string, data: UserData) {
  writeJson(KEYS.data(userId), data);
}

function loadUserData(user: User): UserData {
  const cached = readJson<UserData>(KEYS.data(user.id));
  if (cached && Array.isArray(cached.groups)) return cached;
  return { users: [user], groups: [], expenses: [], activities: [] };
}

// --- Outbox wiring ------------------------------------------------------

async function executeOp(op: OutboxOp): Promise<void> {
  switch (op.kind) {
    case 'saveGroup':
      return saveGroupToDb(op.payload);
    case 'saveExpense':
      return saveExpenseToDb(op.payload);
    case 'updateExpense':
      return updateExpenseInDb(op.payload);
    case 'deleteExpense':
      return deleteExpenseFromDb(op.payload.id);
    case 'saveActivity':
      return saveActivityToDb(op.payload);
    case 'updateProfile':
      await updateUserProfileInDb(op.payload);
      return;
    case 'addFriend':
      await addFriendInDb(op.payload.name, op.payload.email);
      return;
  }
}

const OP_LABELS: Record<OutboxOp['kind'], string> = {
  saveGroup: 'save a group',
  saveExpense: 'save an expense',
  updateExpense: 'update an expense',
  deleteExpense: 'delete an expense',
  saveActivity: 'record an activity',
  updateProfile: 'update your profile',
  addFriend: 'add a friend',
};

let outbox: Outbox | null = null;
let onlineListenerAttached = false;

function openOutbox(userId: string, onCount: (n: number) => void): Outbox {
  outbox?.stop();
  const key = KEYS.outbox(userId);
  outbox = new Outbox({
    storage: {
      load: () => readJson<OutboxEntry[]>(key) || [],
      save: (entries) => writeJson(key, entries.length ? entries : null),
    },
    execute: executeOp,
    isTransient: isTransientError,
    isUnauthorized: (err) => err instanceof ApiError && err.status === 401,
    onPermanentFailure: (entry, err) => {
      const reason = err instanceof Error ? err.message : 'the server rejected it';
      useToastStore.getState().addToast(`Couldn't ${OP_LABELS[entry.op.kind]}: ${reason}`, 'error');
    },
    onChange: onCount,
  });
  onCount(outbox.size);

  if (!onlineListenerAttached && typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      void outbox?.flush();
    });
    onlineListenerAttached = true;
  }
  return outbox;
}

function closeOutbox() {
  outbox?.stop();
  outbox = null;
}

export const useAppStore = create<AppState>((set, get) => {
  /** Queue a change for the server. In demo mode nothing leaves the device. */
  const send = (op: OutboxOp) => {
    if (get().authStatus !== 'signedIn' || !outbox) return;
    outbox.enqueue(op);
  };

  /** Save the current lists to the per-user cache (not in demo mode). */
  const cache = (data: UserData) => {
    const { currentUser, authStatus } = get();
    if (currentUser && authStatus === 'signedIn') persistUserData(currentUser.id, data);
  };

  const enterSignedIn = (user: User) => {
    writeJson(KEYS.user, user);
    writeString(KEYS.demo, null);
    set({ currentUser: user, authStatus: 'signedIn', ...loadUserData(user) });
    openOutbox(user.id, (n) => set({ pendingCount: n }));
    void get().syncWithBackend();
  };

  return {
    currentUser: null,
    users: [],
    groups: [],
    expenses: [],
    activities: [],
    currency: 'INR',
    authStatus: 'loading',
    pendingCount: 0,

    setCurrentUser: (user) => set({ currentUser: user }),
    setUsers: (users) => set({ users }),
    setGroups: (groups) => set({ groups }),
    setExpenses: (expenses) => set({ expenses }),
    setActivities: (activities) => set({ activities }),

    setCurrency: (newCurrency) => {
      writeString(KEYS.currency, newCurrency);
      set({ currency: newCurrency });
    },

    initStore: () => {
      migrateLegacyStorage();

      const savedCurrency = readString(KEYS.currency);
      if (savedCurrency) set({ currency: savedCurrency });

      onUnauthorized(() => {
        if (get().authStatus !== 'signedIn') return;
        get().signOut();
        useToastStore.getState().addToast('Your session expired. Please sign in again.', 'info');
      });

      const token = getAuthToken();
      const cachedUser = readJson<User>(KEYS.user);
      if (token && cachedUser?.id) {
        enterSignedIn(cachedUser);
        return;
      }
      if (readString(KEYS.demo) === '1') {
        get().startDemo();
        return;
      }
      set({ authStatus: 'signedOut', currentUser: null });
    },

    signIn: (user, token) => {
      setAuthToken(token);
      enterSignedIn(user);
      useToastStore.getState().addToast(`Signed in as ${user.name}`, 'success');
    },

    startDemo: () => {
      closeOutbox();
      writeString(KEYS.demo, '1');
      const demo = getDemoInitialData(DEMO_USER_ID);
      set({
        authStatus: 'demo',
        pendingCount: 0,
        currentUser: demo.currentUser,
        users: demo.users,
        groups: demo.groups,
        expenses: demo.expenses,
        activities: demo.activities,
      });
    },

    signOut: () => {
      const { currentUser, authStatus } = get();
      // Pending changes stay saved under this user's outbox key and are sent
      // the next time they sign in; the cached copy of their data is removed
      // so the next person on this device can't see it.
      if (currentUser && authStatus === 'signedIn') writeString(KEYS.data(currentUser.id), null);
      closeOutbox();
      setAuthToken(null);
      writeString(KEYS.user, null);
      writeString(KEYS.demo, null);
      void nativeGoogleSignOut();
      webGoogleSignOut();
      set({
        authStatus: 'signedOut',
        currentUser: null,
        users: [],
        groups: [],
        expenses: [],
        activities: [],
        pendingCount: 0,
      });
    },

    syncWithBackend: async () => {
      if (get().authStatus !== 'signedIn' || !outbox) return;
      const box = outbox;

      // Send local changes first. If any are still pending (offline), keep
      // local data as-is: replacing it with the server's copy would hide them.
      await box.flush();
      if (box.size > 0) return;

      const versionAtStart = box.version;
      let data;
      try {
        data = await syncUserData();
      } catch {
        return; // offline or server asleep; the cached data stays on screen
      }

      // Something changed while we were fetching, or the user signed out.
      if (outbox !== box || box.version !== versionAtStart || box.size > 0) return;
      if (get().authStatus !== 'signedIn') return;

      // Server data wins.
      set((state) => {
        const currentUser = data.currentUser ? { ...state.currentUser, ...data.currentUser } as User : state.currentUser;
        const next: UserData = {
          users: data.users?.length ? data.users : state.users,
          groups: data.groups || [],
          expenses: data.expenses || [],
          activities: data.activities || [],
        };
        if (currentUser) {
          writeJson(KEYS.user, currentUser);
          persistUserData(currentUser.id, next);
        }
        return { currentUser, ...next };
      });
    },

    retrySync: () => {
      void get().syncWithBackend();
    },

    updateProfile: (updatedFields) => {
      const { currentUser, users, groups, expenses, activities, authStatus } = get();
      if (!currentUser) return;

      const updatedUser = { ...currentUser, ...updatedFields };
      if (authStatus === 'signedIn') writeJson(KEYS.user, updatedUser);
      send({ kind: 'updateProfile', payload: updatedFields });

      const updatedUsers = users.map((u) => (u.id === currentUser.id ? updatedUser : u));
      cache({ users: updatedUsers, groups, expenses, activities });
      set({ currentUser: updatedUser, users: updatedUsers });
    },

    resetData: () => {
      const { currentUser, authStatus } = get();
      if (authStatus === 'demo') {
        get().startDemo();
        return;
      }
      // Signed in: drop the local cache and reload everything from the server.
      if (currentUser) writeString(KEYS.data(currentUser.id), null);
      void get().syncWithBackend();
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
      send({ kind: 'saveGroup', payload: newGroup });
      const updatedGroups = [newGroup, ...groups];

      const newAct: Activity = {
        id: `act-${Date.now()}`,
        type: 'group_create',
        userId: currentUser.id,
        description: `created the group "${newGroup.name}"`,
        timestamp: new Date().toISOString(),
      };
      send({ kind: 'saveActivity', payload: newAct });
      const updatedActs = [newAct, ...activities];

      cache({ users, groups: updatedGroups, expenses, activities: updatedActs });
      set({ groups: updatedGroups, activities: updatedActs });

      useToastStore.getState().addToast(`Group "${newGroup.name}" created`, 'success');
      return newGroup.id;
    },

    addFriend: async (name, email) => {
      const { currentUser, authStatus } = get();
      if (!currentUser) return;

      const newAct: Activity = {
        id: `act-${Date.now()}`,
        type: 'friend_add',
        userId: currentUser.id,
        description: `added "${name.trim()}" as a friend`,
        timestamp: new Date().toISOString(),
      };

      // The server decides a friend's id (it may match an existing account),
      // so when online use its answer directly instead of a temporary id.
      let friend: User | null = null;
      let serverUser: User | null = null;
      if (authStatus === 'signedIn') {
        try {
          const res = await addFriendInDb(name, email);
          friend = res.friend;
          serverUser = res.currentUser;
        } catch (err) {
          if (!isTransientError(err)) {
            useToastStore.getState().addToast((err as Error).message || 'Could not add friend', 'error');
            return;
          }
          send({ kind: 'addFriend', payload: { name, email } });
        }
      }

      if (!friend) {
        friend = {
          id: `user-${Date.now()}`,
          name: name.trim(),
          email: email.trim(),
          avatar: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 1000000)}?auto=format&fit=crop&w=150&h=150&q=80`,
        };
      }

      const state = get();
      if (!state.currentUser) return;
      const updatedUser: User = serverUser
        ? { ...state.currentUser, ...serverUser }
        : { ...state.currentUser, friendIds: Array.from(new Set([...(state.currentUser.friendIds || []), friend.id])) };
      const updatedUsers = [
        ...state.users.filter((u) => u.id !== friend!.id && u.id !== updatedUser.id),
        updatedUser,
        friend,
      ];
      const updatedActs = [newAct, ...state.activities];

      if (state.authStatus === 'signedIn') writeJson(KEYS.user, updatedUser);
      send({ kind: 'saveActivity', payload: newAct });
      cache({ users: updatedUsers, groups: state.groups, expenses: state.expenses, activities: updatedActs });
      set({ users: updatedUsers, currentUser: updatedUser, activities: updatedActs });

      useToastStore.getState().addToast(`Added "${friend.name}" as friend`, 'success');
    },

    saveExpense: (expenseData) => {
      const { currentUser, groups, expenses, activities, users, currency } = get();
      if (!currentUser) return;

      let updatedExpenses = [...expenses];
      let newAct: Activity;

      const scopeFor = (groupId: string | null) => {
        if (!groupId) return 'outside of any group';
        const grp = groups.find((g) => g.id === groupId);
        return grp ? `in "${grp.name}"` : 'outside of any group';
      };

      if ('id' in expenseData && expenseData.id) {
        const updatedExpense = expenseData as Expense;
        send({ kind: 'updateExpense', payload: updatedExpense });
        updatedExpenses = expenses.map((e) => (e.id === updatedExpense.id ? updatedExpense : e));

        newAct = {
          id: `act-${Date.now()}`,
          type: 'expense_add',
          userId: currentUser.id,
          description: `updated "${updatedExpense.description}" (${formatAmount(updatedExpense.amount, currency)}) ${scopeFor(updatedExpense.groupId)}`,
          timestamp: new Date().toISOString(),
        };
        useToastStore.getState().addToast('Expense updated successfully', 'success');
      } else {
        const newExpense: Expense = {
          ...(expenseData as Omit<Expense, 'id' | 'createdBy' | 'createdAt'>),
          id: `exp-${Date.now()}`,
          createdBy: currentUser.id,
          createdAt: new Date().toISOString(),
        };
        send({ kind: 'saveExpense', payload: newExpense });
        updatedExpenses = [newExpense, ...expenses];

        newAct = {
          id: `act-${Date.now()}`,
          type: 'expense_add',
          userId: currentUser.id,
          description: `added "${newExpense.description}" (${formatAmount(newExpense.amount, currency)}) ${scopeFor(newExpense.groupId)}`,
          timestamp: new Date().toISOString(),
        };
        useToastStore.getState().addToast('Expense added successfully', 'success');
      }

      send({ kind: 'saveActivity', payload: newAct });
      const updatedActs = [newAct, ...activities];
      cache({ users, groups, expenses: updatedExpenses, activities: updatedActs });
      set({ expenses: updatedExpenses, activities: updatedActs });
    },

    deleteExpense: (expenseId) => {
      const { currentUser, expenses, activities, users, groups, currency } = get();
      if (!currentUser) return;

      const target = expenses.find((e) => e.id === expenseId);
      if (!target) return;

      send({ kind: 'deleteExpense', payload: { id: expenseId } });
      const updatedExpenses = expenses.filter((e) => e.id !== expenseId);

      const newAct: Activity = {
        id: `act-${Date.now()}`,
        type: 'expense_delete',
        userId: currentUser.id,
        description: `deleted "${target.description}" (${formatAmount(target.amount, currency)})`,
        timestamp: new Date().toISOString(),
      };
      send({ kind: 'saveActivity', payload: newAct });
      const updatedActs = [newAct, ...activities];

      cache({ users, groups, expenses: updatedExpenses, activities: updatedActs });
      set({ expenses: updatedExpenses, activities: updatedActs });

      useToastStore.getState().addToast('Expense deleted', 'info');
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
      send({ kind: 'saveExpense', payload: settlementExpense });
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
      send({ kind: 'saveActivity', payload: newAct });
      const updatedActs = [newAct, ...activities];

      cache({ users, groups, expenses: updatedExpenses, activities: updatedActs });
      set({ expenses: updatedExpenses, activities: updatedActs });

      useToastStore.getState().addToast('Settlement recorded', 'success');
    },

    simulateAppUpdate: () => {
      const { currentUser, activities } = get();
      const updateAct: Activity = {
        id: `act-update-${Date.now()}`,
        type: 'app_update' as any,
        userId: currentUser?.id || DEMO_USER_ID,
        description: '🚀 Tabby System Update v1.2 installed: Added category pie charts, bar comparison, and fast contact search.',
        timestamp: new Date().toISOString(),
      };
      send({ kind: 'saveActivity', payload: updateAct });
      set({ activities: [updateAct, ...activities] });

      useToastStore.getState().addToast('Simulated a new update!', 'activity');
    },
  };
});
