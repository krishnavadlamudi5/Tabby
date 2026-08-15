import React, { useState, useMemo } from 'react';
import { LogOut, Grid, Bell, Settings, Search, X, Plus, UserPlus } from 'lucide-react';
import AppLogo from '../AppLogo';
import { useAppStore } from '../../store/useAppStore';

interface SidebarProps {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  activeView: any;
  setActiveView: (view: any) => void;
  setIsCreateGroupOpen: (open: boolean) => void;
  setIsAddFriendOpen: (open: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
}

export default function Sidebar({
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  activeView,
  setActiveView,
  setIsCreateGroupOpen,
  setIsAddFriendOpen,
  setIsSettingsOpen
}: SidebarProps) {
  const currentUser = useAppStore(state => state.currentUser);
  const groups = useAppStore(state => state.groups);
  const users = useAppStore(state => state.users);
  const activities = useAppStore(state => state.activities);
  const logout = useAppStore(state => state.logout);

  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');

  const myGroups = useMemo(() => {
    if (!currentUser) return [];
    return groups.filter((g) => g.members.includes(currentUser.id));
  }, [groups, currentUser]);

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
      (f.phone && f.phone?.includes(q))
    );
  });

  if (!currentUser) return null;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-72 sm:w-80 lg:w-64 border-r border-[#E6E1DA] bg-[#FAF8F5] flex flex-col p-5 shadow-xl lg:shadow-none lg:static transition-transform duration-300 lg:translate-x-0 pt-safe pb-safe ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className="hidden lg:flex items-center pb-5 border-b border-[#E6E1DA]">
        <AppLogo size="md" />
      </div>

      <div className="flex items-center justify-between py-4 border-b border-[#E6E1DA] mt-2 lg:mt-0">
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
            title="Notifications"
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
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => logout()}
            className="p-1.5 rounded-lg text-[#736F6A]/60 hover:text-[#C86D51] hover:bg-[#FDF3F0] transition-colors cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 flex flex-col gap-4 pr-1 no-scrollbar">
        <div className="flex flex-col gap-1">
          <button
            onClick={() => {
              setActiveView({ type: 'dashboard' });
              setIsMobileMenuOpen(false);
            }}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl font-semibold text-xs transition-all cursor-pointer ${activeView.type === 'dashboard' ? 'bg-[#EBF1ED] text-[#3C5A48]' : 'text-[#736F6A] hover:bg-[#EBF1ED]/50 hover:text-[#2C2B29]'}`}
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
          >
            <Bell className="w-4 h-4" />
            <span className="flex-1 text-left">Notifications</span>
            {activities.length > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeView.type === 'notifications' ? 'bg-white text-[#3C5A48]' : 'bg-[#EBF1ED] text-[#3C5A48]'}`}>
                {activities.length}
              </span>
            )}
          </button>
        </div>

        <div className="relative px-0.5">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#736F6A]" />
          <input
            type="text"
            value={sidebarSearchQuery}
            onChange={(e) => setSidebarSearchQuery(e.target.value)}
            placeholder="Search groups or friends..."
            className="w-full pl-8 pr-7 py-1.5 bg-white border border-[#E6E1DA] rounded-xl text-xs text-[#2C2B29] placeholder-[#736F6A]/60 focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] transition-all shadow-2xs"
          />
          {sidebarSearchQuery && (
            <button
              onClick={() => setSidebarSearchQuery('')}
              className="absolute right-2.5 top-2 p-0.5 rounded-full text-[#736F6A] hover:bg-[#E6E1DA]/50 hover:text-[#2C2B29] transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-3">
            <span className="text-[10px] font-bold text-[#736F6A] uppercase tracking-wider">My Groups</span>
            <button
              onClick={() => { setIsCreateGroupOpen(true); setIsMobileMenuOpen(false); }}
              className="p-1 rounded-md text-[#736F6A] hover:bg-[#EBF1ED] hover:text-[#3C5A48] transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>

          <div className="flex flex-col gap-1">
            {filteredGroups.length === 0 ? (
              <span className="text-[11px] text-[#736F6A] px-3 italic">{sidebarSearchQuery ? 'No matching groups' : 'No groups yet'}</span>
            ) : (
              filteredGroups.map((group) => {
                const isActive = activeView.type === 'group' && activeView.id === group.id;
                return (
                  <button
                    key={group.id}
                    onClick={() => { setActiveView({ type: 'group', id: group.id }); setIsMobileMenuOpen(false); }}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-semibold transition-all truncate cursor-pointer ${isActive ? 'bg-[#EBF1ED] text-[#3C5A48] font-bold' : 'text-[#736F6A] hover:bg-[#EBF1ED]/50 hover:text-[#2C2B29]'}`}
                  >
                    <span className="opacity-70">👥</span>
                    <span className="truncate flex-1">{group.name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-3">
            <span className="text-[10px] font-bold text-[#736F6A] uppercase tracking-wider">My Friends</span>
            <button
              onClick={() => { setIsAddFriendOpen(true); setIsMobileMenuOpen(false); }}
              className="p-1 rounded-md text-[#736F6A] hover:bg-[#EBF1ED] hover:text-[#3C5A48] transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>

          <div className="flex flex-col gap-1">
            {filteredFriends.length === 0 ? (
              <span className="text-[11px] text-[#736F6A] px-3 italic">{sidebarSearchQuery ? 'No matching friends' : 'No friends yet'}</span>
            ) : (
              filteredFriends.map((friend) => {
                const isActive = activeView.type === 'friend' && activeView.id === friend.id;
                return (
                  <button
                    key={friend.id}
                    onClick={() => { setActiveView({ type: 'friend', id: friend.id }); setIsMobileMenuOpen(false); }}
                    className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-left text-xs font-semibold transition-all truncate cursor-pointer ${isActive ? 'bg-[#EBF1ED] text-[#3C5A48] font-bold' : 'text-[#736F6A] hover:bg-[#EBF1ED]/50 hover:text-[#2C2B29]'}`}
                  >
                    <img src={friend.avatar} alt={friend.name} className="w-6 h-6 rounded-full object-cover border border-[#E6E1DA]" />
                    <span className="truncate flex-1">{friend.name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </nav>
    </aside>
  );
}
