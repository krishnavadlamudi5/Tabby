/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, Group, Expense, Activity, GroupCategory } from './types';
// Demo data imports removed for production
import Login from './components/Login';
import DashboardView from './components/DashboardView';
import GroupView from './components/GroupView';
import FriendView from './components/FriendView';
import ExpenseModal from './components/ExpenseModal';
import SettingsModal from './components/SettingsModal';
import SettleUpModal from './components/SettleUpModal';
import AddFriendModal from './components/AddFriendModal';
import NotificationsView from './components/NotificationsView';
import AppLogo from './components/AppLogo';
import { formatAmount } from './utils/currency';
import {
  subscribeUsers,
  subscribeGroups,
  subscribeExpenses,
  subscribeActivities,
  saveUserToFirestore,
  saveGroupToFirestore,
  saveExpenseToFirestore,
  updateExpenseInFirestore,
  deleteExpenseFromFirestore,
  saveActivityToFirestore,
  signOutUser,
  subscribeAuth,
} from './lib/firebase';
import { 
  Users, 
  UserPlus, 
  Plus, 
  LogOut, 
  Menu, 
  X, 
  Grid, 
  FolderPlus, 
  Check, 
  Sparkles,
  Info,
  AlertCircle,
  Settings,
  Search,
  Bell
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // App Master Datastores
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  // Navigation State
  const [activeView, setActiveView] = useState<
    { type: 'dashboard' } | 
    { type: 'group'; id: string } | 
    { type: 'friend'; id: string } |
    { type: 'notifications' }
  >({ type: 'dashboard' });

  // App Update Notification Banner State (Hidden by default unless explicitly triggered)
  const [isAppUpdateAvailable, setIsAppUpdateAvailable] = useState<boolean>(false);
  const [showAppUpdateBanner, setShowAppUpdateBanner] = useState<boolean>(false);

  // Responsive Drawer Toggle
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Modal Control States
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseModalGroupId, setExpenseModalGroupId] = useState<string | null>(null);
  const [expenseModalFriendId, setExpenseModalFriendId] = useState<string | null>(null);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);

  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isAddFriendOpen, setIsAddFriendOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Settle Up Modal State
  const [settleModal, setSettleModal] = useState<{
    isOpen: boolean;
    fromUser: User | null;
    toUser: User | null;
    totalDebt: number;
    groupId: string | null;
  }>({
    isOpen: false,
    fromUser: null,
    toUser: null,
    totalDebt: 0,
    groupId: null,
  });

  // App Currency Preference (defaults to USD)
  const [currency, setCurrency] = useState<string>('USD');

  // Group Form Inputs & Validation
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupCategory, setNewGroupCategory] = useState<GroupCategory>('trip');
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<string[]>([]);
  const [groupValidationError, setGroupValidationError] = useState<string | null>(null);

  // Friend Form Inputs
  const [newFriendName, setNewFriendName] = useState('');
  const [newFriendEmail, setNewFriendEmail] = useState('');

  // Sidebar Search Query State
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');

  // 1. Mount Phase - Recover states from LocalStorage
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('splitwise_user');
      const savedCurrency = localStorage.getItem('splitwise_currency');

      if (savedUser) setCurrentUser(JSON.parse(savedUser));
      if (savedCurrency) setCurrency(savedCurrency);
    } catch (e) {
      console.error('Failed to load local storage Splitwise states', e);
    }
  }, []);

  // 2. Subscription Phase - Listen to Firebase when user is authenticated
  useEffect(() => {
    if (!currentUser) return;

    // Live Firestore Subscriptions (Scoped to current user)
    const unsubUsers = subscribeUsers(currentUser.id, currentUser.friendIds || [], (firestoreUsers) => {
      setUsers(firestoreUsers);
      localStorage.setItem('splitwise_users', JSON.stringify(firestoreUsers));
    });

    const unsubGroups = subscribeGroups(currentUser.id, (firestoreGroups) => {
      setGroups(firestoreGroups);
      localStorage.setItem('splitwise_groups', JSON.stringify(firestoreGroups));
    });

    const unsubExpenses = subscribeExpenses(currentUser.id, (firestoreExpenses) => {
      setExpenses(firestoreExpenses);
      localStorage.setItem('splitwise_expenses', JSON.stringify(firestoreExpenses));
    });

    const unsubActivities = subscribeActivities(currentUser.id, (firestoreActivities) => {
      setActivities(firestoreActivities);
      localStorage.setItem('splitwise_activities', JSON.stringify(firestoreActivities));
    });

    return () => {
      unsubUsers();
      unsubGroups();
      unsubExpenses();
      unsubActivities();
    };
  }, [currentUser?.id, JSON.stringify(currentUser?.friendIds)]);

  // 2. Action Handlers - Syncing updates to LocalStorage and Firestore
  const handleCurrencyChange = (newCurrency: string) => {
    setCurrency(newCurrency);
    localStorage.setItem('splitwise_currency', newCurrency);
  };

  const handleUpdateProfile = (updatedFields: Partial<User>) => {
    if (!currentUser) return;
    const updatedUser: User = {
      ...currentUser,
      ...updatedFields,
    };
    setCurrentUser(updatedUser);
    localStorage.setItem('splitwise_user', JSON.stringify(updatedUser));

    saveUserToFirestore(updatedUser);
    setUsers((prevUsers) => {
      const updated = prevUsers.map((u) => (u.id === currentUser.id ? updatedUser : u));
      localStorage.setItem('splitwise_users', JSON.stringify(updated));
      return updated;
    });
  };

  const handleResetData = () => {
    localStorage.removeItem('splitwise_users');
    localStorage.removeItem('splitwise_groups');
    localStorage.removeItem('splitwise_expenses');
    localStorage.removeItem('splitwise_activities');
    localStorage.removeItem('splitwise_currency');

    setUsers([]);
    setGroups([]);
    setExpenses([]);
    setActivities([]);
    setCurrency('USD');
    setActiveView({ type: 'dashboard' });
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('splitwise_user', JSON.stringify(user));
    
    saveUserToFirestore(user);
    setUsers((prevUsers) => {
      if (prevUsers.some((u) => u.id === user.id)) return prevUsers;
      const updated = [user, ...prevUsers];
      localStorage.setItem('splitwise_users', JSON.stringify(updated));
      return updated;
    });
  };

  const handleLogout = () => {
    signOutUser();
    setCurrentUser(null);
    localStorage.removeItem('splitwise_user');
    setActiveView({ type: 'dashboard' });
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    setGroupValidationError(null);

    const isNameInvalid = !newGroupName.trim();
    const isMembersInvalid = newGroupMemberIds.length === 0;

    if (isNameInvalid && isMembersInvalid) {
      setGroupValidationError('Please enter a valid group name and select at least one member.');
      return;
    }

    if (isNameInvalid) {
      setGroupValidationError('Group name cannot be blank or contain only whitespace.');
      return;
    }

    if (isMembersInvalid) {
      setGroupValidationError('Please select at least one friend to join the group.');
      return;
    }

    if (!currentUser) return;

    // Must include current user in their own group
    const finalMembers = Array.from(new Set([currentUser.id, ...newGroupMemberIds]));

    const newGroup: Group = {
      id: `group-${Date.now()}`,
      name: newGroupName.trim(),
      category: newGroupCategory,
      members: finalMembers,
      createdAt: new Date().toISOString(),
    };

    saveGroupToFirestore(newGroup);
    setGroups((prev) => {
      const updated = [...prev, newGroup];
      localStorage.setItem('splitwise_groups', JSON.stringify(updated));
      return updated;
    });

    // Record creation log
    const newAct: Activity = {
      id: `act-${Date.now()}`,
      type: 'group_create',
      userId: currentUser.id,
      description: `created the group "${newGroup.name}"`,
      timestamp: new Date().toISOString(),
    };

    saveActivityToFirestore(newAct);
    setActivities((prev) => {
      const updated = [newAct, ...prev];
      localStorage.setItem('splitwise_activities', JSON.stringify(updated));
      return updated;
    });

    // Reset Form & Switch
    setNewGroupName('');
    setNewGroupCategory('trip');
    setNewGroupMemberIds([]);
    setGroupValidationError(null);
    setIsCreateGroupOpen(false);
    setActiveView({ type: 'group', id: newGroup.id });
    setIsMobileMenuOpen(false);
  };

  const handleAddFriend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFriendName.trim() || !newFriendEmail.trim() || !currentUser) return;

    const newFriend: User = {
      id: `user-${Date.now()}`,
      name: newFriendName.trim(),
      email: newFriendEmail.trim(),
      avatar: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 1000000)}?auto=format&fit=crop&w=150&h=150&q=80`,
    };

    saveUserToFirestore(newFriend);
    setUsers((prev) => {
      const updated = [...prev, newFriend];
      localStorage.setItem('splitwise_users', JSON.stringify(updated));
      return updated;
    });

    // Update currentUser's friendIds list
    const updatedUser: User = {
      ...currentUser,
      friendIds: Array.from(new Set([...(currentUser.friendIds || []), newFriend.id])),
    };
    setCurrentUser(updatedUser);
    localStorage.setItem('splitwise_user', JSON.stringify(updatedUser));
    saveUserToFirestore(updatedUser);

    // Record addition log
    const newAct: Activity = {
      id: `act-${Date.now()}`,
      type: 'friend_add',
      userId: currentUser.id,
      description: `added "${newFriend.name}" as a friend`,
      timestamp: new Date().toISOString(),
    };

    saveActivityToFirestore(newAct);
    setActivities((prev) => {
      const updated = [newAct, ...prev];
      localStorage.setItem('splitwise_activities', JSON.stringify(updated));
      return updated;
    });

    setNewFriendName('');
    setNewFriendEmail('');
    setIsAddFriendOpen(false);
    setActiveView({ type: 'friend', id: newFriend.id });
    setIsMobileMenuOpen(false);
  };

  const handleOpenEditExpense = (expense: Expense) => {
    setExpenseToEdit(expense);
    setExpenseModalGroupId(expense.groupId || null);
    setExpenseModalFriendId(null);
    setIsExpenseModalOpen(true);
  };

  const handleSaveExpense = (expenseData: Omit<Expense, 'id' | 'createdBy' | 'createdAt'> | Expense) => {
    if (!currentUser) return;

    if ('id' in expenseData && expenseData.id) {
      // EDIT EXISTING EXPENSE
      const updatedExpense = expenseData as Expense;
      updateExpenseInFirestore(updatedExpense);
      setExpenses((prev) => {
        const updated = prev.map((e) => (e.id === updatedExpense.id ? updatedExpense : e));
        localStorage.setItem('splitwise_expenses', JSON.stringify(updated));
        return updated;
      });

      let scopeText = 'outside of any group';
      if (updatedExpense.groupId) {
        const grp = groups.find((g) => g.id === updatedExpense.groupId);
        if (grp) scopeText = `in "${grp.name}"`;
      }

      const editAct: Activity = {
        id: `act-${Date.now()}`,
        type: 'expense_add',
        userId: currentUser.id,
        description: `updated "${updatedExpense.description}" (${formatAmount(updatedExpense.amount, currency)}) ${scopeText}`,
        timestamp: new Date().toISOString(),
      };

      saveActivityToFirestore(editAct);
      setActivities((prev) => {
        const updated = [editAct, ...prev];
        localStorage.setItem('splitwise_activities', JSON.stringify(updated));
        return updated;
      });
    } else {
      // CREATE NEW EXPENSE
      const newExpense: Expense = {
        ...(expenseData as Omit<Expense, 'id' | 'createdBy' | 'createdAt'>),
        id: `exp-${Date.now()}`,
        createdBy: currentUser.id,
        createdAt: new Date().toISOString(),
      };

      saveExpenseToFirestore(newExpense);
      setExpenses((prev) => {
        const updated = [...prev, newExpense];
        localStorage.setItem('splitwise_expenses', JSON.stringify(updated));
        return updated;
      });

      let scopeText = 'outside of any group';
      if (newExpense.groupId) {
        const grp = groups.find((g) => g.id === newExpense.groupId);
        if (grp) scopeText = `in "${grp.name}"`;
      }

      const newAct: Activity = {
        id: `act-${Date.now()}`,
        type: 'expense_add',
        userId: currentUser.id,
        description: `added "${newExpense.description}" (${formatAmount(newExpense.amount, currency)}) ${scopeText}`,
        timestamp: new Date().toISOString(),
      };

      saveActivityToFirestore(newAct);
      setActivities((prev) => {
        const updated = [newAct, ...prev];
        localStorage.setItem('splitwise_activities', JSON.stringify(updated));
        return updated;
      });
    }
  };

  const handleAddExpense = (expenseData: Omit<Expense, 'id' | 'createdBy' | 'createdAt'>) => {
    handleSaveExpense(expenseData);
  };

  const handleDeleteExpense = (expenseId: string) => {
    if (!currentUser) return;
    const target = expenses.find((e) => e.id === expenseId);
    if (!target) return;

    deleteExpenseFromFirestore(expenseId);
    setExpenses((prev) => {
      const updated = prev.filter((e) => e.id !== expenseId);
      localStorage.setItem('splitwise_expenses', JSON.stringify(updated));
      return updated;
    });

    // Record deletion log
    const newAct: Activity = {
      id: `act-${Date.now()}`,
      type: 'expense_delete',
      userId: currentUser.id,
      description: `deleted "${target.description}" (${formatAmount(target.amount, currency)})`,
      timestamp: new Date().toISOString(),
    };

    saveActivityToFirestore(newAct);
    setActivities((prev) => {
      const updated = [newAct, ...prev];
      localStorage.setItem('splitwise_activities', JSON.stringify(updated));
      return updated;
    });
  };

  const handleOpenSettleModal = (
    fromUserId: string,
    toUserId: string,
    amount: number,
    groupId: string | null
  ) => {
    const fromUser = users.find((u) => u.id === fromUserId) || null;
    const toUser = users.find((u) => u.id === toUserId) || null;
    setSettleModal({
      isOpen: true,
      fromUser,
      toUser,
      totalDebt: amount,
      groupId,
    });
  };

  const handleSettleDebt = (
    fromUserId: string,
    toUserId: string,
    amount: number,
    groupId: string | null
  ) => {
    if (!currentUser) return;

    // Create a specialized settlement expense record
    const settlementExpense: Expense = {
      id: `settle-${Date.now()}`,
      description: 'Settle Up Payment',
      amount,
      date: new Date().toISOString().split('T')[0],
      paidBy: fromUserId, // The person who owes pays
      groupId,
      splitMethod: 'equally',
      involvedUserIds: [fromUserId, toUserId],
      isSettlement: true,
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
      splits: [
        { userId: toUserId, amount }, // The recipient owes nothing, but represented as getting split back
      ],
    };

    saveExpenseToFirestore(settlementExpense);
    setExpenses((prev) => {
      const updated = [...prev, settlementExpense];
      localStorage.setItem('splitwise_expenses', JSON.stringify(updated));
      return updated;
    });

    // Activity description
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
    setActivities((prev) => {
      const updated = [newAct, ...prev];
      localStorage.setItem('splitwise_activities', JSON.stringify(updated));
      return updated;
    });
  };

  const handleSimulateAppUpdate = () => {
    setIsAppUpdateAvailable(true);
    setShowAppUpdateBanner(true);
    const updateAct: Activity = {
      id: `act-update-${Date.now()}`,
      type: 'app_update' as any,
      userId: currentUser?.id || 'user-alex',
      description: '🚀 Tabby System Update v1.2 installed: Added category pie charts, bar comparison, and fast contact search.',
      timestamp: new Date().toISOString(),
    };
    saveActivityToFirestore(updateAct);
    setActivities((prev) => [updateAct, ...prev]);
  };

  const toggleGroupMemberSelection = (userId: string) => {
    if (groupValidationError) setGroupValidationError(null);
    if (newGroupMemberIds.includes(userId)) {
      setNewGroupMemberIds(newGroupMemberIds.filter((id) => id !== userId));
    } else {
      setNewGroupMemberIds([...newGroupMemberIds, userId]);
    }
  };

  // User-scoped data selectors
  const myGroups = React.useMemo(() => {
    if (!currentUser) return [];
    return groups.filter((g) => g.members.includes(currentUser.id));
  }, [groups, currentUser]);

  const myGroupIds = React.useMemo(() => {
    return new Set(myGroups.map((g) => g.id));
  }, [myGroups]);

  const myFriends = React.useMemo(() => {
    if (!currentUser) return [];
    const friendIdSet = new Set(currentUser.friendIds || []);
    myGroups.forEach((g) => {
      g.members.forEach((mId) => {
        if (mId !== currentUser.id) friendIdSet.add(mId);
      });
    });
    return users.filter((u) => u.id !== currentUser.id && friendIdSet.has(u.id));
  }, [users, myGroups, currentUser]);

  const myExpenses = React.useMemo(() => {
    if (!currentUser) return [];
    return expenses.filter((e) => {
      if (e.groupId) {
        return myGroupIds.has(e.groupId);
      }
      return e.paidBy === currentUser.id || e.splits.some((s) => s.userId === currentUser.id);
    });
  }, [expenses, myGroupIds, currentUser]);

  const myActivities = React.useMemo(() => {
    if (!currentUser) return [];
    return activities.filter((act) => {
      if (act.type === 'app_update') return true;
      if (act.userId === currentUser.id) return true;
      return myGroups.some((g) => act.description.includes(g.name));
    });
  }, [activities, myGroups, currentUser]);

  const friendsList = myFriends;
  const activeGroup = activeView.type === 'group' ? groups.find((g) => g.id === activeView.id) : null;
  const activeFriend = activeView.type === 'friend' ? users.find((u) => u.id === activeView.id) : null;

  const filteredGroups = myGroups.filter((g) => {
    if (!sidebarSearchQuery.trim()) return true;
    return g.name.toLowerCase().includes(sidebarSearchQuery.toLowerCase().trim());
  });

  const filteredFriends = myFriends.filter((f) => {
    if (!sidebarSearchQuery.trim()) return true;
    const q = sidebarSearchQuery.toLowerCase().trim();
    return (
      f.name.toLowerCase().includes(q) ||
      (f.email && f.email.toLowerCase().includes(q)) ||
      (f.phone && f.phone.includes(q))
    );
  });

  // Render Login screen if not authenticated
  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-[#F8F5F2] flex flex-col font-sans text-[#2C2B29] antialiased" id="splitwise-app-root">
      
      {/* Top Persistent App Update Alert Banner */}
      {isAppUpdateAvailable && showAppUpdateBanner && (
        <div className="bg-[#3C5A48] text-white px-4 py-2.5 flex items-center justify-between text-xs font-semibold shadow-xs border-b border-[#2E4738] z-50 animate-fadeIn" id="app-update-alert-banner">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1 rounded-md bg-white/10 text-[#D9A05B] shrink-0">
              <Sparkles className="w-4 h-4 animate-bounce" />
            </div>
            <span className="truncate">
              <strong>Tabby Update v1.2 Available!</strong> New analytics charts, fast search, & real-time sync ready.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-1 bg-white hover:bg-[#EBF1ED] text-[#3C5A48] font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-2xs"
            >
              Update Now
            </button>
            <button
              type="button"
              onClick={() => setShowAppUpdateBanner(false)}
              className="p-1 text-white/80 hover:text-white transition-colors cursor-pointer"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Mobile Sticky Header Bar */}
      <header className="lg:hidden sticky top-0 z-40 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-[#E6E1DA] px-4 py-2.5 pt-safe flex items-center justify-between shadow-2xs" id="mobile-top-bar">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-xl text-[#736F6A] hover:bg-[#EBF1ED] hover:text-[#2C2B29] active:scale-95 transition-all cursor-pointer"
            type="button"
            id="mobile-menu-toggle-btn"
            aria-label="Open Menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          
          <button
            onClick={() => {
              setActiveView({ type: 'dashboard' });
              setIsMobileMenuOpen(false);
            }}
            type="button"
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <AppLogo size="sm" />
          </button>
        </div>

        {/* Right Header Actions on Mobile */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setActiveView({ type: 'notifications' });
              setIsMobileMenuOpen(false);
            }}
            className={`p-2 rounded-xl relative transition-all cursor-pointer ${
              activeView.type === 'notifications'
                ? 'bg-[#3C5A48] text-white'
                : 'text-[#736F6A] hover:bg-[#EBF1ED] hover:text-[#3C5A48]'
            }`}
            title="Notifications"
            type="button"
            id="mobile-header-bell"
          >
            <Bell className="w-4 h-4" />
            {activities.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-[#C86D51] absolute top-1.5 right-1.5 ring-2 ring-white" />
            )}
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1 rounded-full border border-[#E6E1DA] hover:ring-2 hover:ring-[#3C5A48]/30 transition-all cursor-pointer"
            type="button"
            title="Settings & Profile"
            id="mobile-header-profile"
          >
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="w-7 h-7 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          </button>
        </div>
      </header>

      <div className="flex-1 flex relative" id="layout-body-wrapper">
        
        {/* Navigation Sidebar Drawer (Pinned on Desktop, toggleable slide-out on Mobile) */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-72 sm:w-80 lg:w-64 border-r border-[#E6E1DA] bg-[#FAF8F5] flex flex-col p-5 shadow-xl lg:shadow-none lg:static transition-transform duration-300 lg:translate-x-0 pt-safe pb-safe ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
          id="navigation-sidebar"
        >
          {/* Brand Logo & Title on Desktop */}
          <div className="hidden lg:flex items-center pb-5 border-b border-[#E6E1DA]" id="desktop-brand-heading">
            <AppLogo size="md" />
          </div>

          {/* Active Logged-in User Profile Block */}
          <div className="flex items-center justify-between py-4 border-b border-[#E6E1DA] mt-2 lg:mt-0" id="sidebar-user-block">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-8 h-8 rounded-full object-cover border border-[#E6E1DA]"
                referrerPolicy="no-referrer"
              />
              <div className="min-w-0">
                <span className="text-xs font-bold text-[#2C2B29] block truncate">{currentUser.name}</span>
                <span className="text-[10px] text-[#736F6A] block truncate">{currentUser.email}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setActiveView({ type: 'notifications' });
                  setIsMobileMenuOpen(false);
                }}
                className={`p-1.5 rounded-lg relative transition-colors cursor-pointer ${
                  activeView.type === 'notifications'
                    ? 'bg-[#3C5A48] text-white'
                    : 'text-[#736F6A] hover:text-[#3C5A48] hover:bg-[#EBF1ED]'
                }`}
                title="Notifications & Updates"
                type="button"
                id="sidebar-notifications-btn"
              >
                <Bell className="w-4 h-4" />
                {activities.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-[#C86D51] absolute top-1 right-1 ring-2 ring-white" />
                )}
              </button>
              <button
                onClick={() => {
                  setIsSettingsOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="p-1.5 rounded-lg text-[#736F6A] hover:text-[#3C5A48] hover:bg-[#EBF1ED] transition-colors cursor-pointer"
                title="Settings & Preferences"
                type="button"
                id="settings-btn"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-[#736F6A]/60 hover:text-[#C86D51] hover:bg-[#FDF3F0] transition-colors cursor-pointer"
                title="Log Out Session"
                type="button"
                id="logout-btn"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Navigation Links Scroll Container */}
          <nav className="flex-1 overflow-y-auto py-3 flex flex-col gap-4 pr-1 no-scrollbar" id="sidebar-nav">
            
            {/* Core Views */}
            <div className="flex flex-col gap-1" id="core-views-nav">
              <button
                onClick={() => {
                  setActiveView({ type: 'dashboard' });
                  setIsMobileMenuOpen(false);
                }}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl font-semibold text-xs transition-all cursor-pointer ${activeView.type === 'dashboard' ? 'bg-[#EBF1ED] text-[#3C5A48]' : 'text-[#736F6A] hover:bg-[#EBF1ED]/50 hover:text-[#2C2B29]'}`}
                type="button"
                id="sidebar-nav-dashboard"
              >
                <Grid className="w-4 h-4" />
                Dashboard Overview
              </button>

              <button
                onClick={() => {
                  setActiveView({ type: 'notifications' });
                  setIsMobileMenuOpen(false);
                }}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl font-semibold text-xs transition-all cursor-pointer ${activeView.type === 'notifications' ? 'bg-[#3C5A48] text-white shadow-xs font-bold' : 'text-[#736F6A] hover:bg-[#EBF1ED]/50 hover:text-[#2C2B29]'}`}
                type="button"
                id="sidebar-nav-notifications"
              >
                <Bell className="w-4 h-4" />
                <span className="flex-1 text-left">Notifications</span>
                {activities.length > 0 && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                      activeView.type === 'notifications' ? 'bg-white text-[#3C5A48]' : 'bg-[#EBF1ED] text-[#3C5A48]'
                    }`}
                  >
                    {activities.length}
                  </span>
                )}
              </button>
            </div>

            {/* Sidebar Search Bar */}
            <div className="relative px-0.5" id="sidebar-search-wrapper">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#736F6A]" />
              <input
                type="text"
                value={sidebarSearchQuery}
                onChange={(e) => setSidebarSearchQuery(e.target.value)}
                placeholder="Search groups or friends..."
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-[#E6E1DA] rounded-xl text-xs text-[#2C2B29] placeholder-[#736F6A]/60 focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] transition-all shadow-2xs"
                id="sidebar-search-input"
              />
              {sidebarSearchQuery && (
                <button
                  type="button"
                  onClick={() => setSidebarSearchQuery('')}
                  className="absolute right-2.5 top-2 p-0.5 rounded-full text-[#736F6A] hover:bg-[#E6E1DA]/50 hover:text-[#2C2B29] transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Groups Menu Section */}
            <div className="flex flex-col gap-2" id="groups-menu-section">
              <div className="flex items-center justify-between px-3" id="groups-section-header">
                <span className="text-[10px] font-bold text-[#736F6A] uppercase tracking-wider">My Groups</span>
                <button
                  onClick={() => {
                    setIsCreateGroupOpen(true);
                    setIsMobileMenuOpen(false);
                  }}
                  className="p-1 rounded-md text-[#736F6A] hover:bg-[#EBF1ED] hover:text-[#3C5A48] transition-all cursor-pointer"
                  title="Create a New Group"
                  type="button"
                  id="add-group-btn"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>

              <div className="flex flex-col gap-1" id="groups-list">
                {filteredGroups.length === 0 ? (
                  <span className="text-[11px] text-[#736F6A] px-3 italic">
                    {sidebarSearchQuery ? 'No matching groups' : 'No groups yet'}
                  </span>
                ) : (
                  filteredGroups.map((group) => {
                    const isActive = activeView.type === 'group' && activeView.id === group.id;
                    return (
                      <button
                        key={group.id}
                        onClick={() => {
                          setActiveView({ type: 'group', id: group.id });
                          setIsMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-semibold transition-all truncate cursor-pointer ${isActive ? 'bg-[#EBF1ED] text-[#3C5A48] font-bold' : 'text-[#736F6A] hover:bg-[#EBF1ED]/50 hover:text-[#2C2B29]'}`}
                        type="button"
                        id={`sidebar-group-${group.id}`}
                      >
                        <span className="opacity-70">👥</span>
                        <span className="truncate flex-1">{group.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Friends Menu Section */}
            <div className="flex flex-col gap-2 animate-fadeIn" id="friends-menu-section">
              <div className="flex items-center justify-between px-3" id="friends-section-header">
                <span className="text-[10px] font-bold text-[#736F6A] uppercase tracking-wider">My Friends</span>
                <button
                  onClick={() => {
                    setIsAddFriendOpen(true);
                    setIsMobileMenuOpen(false);
                  }}
                  className="p-1 rounded-md text-[#736F6A] hover:bg-[#EBF1ED] hover:text-[#3C5A48] transition-all cursor-pointer"
                  title="Add Friend"
                  type="button"
                  id="add-friend-btn"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>

              <div className="flex flex-col gap-1" id="friends-list">
                {filteredFriends.length === 0 ? (
                  <span className="text-[11px] text-[#736F6A] px-3 italic">
                    {sidebarSearchQuery ? 'No matching friends' : 'No friends yet'}
                  </span>
                ) : (
                  filteredFriends.map((friend) => {
                    const isActive = activeView.type === 'friend' && activeView.id === friend.id;
                    return (
                      <button
                        key={friend.id}
                        onClick={() => {
                          setActiveView({ type: 'friend', id: friend.id });
                          setIsMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-left text-xs font-semibold transition-all cursor-pointer ${isActive ? 'bg-[#EBF1ED] text-[#3C5A48] font-bold' : 'text-[#736F6A] hover:bg-[#EBF1ED]/50 hover:text-[#2C2B29]'}`}
                        type="button"
                        id={`sidebar-friend-${friend.id}`}
                      >
                        <img
                          src={friend.avatar}
                          alt={friend.name}
                          className="w-5 h-5 rounded-full object-cover border border-[#E6E1DA]"
                          referrerPolicy="no-referrer"
                        />
                        <span className="truncate flex-1">{friend.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </nav>

          {/* Quick Creator Button - pinned bottom */}
          <div className="hidden lg:block pt-4 border-t border-[#E6E1DA]" id="desktop-quick-add">
            <button
              onClick={() => {
                setExpenseToEdit(null);
                setExpenseModalGroupId(null);
                setExpenseModalFriendId(null);
                setIsExpenseModalOpen(true);
              }}
              className="w-full py-2.5 px-4 bg-[#3C5A48] hover:bg-[#2E4738] text-white font-semibold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              type="button"
              id="add-expense-quick-btn"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              Add an Expense
            </button>
          </div>
        </aside>

        {/* Mobile menu overlay blur backdrop */}
        {isMobileMenuOpen && (
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 z-30 bg-[#2C2B29]/40 backdrop-blur-xs lg:hidden animate-fadeIn"
            id="mobile-drawer-backdrop"
          ></div>
        )}

        {/* Main Content Area - with bottom padding for mobile navigation bar */}
        <main className="flex-1 overflow-y-auto px-3.5 py-4 sm:px-6 sm:py-6 md:p-8 pb-24 lg:pb-8" id="main-content-panel">
          <div className="w-full max-w-5xl mx-auto flex flex-col gap-5 sm:gap-6" id="view-surface-container">
            {activeView.type === 'dashboard' && (
              <DashboardView
                currentUser={currentUser}
                allUsers={users}
                expenses={myExpenses}
                activities={myActivities}
                currency={currency}
                onSettleDebt={(fromId, toId, amt, gid) => handleOpenSettleModal(fromId, toId, amt, gid)}
                onNavigateToFriend={(fid) => setActiveView({ type: 'friend', id: fid })}
              />
            )}

            {activeView.type === 'group' && activeGroup && (
              <GroupView
                group={activeGroup}
                expenses={myExpenses}
                currentUser={currentUser}
                allUsers={users}
                currency={currency}
                onAddExpenseClick={(gid) => {
                  setExpenseToEdit(null);
                  setExpenseModalGroupId(gid);
                  setExpenseModalFriendId(null);
                  setIsExpenseModalOpen(true);
                }}
                onEditExpense={handleOpenEditExpense}
                onDeleteExpense={handleDeleteExpense}
                onSettleDebt={(fromId, toId, amt, gid) => handleOpenSettleModal(fromId, toId, amt, gid)}
              />
            )}

            {activeView.type === 'friend' && activeFriend && (
              <FriendView
                friend={activeFriend}
                expenses={myExpenses}
                groups={myGroups}
                currentUser={currentUser}
                allUsers={users}
                currency={currency}
                onAddExpenseClick={(gid, fid) => {
                  setExpenseToEdit(null);
                  setExpenseModalGroupId(null);
                  setExpenseModalFriendId(fid);
                  setIsExpenseModalOpen(true);
                }}
                onEditExpense={handleOpenEditExpense}
                onDeleteExpense={handleDeleteExpense}
                onSettleDebt={(fromId, toId, amt, gid) => handleOpenSettleModal(fromId, toId, amt, gid)}
              />
            )}

            {activeView.type === 'notifications' && (
              <NotificationsView
                currentUser={currentUser}
                allUsers={users}
                activities={myActivities}
                onNavigateToGroup={(gid) => setActiveView({ type: 'group', id: gid })}
                onNavigateToFriend={(fid) => setActiveView({ type: 'friend', id: fid })}
                onSimulateAppUpdate={handleSimulateAppUpdate}
              />
            )}
          </div>
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E6E1DA] px-3 pt-2 pb-[max(env(safe-area-inset-bottom,0px),0.5rem)] shadow-lg flex items-center justify-around"
        id="mobile-bottom-nav"
      >
        <button
          onClick={() => {
            setActiveView({ type: 'dashboard' });
            setIsMobileMenuOpen(false);
          }}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all cursor-pointer ${
            activeView.type === 'dashboard'
              ? 'text-[#3C5A48] font-bold'
              : 'text-[#736F6A] hover:text-[#2C2B29]'
          }`}
          type="button"
          id="mobile-nav-dashboard"
        >
          <div className={`p-1 rounded-lg ${activeView.type === 'dashboard' ? 'bg-[#EBF1ED]' : ''}`}>
            <Grid className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight">Dashboard</span>
        </button>

        <button
          onClick={() => {
            if (activeView.type === 'group') {
              setIsMobileMenuOpen(true);
            } else if (myGroups.length > 0) {
              setActiveView({ type: 'group', id: myGroups[0].id });
            } else {
              setIsCreateGroupOpen(true);
            }
          }}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all cursor-pointer ${
            activeView.type === 'group'
              ? 'text-[#3C5A48] font-bold'
              : 'text-[#736F6A] hover:text-[#2C2B29]'
          }`}
          type="button"
          id="mobile-nav-groups"
        >
          <div className={`p-1 rounded-lg relative ${activeView.type === 'group' ? 'bg-[#EBF1ED]' : ''}`}>
            <Users className="w-5 h-5" />
            {myGroups.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#3C5A48] absolute top-1 right-1" />
            )}
          </div>
          <span className="text-[10px] tracking-tight">Groups</span>
        </button>

        {/* Big Central Elevated Add Button */}
        <div className="-mt-6 flex flex-col items-center">
          <button
            onClick={() => {
              setExpenseToEdit(null);
              setExpenseModalGroupId(activeView.type === 'group' ? activeView.id : null);
              setExpenseModalFriendId(activeView.type === 'friend' ? activeView.id : null);
              setIsExpenseModalOpen(true);
            }}
            className="w-12 h-12 rounded-full bg-[#3C5A48] hover:bg-[#2E4738] active:scale-95 text-white flex items-center justify-center shadow-lg border-2 border-white transition-all cursor-pointer"
            type="button"
            id="mobile-nav-add-btn"
            title="Add Expense"
          >
            <Plus className="w-6 h-6 stroke-[3]" />
          </button>
          <span className="text-[10px] font-bold text-[#3C5A48] mt-0.5">Add</span>
        </div>

        <button
          onClick={() => {
            if (activeView.type === 'friend') {
              setIsMobileMenuOpen(true);
            } else if (myFriends.length > 0) {
              setActiveView({ type: 'friend', id: myFriends[0].id });
            } else {
              setIsAddFriendOpen(true);
            }
          }}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all cursor-pointer ${
            activeView.type === 'friend'
              ? 'text-[#3C5A48] font-bold'
              : 'text-[#736F6A] hover:text-[#2C2B29]'
          }`}
          type="button"
          id="mobile-nav-friends"
        >
          <div className={`p-1 rounded-lg relative ${activeView.type === 'friend' ? 'bg-[#EBF1ED]' : ''}`}>
            <UserPlus className="w-5 h-5" />
            {myFriends.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#3C5A48] absolute top-1 right-1" />
            )}
          </div>
          <span className="text-[10px] tracking-tight">Friends</span>
        </button>

        <button
          onClick={() => {
            setActiveView({ type: 'notifications' });
            setIsMobileMenuOpen(false);
          }}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all cursor-pointer ${
            activeView.type === 'notifications'
              ? 'text-[#3C5A48] font-bold'
              : 'text-[#736F6A] hover:text-[#2C2B29]'
          }`}
          type="button"
          id="mobile-nav-activity"
        >
          <div className={`p-1 rounded-lg relative ${activeView.type === 'notifications' ? 'bg-[#3C5A48] text-white' : ''}`}>
            <Bell className="w-5 h-5" />
            {activities.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-[#C86D51] absolute top-0.5 right-0.5 ring-2 ring-white" />
            )}
          </div>
          <span className="text-[10px] tracking-tight">Activity</span>
        </button>
      </nav>

      {/* MODAL 1: Expense Creator Form Modal */}
      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => {
          setIsExpenseModalOpen(false);
          setExpenseToEdit(null);
        }}
        currentUser={currentUser}
        friends={myFriends}
        groups={myGroups}
        allUsers={users}
        currency={currency}
        existingExpense={expenseToEdit}
        onSaveExpense={handleSaveExpense}
        onAddExpense={handleAddExpense}
        initialGroupId={expenseModalGroupId}
        initialFriendId={expenseModalFriendId}
      />

      {/* MODAL 2: Create Group Modal (Responsive Bottom Sheet on Mobile) */}
      {isCreateGroupOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#2C2B29]/40 backdrop-blur-xs animate-fadeIn" id="create-group-backdrop">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl border border-[#E6E1DA] shadow-xl max-w-md w-full flex flex-col max-h-[92vh] animate-sheet-up sm:animate-none overflow-hidden" id="create-group-modal">
            {/* Mobile Drag Indicator */}
            <div className="sm:hidden pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-[#E6E1DA]" />
            </div>

            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#E6E1DA]" id="create-group-header">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#3C5A48] flex items-center justify-center text-white">
                  <Users className="w-4 h-4" />
                </div>
                <h2 className="text-base font-bold text-[#2C2B29]">Create a Group</h2>
              </div>
              <button
                onClick={() => {
                  setIsCreateGroupOpen(false);
                  setGroupValidationError(null);
                }}
                className="p-1 rounded-lg text-[#736F6A] hover:bg-[#F8F5F2] hover:text-[#2C2B29] transition-colors cursor-pointer"
                type="button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} noValidate className="p-4 sm:p-5 flex flex-col gap-4 overflow-y-auto">
              {/* Validation Feedback Banner */}
              {groupValidationError && (
                <div className="p-3 bg-[#FDF3F0] border border-[#C86D51]/40 rounded-xl text-xs text-[#C86D51] font-semibold flex items-start gap-2.5 shadow-2xs animate-fadeIn" id="group-validation-error-banner">
                  <AlertCircle className="w-4 h-4 text-[#C86D51] flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="block font-bold">Unable to create group</span>
                    <span className="font-normal text-[11px] text-[#A64B32]">{groupValidationError}</span>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5" id="group-form-name">
                <div className="flex items-center justify-between">
                  <label htmlFor="new-group-name" className="text-xs font-bold text-[#2C2B29]">
                    Group Name <span className="text-[#C86D51]">*</span>
                  </label>
                  {groupValidationError && !newGroupName.trim() && (
                    <span className="text-[10px] font-bold text-[#C86D51]">Name required</span>
                  )}
                </div>
                <input
                  id="new-group-name"
                  type="text"
                  placeholder="e.g. Ski Trip 2026, Flatmates, Roadtrip"
                  value={newGroupName}
                  onChange={(e) => {
                    setNewGroupName(e.target.value);
                    if (groupValidationError) setGroupValidationError(null);
                  }}
                  className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none transition-colors text-[#2C2B29] ${
                    groupValidationError && !newGroupName.trim()
                      ? 'border-[#C86D51] bg-[#FDF3F0]/40 focus:ring-1 focus:ring-[#C86D51]'
                      : 'border-[#E6E1DA] bg-[#FAF8F5]/30 focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48]'
                  }`}
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1.5" id="group-form-category">
                <label htmlFor="new-group-category" className="text-xs font-bold text-[#2C2B29]">Category</label>
                <select
                  id="new-group-category"
                  value={newGroupCategory}
                  onChange={(e) => setNewGroupCategory(e.target.value as GroupCategory)}
                  className="w-full px-3 py-2.5 border border-[#E6E1DA] rounded-xl text-sm bg-white focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] transition-colors text-[#2C2B29]"
                >
                  <option value="trip">Trip / Vacation</option>
                  <option value="home">Apartment / House</option>
                  <option value="couple">Couple / Relationship</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="flex flex-col gap-2 mt-1" id="group-form-members">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#2C2B29]">
                    Select Members <span className="text-[#C86D51]">*</span>
                  </label>
                  <span className={`text-[10px] font-semibold ${newGroupMemberIds.length === 0 && groupValidationError ? 'text-[#C86D51] font-bold' : 'text-[#736F6A]'}`}>
                    {newGroupMemberIds.length} member{newGroupMemberIds.length !== 1 ? 's' : ''} selected
                  </span>
                </div>

                <div className={`border rounded-xl bg-[#F8F5F2]/50 p-2.5 max-h-[160px] overflow-y-auto flex flex-col gap-2 transition-colors ${
                  groupValidationError && newGroupMemberIds.length === 0
                    ? 'border-[#C86D51] bg-[#FDF3F0]/20'
                    : 'border-[#E6E1DA]'
                }`}>
                  {friendsList.length === 0 ? (
                    <div className="flex flex-col gap-1 text-center py-2">
                      <span className="text-xs text-[#736F6A] font-medium">No friends available to add.</span>
                      <span className="text-[11px] text-[#3C5A48] font-bold">Use "Add Friend" first!</span>
                    </div>
                  ) : (
                    friendsList.map((friend) => {
                      const isSelected = newGroupMemberIds.includes(friend.id);
                      return (
                        <button
                          key={friend.id}
                          type="button"
                          onClick={() => toggleGroupMemberSelection(friend.id)}
                          className={`flex items-center justify-between p-2 rounded-lg text-left transition-colors bg-white border cursor-pointer ${
                            isSelected
                              ? 'border-[#3C5A48] bg-[#EBF1ED]/50 shadow-2xs'
                              : 'border-[#E6E1DA] hover:bg-[#F8F5F2]'
                          }`}
                          id={`select-member-${friend.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <img
                              src={friend.avatar}
                              alt={friend.name}
                              className="w-6 h-6 rounded-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <span className="text-xs font-semibold text-[#2C2B29]">{friend.name}</span>
                          </div>
                          <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors border ${
                            isSelected
                              ? 'bg-[#3C5A48] border-[#3C5A48] text-white'
                              : 'border-[#E6E1DA] bg-white'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-[#E6E1DA] pb-safe" id="group-form-actions">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateGroupOpen(false);
                    setGroupValidationError(null);
                  }}
                  className="px-4 py-2.5 border border-[#E6E1DA] hover:bg-[#F8F5F2] text-[#2C2B29] font-medium text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-[#3C5A48] hover:bg-[#2E4738] text-white font-semibold text-xs rounded-xl transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Add Friend Modal */}
      <AddFriendModal
        isOpen={isAddFriendOpen}
        onClose={() => setIsAddFriendOpen(false)}
        currentUser={currentUser}
        allUsers={users}
        friendsList={friendsList}
        onAddFriend={(friendName, friendEmail) => {
          setNewFriendName(friendName);
          setNewFriendEmail(friendEmail);
          const newFriend: User = {
            id: `usr-${Date.now()}`,
            name: friendName,
            email: friendEmail,
            avatar: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`,
          };
          setUsers((prev) => {
            const updated = [...prev, newFriend];
            localStorage.setItem('splitwise_users', JSON.stringify(updated));
            return updated;
          });
          setActivities((prev) => [
            {
              id: `act-${Date.now()}`,
              type: 'friend_add',
              userId: currentUser.id,
              description: `added ${friendName} as a friend`,
              timestamp: new Date().toISOString(),
            },
            ...prev,
          ]);
        }}
      />

      {/* MODAL 4: Settings & Preferences Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentUser={currentUser}
        currency={currency}
        onCurrencyChange={handleCurrencyChange}
        onUpdateProfile={handleUpdateProfile}
        onResetData={handleResetData}
      />

      {/* MODAL 5: Settle Up Debt Modal */}
      <SettleUpModal
        isOpen={settleModal.isOpen}
        onClose={() =>
          setSettleModal((prev) => ({
            ...prev,
            isOpen: false,
          }))
        }
        fromUser={settleModal.fromUser}
        toUser={settleModal.toUser}
        totalDebt={settleModal.totalDebt}
        groupId={settleModal.groupId}
        groups={groups}
        allUsers={users}
        currency={currency}
        onSettleDebt={handleSettleDebt}
      />

    </div>
  );
}
