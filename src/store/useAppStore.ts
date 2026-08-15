import { create } from 'zustand';
import { User, Group, Expense, Activity, GroupCategory } from '../types';
import {
  saveUserToFirestore,
  saveGroupToFirestore,
  saveExpenseToFirestore,
  updateExpenseInFirestore,
  deleteExpenseFromFirestore,
  saveActivityToFirestore,
  signOutUser
} from '../lib/firebase';
import { formatAmount } from '../utils/currency';

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
  
  login: (user: User) => void;
  logout: () => void;
  updateProfile: (updatedFields: Partial<User>) => void;
  resetData: () => void;
  
  createGroup: (name: string, category: GroupCategory, memberIds: string[]) => void;
  addFriend: (name: string, email: string) => void;
  saveExpense: (expenseData: Omit<Expense, 'id' | 'createdBy' | 'createdAt'> | Expense) => void;
  deleteExpense: (expenseId: string) => void;
  settleDebt: (fromUserId: string, toUserId: string, amount: number, groupId: string | null) => void;
  simulateAppUpdate: () => void;
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

  login: (user) => {
    localStorage.setItem('splitwise_user', JSON.stringify(user));
    saveUserToFirestore(user);
    set((state) => {
      const updated = state.users.some(u => u.id === user.id) 
        ? state.users 
        : [user, ...state.users];
      localStorage.setItem('splitwise_users', JSON.stringify(updated));
      return { currentUser: user, users: updated };
    });
  },

  logout: () => {
    signOutUser();
    localStorage.removeItem('splitwise_user');
    set({ currentUser: null });
  },

  updateProfile: (updatedFields) => {
    const { currentUser, users } = get();
    if (!currentUser) return;
    
    const updatedUser = { ...currentUser, ...updatedFields };
    localStorage.setItem('splitwise_user', JSON.stringify(updatedUser));
    saveUserToFirestore(updatedUser);
    
    const updatedUsers = users.map((u) => (u.id === currentUser.id ? updatedUser : u));
    localStorage.setItem('splitwise_users', JSON.stringify(updatedUsers));
    
    set({ currentUser: updatedUser, users: updatedUsers });
  },

  resetData: () => {
    localStorage.removeItem('splitwise_users');
    localStorage.removeItem('splitwise_groups');
    localStorage.removeItem('splitwise_expenses');
    localStorage.removeItem('splitwise_activities');
    localStorage.removeItem('splitwise_currency');
    
    set({
      users: [],
      groups: [],
      expenses: [],
      activities: [],
      currency: 'USD'
    });
  },

  createGroup: (name, category, memberIds) => {
    const { currentUser, groups, activities } = get();
    if (!currentUser) return;

    const finalMembers = Array.from(new Set([currentUser.id, ...memberIds]));
    const newGroup: Group = {
      id: `group-${Date.now()}`,
      name: name.trim(),
      category,
      members: finalMembers,
      createdAt: new Date().toISOString(),
    };

    saveGroupToFirestore(newGroup);
    const updatedGroups = [...groups, newGroup];
    localStorage.setItem('splitwise_groups', JSON.stringify(updatedGroups));

    const newAct: Activity = {
      id: `act-${Date.now()}`,
      type: 'group_create',
      userId: currentUser.id,
      description: `created the group "${newGroup.name}"`,
      timestamp: new Date().toISOString(),
    };
    saveActivityToFirestore(newAct);
    const updatedActs = [newAct, ...activities];
    localStorage.setItem('splitwise_activities', JSON.stringify(updatedActs));

    set({ groups: updatedGroups, activities: updatedActs });
  },

  addFriend: (name, email) => {
    const { currentUser, users, activities } = get();
    if (!currentUser) return;

    const newFriend: User = {
      id: `user-${Date.now()}`,
      name: name.trim(),
      email: email.trim(),
      avatar: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 1000000)}?auto=format&fit=crop&w=150&h=150&q=80`,
    };

    saveUserToFirestore(newFriend);
    const updatedUsers = [...users, newFriend];
    localStorage.setItem('splitwise_users', JSON.stringify(updatedUsers));

    const updatedUser = {
      ...currentUser,
      friendIds: Array.from(new Set([...(currentUser.friendIds || []), newFriend.id])),
    };
    localStorage.setItem('splitwise_user', JSON.stringify(updatedUser));
    saveUserToFirestore(updatedUser);

    const newAct: Activity = {
      id: `act-${Date.now()}`,
      type: 'friend_add',
      userId: currentUser.id,
      description: `added "${newFriend.name}" as a friend`,
      timestamp: new Date().toISOString(),
    };
    saveActivityToFirestore(newAct);
    const updatedActs = [newAct, ...activities];
    localStorage.setItem('splitwise_activities', JSON.stringify(updatedActs));

    set({ users: updatedUsers, currentUser: updatedUser, activities: updatedActs });
  },

  saveExpense: (expenseData) => {
    const { currentUser, groups, expenses, activities, currency } = get();
    if (!currentUser) return;

    let updatedExpenses = [...expenses];
    let newAct: Activity;

    if ('id' in expenseData && expenseData.id) {
      const updatedExpense = expenseData as Expense;
      updateExpenseInFirestore(updatedExpense);
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
      saveExpenseToFirestore(newExpense);
      updatedExpenses = [...expenses, newExpense];
      
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

    localStorage.setItem('splitwise_expenses', JSON.stringify(updatedExpenses));
    saveActivityToFirestore(newAct);
    const updatedActs = [newAct, ...activities];
    localStorage.setItem('splitwise_activities', JSON.stringify(updatedActs));

    set({ expenses: updatedExpenses, activities: updatedActs });
  },

  deleteExpense: (expenseId) => {
    const { currentUser, expenses, activities, currency } = get();
    if (!currentUser) return;

    const target = expenses.find((e) => e.id === expenseId);
    if (!target) return;

    deleteExpenseFromFirestore(expenseId);
    const updatedExpenses = expenses.filter((e) => e.id !== expenseId);
    localStorage.setItem('splitwise_expenses', JSON.stringify(updatedExpenses));

    const newAct: Activity = {
      id: `act-${Date.now()}`,
      type: 'expense_delete',
      userId: currentUser.id,
      description: `deleted "${target.description}" (${formatAmount(target.amount, currency)})`,
      timestamp: new Date().toISOString(),
    };

    saveActivityToFirestore(newAct);
    const updatedActs = [newAct, ...activities];
    localStorage.setItem('splitwise_activities', JSON.stringify(updatedActs));

    set({ expenses: updatedExpenses, activities: updatedActs });
  },

  settleDebt: (fromUserId, toUserId, amount, groupId) => {
    const { currentUser, users, expenses, activities, currency } = get();
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

    saveExpenseToFirestore(settlementExpense);
    const updatedExpenses = [...expenses, settlementExpense];
    localStorage.setItem('splitwise_expenses', JSON.stringify(updatedExpenses));

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

    saveActivityToFirestore(newAct);
    const updatedActs = [newAct, ...activities];
    localStorage.setItem('splitwise_activities', JSON.stringify(updatedActs));

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
    saveActivityToFirestore(updateAct);
    const updatedActs = [updateAct, ...activities];
    set({ activities: updatedActs });
  }
}));
