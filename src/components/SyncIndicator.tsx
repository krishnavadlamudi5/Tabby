import React from 'react';
import { CloudOff, RefreshCw, PlayCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

/**
 * Small floating pill: shows how many changes are waiting to reach the
 * server (with a retry button), or that the app is in local demo mode.
 */
export default function SyncIndicator() {
  const authStatus = useAppStore((s) => s.authStatus);
  const pendingCount = useAppStore((s) => s.pendingCount);
  const retrySync = useAppStore((s) => s.retrySync);
  const signOut = useAppStore((s) => s.signOut);

  if (authStatus === 'demo') {
    return (
      <div className="fixed z-40 right-3 bottom-24 lg:bottom-6 flex items-center gap-2 bg-white/95 backdrop-blur-md border border-[#E6E1DA] rounded-full pl-3 pr-1 py-1 shadow-md text-xs" id="demo-mode-indicator">
        <PlayCircle className="w-3.5 h-3.5 text-[#3C5A48]" />
        <span className="font-semibold text-[#2C2B29]">Demo mode</span>
        <span className="text-[#736F6A] hidden sm:inline">· not saved</span>
        <button
          type="button"
          onClick={signOut}
          className="ml-1 px-2.5 py-1 rounded-full bg-[#3C5A48] text-white font-bold hover:bg-[#2E4738] cursor-pointer"
        >
          Sign in
        </button>
      </div>
    );
  }

  if (authStatus !== 'signedIn' || pendingCount === 0) return null;

  return (
    <div
      className="fixed z-40 right-3 bottom-24 lg:bottom-6"
      role="status"
      id="sync-pending-indicator"
    >
      {/* Compact on phones so it doesn't cover the list; tap to retry. */}
      <button
        type="button"
        onClick={retrySync}
        className="flex items-center gap-1.5 bg-[#FFF8E6]/95 backdrop-blur-sm border border-[#E9C46A] rounded-full px-2.5 py-1.5 shadow-sm text-[11px] font-semibold text-[#6B4A00] hover:bg-[#F5E3B3] cursor-pointer"
        aria-label={`${pendingCount} unsynced ${pendingCount === 1 ? 'change' : 'changes'}. Tap to retry.`}
        title="Waiting to sync. Tap to retry now."
      >
        <CloudOff className="w-3.5 h-3.5 text-[#9A6B00]" />
        <span>{pendingCount}<span className="hidden sm:inline"> {pendingCount === 1 ? 'change' : 'changes'} pending sync</span></span>
        <RefreshCw className="w-3 h-3" />
      </button>
    </div>
  );
}
