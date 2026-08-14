import React, { useState } from 'react';
import { User } from '../types';
import { X, UserPlus, Search, Check, Mail, AtSign, Send, Copy, MessageCircle, Info } from 'lucide-react';

interface AddFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  allUsers: User[];
  friendsList: User[];
  onAddFriend: (friendName: string, friendEmail: string) => void;
}

export default function AddFriendModal({
  isOpen,
  onClose,
  currentUser,
  allUsers,
  friendsList,
  onAddFriend,
}: AddFriendModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [customName, setCustomName] = useState('');
  const [customContact, setCustomContact] = useState('');
  const [sentRequests, setSentRequests] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'search' | 'invite' | 'link'>('search');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const appInviteUrl = window.location.origin;

  // Filter existing registered network users non-friends
  const existingFriendIds = new Set(friendsList.map((f) => f.id));
  existingFriendIds.add(currentUser.id);

  const searchResults = allUsers.filter((u) => {
    if (existingFriendIds.has(u.id)) return false;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.phone && u.phone.includes(q)) ||
      u.id.toLowerCase().includes(q)
    );
  });

  const handleSendRequest = (user: User) => {
    onAddFriend(user.name, user.email || user.phone || `${user.id}@splitwise.app`);
    setSentRequests((prev) => [...prev, user.id]);
    setSuccessMsg(`Friend added! ${user.name} is now connected.`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleCustomInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim() || !customContact.trim()) return;

    onAddFriend(customName.trim(), customContact.trim());
    setSuccessMsg(`${customName.trim()} added! You can start splitting bills with them right away.`);
    setCustomName('');
    setCustomContact('');
    setTimeout(() => {
      setSuccessMsg(null);
      onClose();
    }, 2000);
  };

  const handleCopyInviteLink = () => {
    const inviteText = `Hey! Join me on Splitwise to split bills and track expenses together: ${appInviteUrl}`;
    navigator.clipboard.writeText(inviteText);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleShareWhatsApp = () => {
    const inviteText = encodeURIComponent(`Hey! Join me on Splitwise to split bills and track expenses together: ${appInviteUrl}`);
    window.open(`https://wa.me/?text=${inviteText}`, '_blank');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#2C2B29]/40 backdrop-blur-xs animate-fadeIn"
      id="add-friend-backdrop"
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl border border-[#E6E1DA] shadow-xl max-w-md w-full flex flex-col max-h-[92vh] overflow-hidden animate-sheet-up sm:animate-none"
        id="add-friend-modal"
      >
        {/* Mobile Drag Handle */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-[#E6E1DA]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#E6E1DA] bg-[#FAF8F5]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#3C5A48] flex items-center justify-center text-white shadow-xs shrink-0">
              <UserPlus className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-[#2C2B29]">Add Friends</h2>
              <p className="text-[11px] sm:text-xs text-[#736F6A]">Search users or invite friends directly</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#736F6A] hover:bg-[#E6E1DA]/50 hover:text-[#2C2B29] transition-colors cursor-pointer"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Alert Banner */}
        {successMsg && (
          <div className="p-3 bg-[#EBF1ED] border-b border-[#3C5A48]/20 text-xs font-bold text-[#3C5A48] flex items-center gap-2 animate-slideDown">
            <Check className="w-4 h-4 stroke-[3]" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Tab Selection */}
        <div className="flex border-b border-[#E6E1DA] bg-[#FAF8F5]/50">
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`flex-1 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer ${
              activeTab === 'search'
                ? 'border-[#3C5A48] text-[#3C5A48] bg-white'
                : 'border-transparent text-[#736F6A] hover:text-[#2C2B29]'
            }`}
          >
            🔍 Search Registered
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('invite')}
            className={`flex-1 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer ${
              activeTab === 'invite'
                ? 'border-[#3C5A48] text-[#3C5A48] bg-white'
                : 'border-transparent text-[#736F6A] hover:text-[#2C2B29]'
            }`}
          >
            ➕ Email or Mobile
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('link')}
            className={`flex-1 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer ${
              activeTab === 'link'
                ? 'border-[#3C5A48] text-[#3C5A48] bg-white'
                : 'border-transparent text-[#736F6A] hover:text-[#2C2B29]'
            }`}
          >
            🔗 Invite Link
          </button>
        </div>

        {/* Info Banner for Unregistered Friends */}
        <div className="bg-[#FAF8F5] px-4 py-2.5 border-b border-[#E6E1DA] flex items-start gap-2">
          <Info className="w-4 h-4 text-[#3C5A48] flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-[#736F6A] leading-relaxed">
            <strong className="text-[#2C2B29]">No Account Yet?</strong> You can still add them by name, split expenses immediately, and share an invite link! Their balances auto-sync when they sign up.
          </p>
        </div>

        {/* Tab 1: Search Network */}
        {activeTab === 'search' && (
          <div className="p-5 flex flex-col gap-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#736F6A]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, or mobile..."
                className="w-full pl-9 pr-3 py-2 border border-[#E6E1DA] rounded-xl text-xs bg-[#FAF8F5]/50 text-[#2C2B29] focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48]"
              />
            </div>

            <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
              {searchResults.length === 0 ? (
                <div className="text-center py-6 text-xs text-[#736F6A] flex flex-col items-center gap-2">
                  <AtSign className="w-6 h-6 text-[#736F6A]/40" />
                  <span>No registered users matching "{searchQuery}"</span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('invite');
                      setCustomContact(searchQuery);
                    }}
                    className="text-[#3C5A48] font-bold underline hover:text-[#2E4738] cursor-pointer"
                  >
                    Add as new friend by name & email/mobile instead
                  </button>
                </div>
              ) : (
                searchResults.map((user) => {
                  const isSent = sentRequests.includes(user.id);
                  return (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-[#E6E1DA] bg-white hover:bg-[#FAF8F5] transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="w-9 h-9 rounded-full object-cover border border-[#E6E1DA]"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-[#2C2B29] block truncate">{user.name}</span>
                          <span className="text-[10px] text-[#736F6A] block truncate">{user.email || user.phone}</span>
                        </div>
                      </div>

                      {isSent ? (
                        <span className="text-[11px] font-bold text-[#3C5A48] bg-[#EBF1ED] px-2.5 py-1 rounded-lg flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 stroke-[3]" /> Added
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSendRequest(user)}
                          className="px-3 py-1.5 bg-[#3C5A48] hover:bg-[#2E4738] text-white font-bold text-xs rounded-xl transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          Add Friend
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Add Non-registered Friend via Name & Contact */}
        {activeTab === 'invite' && (
          <form onSubmit={handleCustomInvite} className="p-5 flex flex-col gap-3.5">
            <div className="flex flex-col gap-1">
              <label htmlFor="invite-friend-name" className="text-xs font-bold text-[#2C2B29]">Friend's Full Name</label>
              <input
                id="invite-friend-name"
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Maya Lin"
                className="w-full px-3 py-2 border border-[#E6E1DA] rounded-xl text-xs bg-[#FAF8F5]/30 text-[#2C2B29] focus:outline-none focus:border-[#3C5A48]"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="invite-friend-email" className="text-xs font-bold text-[#2C2B29]">Email Address or Mobile Number</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-2.5 text-[#736F6A]" />
                <input
                  id="invite-friend-email"
                  type="text"
                  value={customContact}
                  onChange={(e) => setCustomContact(e.target.value)}
                  placeholder="e.g. maya@example.com or +1 555-0199"
                  className="w-full pl-9 pr-3 py-2 border border-[#E6E1DA] rounded-xl text-xs bg-[#FAF8F5]/30 text-[#2C2B29] focus:outline-none focus:border-[#3C5A48]"
                  required
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-[#E6E1DA]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-[#E6E1DA] hover:bg-[#F8F5F2] text-[#2C2B29] font-medium text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#3C5A48] hover:bg-[#2E4738] text-white font-bold text-xs rounded-xl transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add & Start Splitting
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Share Invite Link */}
        {activeTab === 'link' && (
          <div className="p-5 flex flex-col gap-4">
            <div className="p-3 bg-[#FAF8F5] border border-[#E6E1DA] rounded-xl flex flex-col gap-2">
              <span className="text-xs font-bold text-[#2C2B29]">Your Personal App Invite Link</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={appInviteUrl}
                  className="flex-1 px-3 py-1.5 border border-[#E6E1DA] rounded-lg text-xs bg-white text-[#736F6A] font-mono select-all"
                />
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="px-3 py-1.5 bg-[#3C5A48] hover:bg-[#2E4738] text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedLink ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-[#2C2B29]">Or Share Via WhatsApp</span>
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="w-full py-2.5 px-4 bg-[#25D366] hover:bg-[#128C7E] text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <MessageCircle className="w-4 h-4 fill-white" />
                Share Invite Link on WhatsApp
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
