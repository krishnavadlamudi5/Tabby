import React, { useState, useEffect, useMemo } from 'react';
import Login from './components/Login';
import DashboardView from './components/DashboardView';
import GroupView from './components/GroupView';
import FriendView from './components/FriendView';
import NotificationsView from './components/NotificationsView';

// Modals
import ExpenseModal from './components/ExpenseModal';
import SettingsModal from './components/SettingsModal';
import SettleUpModal from './components/SettleUpModal';
import AddFriendModal from './components/AddFriendModal';
import CreateGroupModal from './components/CreateGroupModal';

// Layout
import Sidebar from './components/layout/Sidebar';
import MobileHeader from './components/layout/MobileHeader';

// Icons & UI
import { Grid, Users, UserPlus, Bell, Plus, Sparkles, X, Download, RefreshCw } from 'lucide-react';
import { useAppStore } from './store/useAppStore';
import { User, Expense } from './types';
import { SplashScreen } from '@capacitor/splash-screen';
import { useLiveUpdate } from './hooks/useLiveUpdate';

export default function App() {
  const {
    currentUser,
    users,
    groups,
    expenses,
    activities,
    currency,
    initStore,
    login,
    syncWithBackend,
    setCurrentUser,
    setUsers,
    setGroups,
    setExpenses,
    setActivities,
    setCurrency,
    updateProfile,
    resetData,
    addFriend,
    saveExpense,
    deleteExpense,
    settleDebt,
    simulateAppUpdate
  } = useAppStore();

  // Navigation State
  const [activeView, setActiveView] = useState<
    { type: 'dashboard' } | 
    { type: 'group'; id: string } | 
    { type: 'friend'; id: string } |
    { type: 'notifications' }
  >({ type: 'dashboard' });

  // UI States
  const [isAppUpdateAvailable, setIsAppUpdateAvailable] = useState(false);
  const [showAppUpdateBanner, setShowAppUpdateBanner] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Live OTA Updates
  const {
    isUpdateAvailable: isLiveUpdateAvailable,
    isDownloading: isLiveDownloading,
    downloadProgress: liveDownloadProgress,
    latestVersion: liveLatestVersion,
    showBanner: showLiveBanner,
    applyUpdate: applyLiveUpdate,
    dismissUpdate: dismissLiveUpdate,
  } = useLiveUpdate();

  // Modal States
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseModalGroupId, setExpenseModalGroupId] = useState<string | null>(null);
  const [expenseModalFriendId, setExpenseModalFriendId] = useState<string | null>(null);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);

  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isAddFriendOpen, setIsAddFriendOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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

  // Load from local storage and dismiss native splash screen
  useEffect(() => {
    try {
      initStore();
      // Smoothly hide native splash once app is ready
      SplashScreen.hide().catch(() => {});
    } catch (e) {
      console.error('Failed to initialize app state', e);
    }
  }, []);

  // MongoDB Data Sync
  useEffect(() => {
    if (!currentUser?.id) return;
    syncWithBackend(currentUser.id);

    const interval = setInterval(() => {
      syncWithBackend(currentUser.id);
    }, 15000);

    return () => clearInterval(interval);
  }, [currentUser?.id]);

  // Selectors
  const myGroups = useMemo(() => {
    if (!currentUser) return [];
    return groups.filter((g) => g.members.includes(currentUser.id));
  }, [groups, currentUser]);

  const myGroupIds = useMemo(() => new Set(myGroups.map((g) => g.id)), [myGroups]);

  const myFriends = useMemo(() => {
    if (!currentUser) return [];
    const friendIdSet = new Set(currentUser.friendIds || []);
    myGroups.forEach((g) => {
      g.members.forEach((mId) => {
        if (mId !== currentUser.id) friendIdSet.add(mId);
      });
    });
    return users.filter((u) => u.id !== currentUser.id && friendIdSet.has(u.id));
  }, [users, myGroups, currentUser]);

  const myExpenses = useMemo(() => {
    if (!currentUser) return [];
    return expenses.filter((e) => {
      if (e.groupId) return myGroupIds.has(e.groupId);
      return e.paidBy === currentUser.id || e.splits.some((s) => s.userId === currentUser.id);
    });
  }, [expenses, myGroupIds, currentUser]);

  const myActivities = useMemo(() => {
    if (!currentUser) return [];
    return activities.filter((act) => {
      if (act.type === 'app_update') return true;
      if (act.userId === currentUser.id) return true;
      return myGroups.some((g) => act.description.includes(g.name));
    });
  }, [activities, myGroups, currentUser]);

  const activeGroup = activeView.type === 'group' ? groups.find((g) => g.id === activeView.id) : null;
  const activeFriend = activeView.type === 'friend' ? users.find((u) => u.id === activeView.id) : null;

  const handleOpenEditExpense = (expense: Expense) => {
    setExpenseToEdit(expense);
    setExpenseModalGroupId(expense.groupId || null);
    setExpenseModalFriendId(null);
    setIsExpenseModalOpen(true);
  };

  const handleOpenSettleModal = (fromUserId: string, toUserId: string, amount: number, groupId: string | null) => {
    const fromUser = users.find((u) => u.id === fromUserId) || null;
    const toUser = users.find((u) => u.id === toUserId) || null;
    setSettleModal({ isOpen: true, fromUser, toUser, totalDebt: amount, groupId });
  };

  if (!currentUser) {
    return (
      <>
        {(showLiveBanner || (isAppUpdateAvailable && showAppUpdateBanner)) && (
          <div className="bg-[#3C5A48] text-white px-4 py-2.5 flex items-center justify-between text-xs font-semibold shadow-xs border-b border-[#2E4738] z-50 animate-fadeIn sticky top-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1 rounded-md bg-white/10 text-[#D9A05B] shrink-0">
                {isLiveDownloading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <Sparkles className="w-4 h-4 animate-bounce" />
                )}
              </div>
              <span className="truncate">
                {isLiveDownloading ? (
                  <span><strong>Downloading Update {liveLatestVersion || ''}...</strong> ({liveDownloadProgress}%) Reloading soon</span>
                ) : (
                  <span><strong>Tabby Update {liveLatestVersion ? `${liveLatestVersion} ` : ''}Available!</strong> Click to update in-app.</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  if (isLiveUpdateAvailable) {
                    applyLiveUpdate();
                  } else {
                    window.location.reload();
                  }
                }}
                disabled={isLiveDownloading}
                className="px-3 py-1 bg-white hover:bg-[#EBF1ED] disabled:opacity-50 text-[#3C5A48] font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
              >
                {isLiveDownloading ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Update Now
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  dismissLiveUpdate();
                  setShowAppUpdateBanner(false);
                }}
                className="p-1 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        <Login onLogin={login} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F5F2] flex flex-col font-sans text-[#2C2B29] antialiased" id="splitwise-app-root">
      
      {(showLiveBanner || (isAppUpdateAvailable && showAppUpdateBanner)) && (
        <div className="bg-[#3C5A48] text-white px-4 py-2.5 flex items-center justify-between text-xs font-semibold shadow-xs border-b border-[#2E4738] z-50 animate-fadeIn">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1 rounded-md bg-white/10 text-[#D9A05B] shrink-0">
              {isLiveDownloading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Sparkles className="w-4 h-4 animate-bounce" />
              )}
            </div>
            <span className="truncate">
              {isLiveDownloading ? (
                <span><strong>Downloading Update {liveLatestVersion || ''}...</strong> ({liveDownloadProgress}%) Reloading soon</span>
              ) : (
                <span><strong>Tabby Update {liveLatestVersion ? `${liveLatestVersion} ` : ''}Available!</strong> Click to update & reload with the latest features.</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                if (isLiveUpdateAvailable) {
                  applyLiveUpdate();
                } else {
                  window.location.reload();
                }
              }}
              disabled={isLiveDownloading}
              className="px-3 py-1 bg-white hover:bg-[#EBF1ED] disabled:opacity-50 text-[#3C5A48] font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
            >
              {isLiveDownloading ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Update Now
                </>
              )}
            </button>
            <button
              onClick={() => {
                dismissLiveUpdate();
                setShowAppUpdateBanner(false);
              }}
              className="p-1 text-white/80 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <MobileHeader 
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        activeView={activeView}
        setActiveView={setActiveView}
        setIsSettingsOpen={setIsSettingsOpen}
      />

      <div className="flex-1 flex relative">
        <Sidebar 
          isMobileMenuOpen={isMobileMenuOpen}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
          activeView={activeView}
          setActiveView={setActiveView}
          setIsCreateGroupOpen={setIsCreateGroupOpen}
          setIsAddFriendOpen={setIsAddFriendOpen}
          setIsSettingsOpen={setIsSettingsOpen}
        />

        {isMobileMenuOpen && (
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 z-30 bg-[#2C2B29]/40 backdrop-blur-xs lg:hidden animate-fadeIn"
          />
        )}

        <main className="flex-1 overflow-y-auto px-3.5 py-4 sm:px-6 sm:py-6 md:p-8 pb-24 lg:pb-8">
          <div className="w-full max-w-5xl mx-auto flex flex-col gap-5 sm:gap-6">
            {activeView.type === 'dashboard' && (
              <DashboardView
                currentUser={currentUser}
                allUsers={users}
                expenses={myExpenses}
                activities={myActivities}
                currency={currency}
                onSettleDebt={handleOpenSettleModal}
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
                onDeleteExpense={deleteExpense}
                onSettleDebt={handleOpenSettleModal}
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
                onDeleteExpense={deleteExpense}
                onSettleDebt={handleOpenSettleModal}
              />
            )}

            {activeView.type === 'notifications' && (
              <NotificationsView
                currentUser={currentUser}
                allUsers={users}
                activities={myActivities}
                onNavigateToGroup={(gid) => setActiveView({ type: 'group', id: gid })}
                onNavigateToFriend={(fid) => setActiveView({ type: 'friend', id: fid })}
                onSimulateAppUpdate={() => {
                  simulateAppUpdate();
                  setIsAppUpdateAvailable(true);
                  setShowAppUpdateBanner(true);
                }}
                onApplyLiveUpdate={applyLiveUpdate}
                isDownloadingUpdate={isLiveDownloading}
                liveLatestVersion={liveLatestVersion}
              />
            )}
          </div>
        </main>
      </div>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E6E1DA] px-3 pt-2 pb-[max(env(safe-area-inset-bottom,0px),0.5rem)] shadow-lg flex items-center justify-around">
        <button
          onClick={() => { setActiveView({ type: 'dashboard' }); setIsMobileMenuOpen(false); }}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all cursor-pointer ${activeView.type === 'dashboard' ? 'text-[#3C5A48] font-bold' : 'text-[#736F6A] hover:text-[#2C2B29]'}`}
        >
          <div className={`p-1 rounded-lg ${activeView.type === 'dashboard' ? 'bg-[#EBF1ED]' : ''}`}><Grid className="w-5 h-5" /></div>
          <span className="text-[10px] tracking-tight">Dashboard</span>
        </button>

        <button
          onClick={() => {
            if (activeView.type === 'group') setIsMobileMenuOpen(true);
            else if (myGroups.length > 0) setActiveView({ type: 'group', id: myGroups[0].id });
            else setIsCreateGroupOpen(true);
          }}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all cursor-pointer ${activeView.type === 'group' ? 'text-[#3C5A48] font-bold' : 'text-[#736F6A] hover:text-[#2C2B29]'}`}
        >
          <div className={`p-1 rounded-lg relative ${activeView.type === 'group' ? 'bg-[#EBF1ED]' : ''}`}>
            <Users className="w-5 h-5" />
            {myGroups.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#3C5A48] absolute top-1 right-1" />}
          </div>
          <span className="text-[10px] tracking-tight">Groups</span>
        </button>

        <div className="-mt-6 flex flex-col items-center">
          <button
            onClick={() => {
              setExpenseToEdit(null);
              setExpenseModalGroupId(activeView.type === 'group' ? activeView.id : null);
              setExpenseModalFriendId(activeView.type === 'friend' ? activeView.id : null);
              setIsExpenseModalOpen(true);
            }}
            className="w-12 h-12 rounded-full bg-[#3C5A48] hover:bg-[#2E4738] active:scale-95 text-white flex items-center justify-center shadow-lg border-2 border-white transition-all cursor-pointer"
          >
            <Plus className="w-6 h-6 stroke-[3]" />
          </button>
          <span className="text-[10px] font-bold text-[#3C5A48] mt-0.5">Add</span>
        </div>

        <button
          onClick={() => {
            if (activeView.type === 'friend') setIsMobileMenuOpen(true);
            else if (myFriends.length > 0) setActiveView({ type: 'friend', id: myFriends[0].id });
            else setIsAddFriendOpen(true);
          }}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all cursor-pointer ${activeView.type === 'friend' ? 'text-[#3C5A48] font-bold' : 'text-[#736F6A] hover:text-[#2C2B29]'}`}
        >
          <div className={`p-1 rounded-lg relative ${activeView.type === 'friend' ? 'bg-[#EBF1ED]' : ''}`}>
            <UserPlus className="w-5 h-5" />
            {myFriends.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#3C5A48] absolute top-1 right-1" />}
          </div>
          <span className="text-[10px] tracking-tight">Friends</span>
        </button>

        <button
          onClick={() => { setActiveView({ type: 'notifications' }); setIsMobileMenuOpen(false); }}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all cursor-pointer ${activeView.type === 'notifications' ? 'text-[#3C5A48] font-bold' : 'text-[#736F6A] hover:text-[#2C2B29]'}`}
        >
          <div className={`p-1 rounded-lg relative ${activeView.type === 'notifications' ? 'bg-[#3C5A48] text-white' : ''}`}>
            <Bell className="w-5 h-5" />
            {activities.length > 0 && <span className="w-2 h-2 rounded-full bg-[#C86D51] absolute top-0.5 right-0.5 ring-2 ring-white" />}
          </div>
          <span className="text-[10px] tracking-tight">Activity</span>
        </button>
      </nav>

      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => { setIsExpenseModalOpen(false); setExpenseToEdit(null); }}
        currentUser={currentUser}
        friends={myFriends}
        groups={myGroups}
        allUsers={users}
        currency={currency}
        existingExpense={expenseToEdit}
        onSaveExpense={saveExpense}
        onAddExpense={saveExpense}
        initialGroupId={expenseModalGroupId}
        initialFriendId={expenseModalFriendId}
      />

      <CreateGroupModal
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        onGroupCreated={(gid) => setActiveView({ type: 'group', id: gid })}
      />

      <AddFriendModal
        isOpen={isAddFriendOpen}
        onClose={() => setIsAddFriendOpen(false)}
        currentUser={currentUser}
        allUsers={users}
        friendsList={myFriends}
        onAddFriend={addFriend}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentUser={currentUser}
        currency={currency}
        onCurrencyChange={setCurrency}
        onUpdateProfile={updateProfile}
        onResetData={resetData}
        expenses={myExpenses}
        groups={myGroups}
        allUsers={users}
      />

      <SettleUpModal
        isOpen={settleModal.isOpen}
        onClose={() => setSettleModal(prev => ({ ...prev, isOpen: false }))}
        fromUser={settleModal.fromUser}
        toUser={settleModal.toUser}
        totalDebt={settleModal.totalDebt}
        groupId={settleModal.groupId}
        groups={groups}
        allUsers={users}
        currency={currency}
        onSettleDebt={settleDebt}
      />
    </div>
  );
}
