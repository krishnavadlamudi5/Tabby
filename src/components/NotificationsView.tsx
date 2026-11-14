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
import { motion, AnimatePresence } from 'motion/react';

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
      <div className="bg-gradient-to-r from-[#2C2B29] to-[#1A1918] rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center font-bold shadow-lg shadow-emerald-900/20">
            <Bell className="w-7 h-7 stroke-[2]" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold text-white tracking-tight">Notifications</h1>
              <span className="bg-rose-500 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm">
                {activities.length - readIds.size} New
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1 font-medium">
              Stay up to date with your group activities
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap relative z-10">
          <button
            type="button"
            onClick={onSimulateAppUpdate}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer border border-white/10 backdrop-blur-md"
            id="simulate-update-btn"
          >
            <Sparkles className="w-4 h-4 text-emerald-400" />
            Check Updates
          </button>
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-900/30"
            id="mark-all-read-btn"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </button>
        </div>
      </div>

      {/* Filter Tabs & Content */}
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2 border-b border-gray-200 pb-3 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${filter === 'all' ? 'bg-[#2C2B29] text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            All Activity ({activities.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('expense')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${filter === 'expense' ? 'bg-[#2C2B29] text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            Expenses
          </button>
          <button
            type="button"
            onClick={() => setFilter('settlement')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${filter === 'settlement' ? 'bg-[#2C2B29] text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            Settlements
          </button>
          <button
            type="button"
            onClick={() => setFilter('system')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${filter === 'system' ? 'bg-[#2C2B29] text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            System
          </button>
        </div>

        {/* Notifications List */}
        <div className="flex flex-col gap-3" id="notifications-list">
          <AnimatePresence mode="popLayout">
            {filteredActivities.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white border border-gray-100 rounded-3xl p-12 text-center flex flex-col items-center gap-4 shadow-sm"
              >
                <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                  <Bell className="w-8 h-8 stroke-[1.5]" />
                </div>
                <h3 className="font-extrabold text-gray-900 text-lg">No notifications yet</h3>
                <p className="text-sm text-gray-500 max-w-sm">
                  You're all caught up! New group expenses, settlements, and updates will show up here.
                </p>
              </motion.div>
            ) : (
              filteredActivities.map((act, index) => {
                const actor = userMap[act.userId];
                const isUnread = !readIds.has(act.id);

                let icon = <Receipt className="w-4 h-4 text-emerald-600" />;
                let badgeBg = 'bg-emerald-50 border-emerald-100';

                if (act.type === 'settlement') {
                  icon = <CheckCircle2 className="w-4 h-4 text-teal-600" />;
                  badgeBg = 'bg-teal-50 border-teal-100';
                } else if (act.type === 'group_create') {
                  icon = <FolderPlus className="w-4 h-4 text-blue-600" />;
                  badgeBg = 'bg-blue-50 border-blue-100';
                } else if (act.type === 'friend_add') {
                  icon = <UserPlus className="w-4 h-4 text-indigo-600" />;
                  badgeBg = 'bg-indigo-50 border-indigo-100';
                } else if (act.type === 'app_update') {
                  icon = <Sparkles className="w-4 h-4 text-amber-600" />;
                  badgeBg = 'bg-amber-50 border-amber-100';
                }

                return (
                  <motion.div
                    key={act.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleMarkRead(act.id)}
                    className={`group cursor-pointer rounded-2xl p-4 transition-all duration-300 flex items-start gap-4 relative overflow-hidden ${
                      isUnread 
                        ? 'bg-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)] border border-emerald-500/20 hover:border-emerald-500/40 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.12)]' 
                        : 'bg-white/60 shadow-sm border border-gray-100 hover:bg-white hover:-translate-y-0.5 hover:shadow-md'
                    }`}
                  >
                    {/* Unread Indicator Glow */}
                    {isUnread && (
                      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-emerald-400 to-teal-500 rounded-l-2xl" />
                    )}

                    {/* Unread Dot */}
                    {isUnread && (
                      <span className="w-3 h-3 rounded-full bg-emerald-500 absolute top-5 right-5 ring-4 ring-emerald-50" />
                    )}

                    {/* Icon or Avatar */}
                    <div className="relative shrink-0 ml-1">
                      <img
                        src={
                          actor?.avatar ||
                          'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80'
                        }
                        alt={actor?.name || 'User'}
                        className="w-12 h-12 rounded-full object-cover shadow-sm group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                      <div className={`absolute -bottom-1 -right-1 p-1.5 rounded-full ${badgeBg} border shadow-sm`}>
                        {icon}
                      </div>
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0 pr-6 py-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-gray-900 text-sm">
                          {actor ? actor.name : 'Tabby System'}
                        </span>
                        <span className="text-[11px] text-gray-400 flex items-center gap-1 font-semibold uppercase tracking-wider">
                          <Clock className="w-3 h-3" />
                          {humanizeTime(act.timestamp)}
                        </span>
                      </div>

                      <p className={`text-[13px] mt-1.5 leading-relaxed ${isUnread ? 'text-gray-800 font-semibold' : 'text-gray-600 font-medium'}`}>
                        {act.description}
                      </p>

                      {act.type === 'app_update' && (
                        <div className="mt-3 p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-xl flex items-center justify-between shadow-inner">
                          <div className="flex items-center gap-2 text-xs text-amber-900 font-bold">
                            <RefreshCw className={`w-4 h-4 ${isDownloadingUpdate ? 'animate-spin' : 'animate-spin-slow'}`} />
                            {liveLatestVersion ? `Tabby v${liveLatestVersion} Available` : 'Tabby System Update'}
                          </div>
                          <button
                            type="button"
                            disabled={isDownloadingUpdate}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onApplyLiveUpdate) {
                                onApplyLiveUpdate();
                              } else {
                                window.location.reload();
                              }
                            }}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 disabled:opacity-50 text-white font-extrabold text-[11px] rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-amber-900/20"
                          >
                            {isDownloadingUpdate ? 'Downloading...' : 'Update Now'}
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
