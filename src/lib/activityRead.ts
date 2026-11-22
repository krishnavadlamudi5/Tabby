import { create } from 'zustand';
import { Activity } from '../types';

// Remembers, per signed-in user, when the Activity screen was last opened so
// the bell badges and "new" highlights clear once you've seen them (they used
// to be lit whenever any activity existed, and reset on every visit).

const key = (userId: string) => `tabby_activity_last_read_${userId}`;

function load(userId: string): number {
  try {
    const raw = localStorage.getItem(key(userId));
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

interface ActivityReadState {
  lastReadAt: Record<string, number>;
  markAllRead: (userId: string) => void;
}

export const useActivityRead = create<ActivityReadState>((set) => ({
  lastReadAt: {},
  markAllRead: (userId) => {
    const now = Date.now();
    try {
      localStorage.setItem(key(userId), String(now));
    } catch {
      // Storage unavailable: still clears for this session.
    }
    set((s) => ({ lastReadAt: { ...s.lastReadAt, [userId]: now } }));
  },
}));

/** When this user last opened the Activity screen (0 = never). */
export function useLastReadAt(userId: string | undefined): number {
  const fromStore = useActivityRead((s) => (userId ? s.lastReadAt[userId] : undefined));
  if (!userId) return 0;
  return fromStore ?? load(userId);
}

/**
 * Activities worth showing. 'app_update' entries were fake ones created by
 * the old "Check Updates" button; real app updates are shown from the live
 * update check instead.
 */
export function visibleActivities(activities: Activity[]): Activity[] {
  return activities.filter((a) => a.type !== 'app_update');
}

/** Something someone else did that you haven't seen yet. */
export function isUnread(act: Activity, myUserId: string, lastReadAt: number): boolean {
  if (act.userId === myUserId) return false;
  const t = new Date(act.timestamp).getTime();
  return Number.isFinite(t) && t > lastReadAt;
}

/** Unread count for the bell badges. */
export function useUnreadActivityCount(activities: Activity[], myUserId: string | undefined): number {
  const since = useLastReadAt(myUserId);
  if (!myUserId) return 0;
  return visibleActivities(activities).filter((a) => isUnread(a, myUserId, since)).length;
}
