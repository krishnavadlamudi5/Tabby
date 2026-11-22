/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Receipt, Trash2, CheckCircle2, FolderPlus, UserPlus, Download, RefreshCw } from 'lucide-react';
import MoneyAlerts from '../features/finance/components/MoneyAlerts';
import { User, Activity } from '../types';
import { isUnread, useActivityRead, useLastReadAt, visibleActivities } from '../lib/activityRead';

interface NotificationsViewProps {
  currentUser: User;
  allUsers: User[];
  activities: Activity[];
  onNavigateToGroup?: (groupId: string) => void;
  onNavigateToFriend?: (friendId: string) => void;
  /** A real app update (from the live-update check) is ready to install. */
  isUpdateAvailable?: boolean;
  onApplyLiveUpdate?: () => void;
  isDownloadingUpdate?: boolean;
  liveLatestVersion?: string | null;
  liveReleaseNotes?: string | null;
}

type Filter = 'all' | 'expenses' | 'payments' | 'people';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'payments', label: 'Payments' },
  { id: 'people', label: 'Groups & friends' },
];

function matches(filter: Filter, act: Activity): boolean {
  if (filter === 'expenses') return act.type === 'expense_add' || act.type === 'expense_delete';
  if (filter === 'payments') return act.type === 'settlement';
  if (filter === 'people') return act.type === 'group_create' || act.type === 'friend_add';
  return true;
}

const TYPE_STYLE: Record<string, { icon: React.ReactNode; tint: string }> = {
  expense_add: { icon: <Receipt className="w-4 h-4" />, tint: 'bg-[#EBF1ED] text-[#3C5A48]' },
  expense_delete: { icon: <Trash2 className="w-4 h-4" />, tint: 'bg-[#FDF3F0] text-[#C86D51]' },
  settlement: { icon: <CheckCircle2 className="w-4 h-4" />, tint: 'bg-[#E8F3F1] text-[#2F7A6B]' },
  group_create: { icon: <FolderPlus className="w-4 h-4" />, tint: 'bg-[#EEF2F8] text-[#4A6491]' },
  friend_add: { icon: <UserPlus className="w-4 h-4" />, tint: 'bg-[#F3EFF8] text-[#6E5A91]' },
};

function dayLabel(d: Date): string {
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This week';
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function timeLabel(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function NotificationsView({
  currentUser,
  allUsers,
  activities,
  isUpdateAvailable,
  onApplyLiveUpdate,
  isDownloadingUpdate,
  liveLatestVersion,
  liveReleaseNotes,
}: NotificationsViewProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const markAllRead = useActivityRead((s) => s.markAllRead);
  const storedLastReadAt = useLastReadAt(currentUser.id);

  // Highlight what was new when the screen opened, then count it as seen so
  // the bell badges clear. The highlight stays for this visit.
  const [highlightSince] = useState(storedLastReadAt);
  useEffect(() => {
    markAllRead(currentUser.id);
  }, [currentUser.id, markAllRead]);

  const userMap = useMemo(() => {
    const map: Record<string, User> = {};
    allUsers.forEach((u) => { map[u.id] = u; });
    return map;
  }, [allUsers]);

  const all = useMemo(
    () =>
      visibleActivities(activities)
        .slice()
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [activities]
  );
  const shown = all.filter((a) => matches(filter, a));
  const newCount = all.filter((a) => isUnread(a, currentUser.id, highlightSince)).length;

  // Group rows under "Today", "Yesterday", ... headings.
  const sections: { label: string; items: Activity[] }[] = [];
  for (const act of shown) {
    const d = new Date(act.timestamp);
    const label = isNaN(d.getTime()) ? 'Earlier' : dayLabel(d);
    const last = sections[sections.length - 1];
    if (last && last.label === label) last.items.push(act);
    else sections.push({ label, items: [act] });
  }

  return (
    <div className="flex flex-col gap-4 text-[#2C2B29]" id="notifications-view-container">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">Activity</h1>
          <p className="text-xs text-[#736F6A] mt-0.5">
            {newCount > 0 ? `${newCount} new since you last looked` : 'Expenses, payments and groups you\'re part of'}
          </p>
        </div>
      </div>

      {isUpdateAvailable && (
        <div className="bg-white border border-[#E6E1DA] rounded-2xl p-3.5 shadow-xs flex items-center gap-3" id="activity-update-card">
          <div className="w-9 h-9 rounded-xl bg-[#EBF1ED] text-[#3C5A48] flex items-center justify-center shrink-0">
            <Download className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold">
              {liveLatestVersion ? `Update ${liveLatestVersion} ready` : 'App update ready'}
            </div>
            <div className="text-[11px] text-[#736F6A] truncate">{liveReleaseNotes || 'Installs in a few seconds, no APK needed.'}</div>
          </div>
          <button
            type="button"
            disabled={isDownloadingUpdate}
            onClick={() => onApplyLiveUpdate?.()}
            className="px-3 py-2 rounded-xl bg-[#3C5A48] hover:bg-[#2E4738] disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            {isDownloadingUpdate ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
            {isDownloadingUpdate ? 'Updating…' : 'Update'}
          </button>
        </div>
      )}

      <MoneyAlerts />

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter activity">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
              filter === f.id
                ? 'bg-[#3C5A48] border-[#3C5A48] text-white'
                : 'bg-white border-[#E6E1DA] text-[#736F6A] hover:text-[#2C2B29]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="bg-white border border-[#E6E1DA] rounded-2xl px-6 py-10 text-center flex flex-col items-center gap-2" id="activity-empty">
          <div className="w-11 h-11 rounded-full bg-[#F3F0EB] text-[#A39E98] flex items-center justify-center">
            <Bell className="w-5 h-5" />
          </div>
          <div className="text-sm font-bold">{filter === 'all' ? 'Nothing here yet' : 'Nothing in this filter'}</div>
          <p className="text-xs text-[#736F6A] max-w-xs">
            When you or your friends add expenses, record payments or create groups, it shows up here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4" id="notifications-list">
          {sections.map((section) => (
            <section key={section.label} className="flex flex-col gap-1.5">
              <h2 className="text-[11px] font-bold text-[#736F6A] uppercase tracking-wider px-1">{section.label}</h2>
              <ul className="bg-white border border-[#E6E1DA] rounded-2xl divide-y divide-[#F0ECE6] overflow-hidden">
                {section.items.map((act) => {
                  const actor = userMap[act.userId];
                  const isMe = act.userId === currentUser.id;
                  const name = isMe ? 'You' : actor?.name || 'Someone';
                  const style = TYPE_STYLE[act.type] || TYPE_STYLE.expense_add;
                  const fresh = isUnread(act, currentUser.id, highlightSince);
                  const d = new Date(act.timestamp);
                  return (
                    <li key={act.id} className={`flex items-start gap-3 px-3.5 py-3 ${fresh ? 'bg-[#F7FAF8]' : ''}`}>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${style.tint}`}>{style.icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] leading-snug text-[#2C2B29] break-words">
                          <span className="font-bold">{name}</span> {act.description}
                        </p>
                        <div className="text-[11px] text-[#A39E98] mt-0.5">{isNaN(d.getTime()) ? '' : timeLabel(d)}</div>
                      </div>
                      {fresh && <span className="w-2 h-2 rounded-full bg-[#C86D51] mt-1.5 shrink-0" aria-label="New" />}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
