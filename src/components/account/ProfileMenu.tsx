import Avatar from './Avatar';
import React, { useEffect, useState } from 'react';
import { LogOut, Settings, UserRound, Wallet, RefreshCw, LogIn, Bell, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { currentAppVersion } from '../../lib/appVersion';

export type SettingsSection = 'account' | 'preferences' | 'money' | 'notifications' | 'data' | 'about';

/**
 * Small menu opened from your photo: who you are, the most-used settings,
 * and Sign out - always one tap away.
 */
export default function ProfileMenu({ open, onClose, onOpenSettings, onCheckUpdates, align = 'right' }: {
  open: boolean;
  onClose: () => void;
  onOpenSettings: (section?: SettingsSection) => void;
  onCheckUpdates: () => void;
  align?: 'right' | 'left';
}) {
  const { currentUser, authStatus, signOut } = useAppStore();
  const [version, setVersion] = useState('');
  useEffect(() => { if (open) void currentAppVersion().then(setVersion); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open || !currentUser) return null;
  const demo = authStatus === 'demo';

  const item = (icon: React.ReactNode, label: string, onClick: () => void, extra?: React.ReactNode, danger = false) => (
    <button type="button" onClick={() => { onClick(); onClose(); }}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-left cursor-pointer transition-colors ${danger ? 'text-[#A64B32] hover:bg-[#FDF3F0]' : 'text-[#2C2B29] hover:bg-[#F2EFEA]'}`}>
      {icon}<span className="flex-1">{label}</span>{extra}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose}>
      <div
        role="menu"
        onClick={(e) => e.stopPropagation()}
        className={`absolute ${align === 'right' ? 'right-3 top-[calc(env(safe-area-inset-top,0px)+3.75rem)]' : 'left-3 top-24 lg:left-4'} w-[min(20rem,calc(100vw-1.5rem))] bg-white border border-[#E6E1DA] rounded-2xl shadow-2xl p-2 animate-fadeIn`}
        id="profile-menu"
      >
        <div className="flex items-center gap-3 p-3 pb-3 border-b border-[#F2EFEA] mb-1">
          <Avatar src={currentUser.avatar} name={currentUser.name} />
          <div className="min-w-0">
            <div className="text-sm font-extrabold truncate">{currentUser.name}</div>
            <div className="text-[11px] text-[#736F6A] truncate">{currentUser.email}</div>
            <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#EBF1ED] text-[#3C5A48]">
              {demo ? 'Demo mode · not saved' : <><ShieldCheck className="w-3 h-3" />Signed in with Google</>}
            </div>
          </div>
        </div>
        {!demo && item(<UserRound className="w-4 h-4 text-[#736F6A]" />, 'Edit profile', () => onOpenSettings('account'))}
        {item(<Settings className="w-4 h-4 text-[#736F6A]" />, 'Settings', () => onOpenSettings())}
        {!demo && item(<Wallet className="w-4 h-4 text-[#736F6A]" />, 'Money settings', () => onOpenSettings('money'))}
        {!demo && item(<Bell className="w-4 h-4 text-[#736F6A]" />, 'Alerts & emails', () => onOpenSettings('notifications'))}
        {item(<RefreshCw className="w-4 h-4 text-[#736F6A]" />, 'Check for updates', onCheckUpdates, <span className="text-[10px] text-[#A39E98]">{version}</span>)}
        <div className="border-t border-[#F2EFEA] mt-1 pt-1">
          {demo
            ? item(<LogIn className="w-4 h-4" />, 'Sign in with Google', signOut)
            : item(<LogOut className="w-4 h-4" />, 'Sign out', signOut, undefined, true)}
        </div>
      </div>
    </div>
  );
}
