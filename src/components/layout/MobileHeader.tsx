import React from 'react';
import { Menu, X, Bell, Sparkles } from 'lucide-react';
import AppLogo from '../AppLogo';
import { useAppStore } from '../../store/useAppStore';

interface MobileHeaderProps {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  activeView: any;
  setActiveView: (view: any) => void;
  setIsSettingsOpen: (open: boolean) => void;
}

export default function MobileHeader({
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  activeView,
  setActiveView,
  setIsSettingsOpen
}: MobileHeaderProps) {
  const currentUser = useAppStore(state => state.currentUser);
  const activities = useAppStore(state => state.activities);

  if (!currentUser) return null;

  return (
    <header className="lg:hidden sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-white/50 px-4 py-2.5 pt-safe flex items-center justify-between shadow-[0_4px_20px_-10px_rgba(0,0,0,0.1)]" id="mobile-top-bar">
      <div className="flex items-center gap-2.5">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 active:scale-95 transition-all cursor-pointer"
          type="button"
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
          className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <AppLogo size="sm" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            setActiveView({ type: 'notifications' });
            setIsMobileMenuOpen(false);
          }}
          className={`p-2.5 rounded-xl relative transition-all duration-300 cursor-pointer flex items-center justify-center ${
            activeView.type === 'notifications'
              ? 'bg-gradient-to-br from-[#2E7D52] to-[#1B4332] text-white shadow-lg shadow-emerald-900/20 scale-105'
              : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-emerald-700 shadow-sm border border-gray-100'
          }`}
          title="Notifications"
          type="button"
        >
          <Bell className={`w-5 h-5 ${activeView.type === 'notifications' ? 'animate-none' : 'origin-top'}`} />
          {activities.length > 0 && (
            <div className="absolute -top-1 -right-1">
              <span className="w-3 h-3 rounded-full bg-rose-500 absolute inset-0 ring-2 ring-white z-10" />
              <span className="w-3 h-3 rounded-full bg-rose-500 absolute inset-0 animate-ping opacity-75" />
            </div>
          )}
        </button>

        <button
          onClick={() => setIsSettingsOpen(true)}
          className="p-0.5 rounded-full bg-gradient-to-tr from-emerald-400 to-teal-500 hover:scale-105 transition-all duration-300 cursor-pointer shadow-md group"
          type="button"
          title="Profile, settings & sign out"
          aria-label="Open profile menu"
        >
          <img
            src={currentUser.avatar}
            alt={currentUser.name}
            className="w-8 h-8 rounded-full object-cover border-2 border-white group-hover:border-emerald-50 transition-colors"
            referrerPolicy="no-referrer"
          />
        </button>
      </div>
    </header>
  );
}
