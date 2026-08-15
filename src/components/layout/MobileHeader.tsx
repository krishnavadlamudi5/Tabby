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
    <header className="lg:hidden sticky top-0 z-40 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-[#E6E1DA] px-4 py-2.5 pt-safe flex items-center justify-between shadow-2xs" id="mobile-top-bar">
      <div className="flex items-center gap-2.5">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-xl text-[#736F6A] hover:bg-[#EBF1ED] hover:text-[#2C2B29] active:scale-95 transition-all cursor-pointer"
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
          className="flex items-center gap-1.5 cursor-pointer"
        >
          <AppLogo size="sm" />
        </button>
      </div>

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
  );
}
