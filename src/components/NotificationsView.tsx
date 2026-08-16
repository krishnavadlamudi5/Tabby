/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User, Activity } from '../types';
import { 
  Bell, 
  CheckCheck, 
  Sparkles, 
  Receipt, 
  UserPlus, 
  FolderPlus, 
  CheckCircle2, 
  Trash2, 
  ArrowRight, 
  Clock, 
  AlertCircle,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

interface NotificationsViewProps {
  currentUser: User;
  allUsers: User[];
  activities: Activity[];
  onMarkAllAsRead?: () => void;
  onNavigateToGroup?: (groupId: string) => void;
  onNavigateToFriend?: (friendId: string) => void;
  onSimulateAppUpdate?: () => void;
  onApplyLiveUpdate?: () => void;
  isDownloadingUpdate?: boolean;
  liveLatestVersion?: string | null;
}

export default function NotificationsView({
  currentUser,
  allUsers,
  activities,
  onMarkAllAsRead,
  onNavigateToGroup,
  onNavigateToFriend,
  onSimulateAppUpdate,
  onApplyLiveUpdate,
  isDownloadingUpdate,
  liveLatestVersion,
}: NotificationsViewProps) {
  const [filter, setFilter] = useState<'all' | 'expense' | 'settlement' | 'system'>('all');
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const userMap = React.useMemo(() => {
    const map: Record<string, User> = {};
    allUsers.forEach((u) => {
      map[u.id] = u;
    });
    return map;
  }, [allUsers]);

  const handleMarkRead = (id: string) => {
    setReadIds((prev) => new Set(prev).add(id));
  };

  const handleMarkAllRead = () => {
    const allIds = activities.map((a) => a.id);
    setReadIds(new Set(allIds));
    if (onMarkAllAsRead) onMarkAllAsRead();
  };

  // Helper to format timestamps humanly
  const humanizeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHrs = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHrs / 24);

      if (isNaN(date.getTime())) return 'Recently';
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHrs < 24) return `${diffHrs}h ago`;
      if (diffDays === 1) return 'Yesterday';
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return 'Recently';
    }
  };

  // Filter activities
  const filteredActivities = activities.filter((act) => {
    if (filter === 'expense') return act.type === 'expense_add' || act.type === 'expense_delete';
    if (filter === 'settlement') return act.type === 'settlement';
    if (filter === 'system') return act.type === 'app_update' || act.type === 'group_create' || act.type === 'friend_add';
    return true;
  });

  return (
    <div className="flex flex-col gap-6" id="notifications-view-container">
      {/* Header Bar */}
      <div className="bg-white border border-[#E6E1DA] rounded-2xl p-5 md:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#EBF1ED] text-[#3C5A48] flex items-center justify-center font-bold">
            <Bell className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-[#2C2B29]">Notifications & Updates</h1>
              <span className="bg-[#3C5A48] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {activities.length - readIds.size} New
              </span>
            </div>
            <p className="text-xs text-[#736F6A] mt-0.5">
              Stay up to date with group expenses, settlements, and app release updates
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onSimulateAppUpdate}
            className="px-3.5 py-2 bg-[#EBF1ED] hover:bg-[#DCE7E0] text-[#3C5A48] font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border border-[#C6D9CC]"
            id="simulate-update-btn"
          >
            <Sparkles className="w-4 h-4" />
            Check / Test App Update
          </button>
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="px-3.5 py-2 bg-white border border-[#E6E1DA] hover:bg-[#F8F5F2] text-[#2C2B29] font-semibold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            id="mark-all-read-btn"
          >
            <CheckCheck className="w-4 h-4 text-[#2E7D52]" />
            Mark all read
          </button>
        </div>
      </div>

      {/* Filter Tabs & Content */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-[#E6E1DA] pb-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${filter === 'all' ? 'bg-[#3C5A48] text-white shadow-xs' : 'text-[#736F6A] hover:bg-[#E6E1DA]/40'}`}
          >
            All Activity ({activities.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('expense')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${filter === 'expense' ? 'bg-[#3C5A48] text-white shadow-xs' : 'text-[#736F6A] hover:bg-[#E6E1DA]/40'}`}
          >
            Expenses
          </button>
          <button
            type="button"
            onClick={() => setFilter('settlement')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${filter === 'settlement' ? 'bg-[#3C5A48] text-white shadow-xs' : 'text-[#736F6A] hover:bg-[#E6E1DA]/40'}`}
          >
            Settlements
          </button>
          <button
            type="button"
            onClick={() => setFilter('system')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${filter === 'system' ? 'bg-[#3C5A48] text-white shadow-xs' : 'text-[#736F6A] hover:bg-[#E6E1DA]/40'}`}
          >
            App Updates & Groups
          </button>
        </div>

        {/* Notifications List */}
        <div className="flex flex-col gap-3" id="notifications-list">
          {filteredActivities.length === 0 ? (
            <div className="bg-white border border-[#E6E1DA] rounded-2xl p-10 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#FAF8F5] border border-[#E6E1DA] flex items-center justify-center text-[#736F6A]">
                <Bell className="w-6 h-6 stroke-[1.5]" />
              </div>
              <h3 className="font-bold text-[#2C2B29] text-sm">No notifications found</h3>
              <p className="text-xs text-[#736F6A] max-w-sm">
                You're all caught up! New group expenses, settlements, and app release updates will show up here.
              </p>
            </div>
          ) : (
            filteredActivities.map((act) => {
              const actor = userMap[act.userId];
              const isUnread = !readIds.has(act.id);

              let icon = <Receipt className="w-4 h-4 text-[#3C5A48]" />;
              let badgeBg = 'bg-[#EBF1ED]';

              if (act.type === 'settlement') {
                icon = <CheckCircle2 className="w-4 h-4 text-[#2E7D52]" />;
                badgeBg = 'bg-[#EEF7F2]';
              } else if (act.type === 'group_create') {
                icon = <FolderPlus className="w-4 h-4 text-[#5B7B9A]" />;
                badgeBg = 'bg-[#F0F4F8]';
              } else if (act.type === 'friend_add') {
                icon = <UserPlus className="w-4 h-4 text-[#8E7CC3]" />;
                badgeBg = 'bg-[#F5F2F9]';
              } else if (act.type === 'app_update') {
                icon = <Sparkles className="w-4 h-4 text-[#D9A05B]" />;
                badgeBg = 'bg-[#FDF8F0]';
              }

              return (
                <div
                  key={act.id}
                  onClick={() => handleMarkRead(act.id)}
                  className={`bg-white border rounded-2xl p-4 transition-all flex items-start gap-3.5 shadow-2xs relative ${
                    isUnread ? 'border-[#3C5A48]/30 bg-gradient-to-r from-[#EBF1ED]/20 to-white' : 'border-[#E6E1DA]'
                  }`}
                >
                  {/* Unread Dot */}
                  {isUnread && (
                    <span className="w-2.5 h-2.5 rounded-full bg-[#3C5A48] absolute top-4 right-4 ring-2 ring-white" />
                  )}

                  {/* Icon or Avatar */}
                  <div className="relative shrink-0">
                    <img
                      src={
                        actor?.avatar ||
                        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80'
                      }
                      alt={actor?.name || 'User'}
                      className="w-10 h-10 rounded-xl object-cover border border-[#E6E1DA]"
                      referrerPolicy="no-referrer"
                    />
                    <div className={`absolute -bottom-1 -right-1 p-1 rounded-md ${badgeBg} border border-white shadow-2xs`}>
                      {icon}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#2C2B29] text-xs md:text-sm">
                        {actor ? actor.name : 'Tabby System'}
                      </span>
                      <span className="text-[10px] text-[#736F6A] flex items-center gap-1 font-medium">
                        <Clock className="w-3 h-3" />
                        {humanizeTime(act.timestamp)}
                      </span>
                    </div>

                    <p className="text-xs text-[#2C2B29] mt-1 font-medium leading-relaxed">
                      {act.description}
                    </p>

                    {act.type === 'app_update' && (
                      <div className="mt-2.5 p-3 bg-[#FAF8F5] border border-[#E6E1DA] rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-[#3C5A48] font-bold">
                          <RefreshCw className={`w-3.5 h-3.5 ${isDownloadingUpdate ? 'animate-spin' : 'animate-spin-slow'}`} />
                          {liveLatestVersion ? `Tabby ${liveLatestVersion} Available` : 'Tabby System Update'}
                        </div>
                        <button
                          type="button"
                          disabled={isDownloadingUpdate}
                          onClick={() => {
                            if (onApplyLiveUpdate) {
                              onApplyLiveUpdate();
                            } else {
                              window.location.reload();
                            }
                          }}
                          className="px-2.5 py-1 bg-[#3C5A48] hover:bg-[#2E4738] disabled:opacity-50 text-white font-bold text-[11px] rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          {isDownloadingUpdate ? 'Downloading...' : 'Update & Reload'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
