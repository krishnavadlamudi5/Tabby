import React, { useState } from 'react';
import { Users, X, AlertCircle, Plus, Check } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { GroupCategory, User } from '../types';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupCreated: (groupId: string) => void;
}

export default function CreateGroupModal({ isOpen, onClose, onGroupCreated }: CreateGroupModalProps) {
  const currentUser = useAppStore(state => state.currentUser);
  const users = useAppStore(state => state.users);
  const groups = useAppStore(state => state.groups);
  const createGroup = useAppStore(state => state.createGroup);

  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupCategory, setNewGroupCategory] = useState<GroupCategory>('trip');
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<string[]>([]);
  const [groupValidationError, setGroupValidationError] = useState<string | null>(null);

  const myGroups = groups.filter((g) => g.members.includes(currentUser?.id || ''));
  const friendsList = users.filter((u) => {
    if (u.id === currentUser?.id) return false;
    const friendIdSet = new Set(currentUser?.friendIds || []);
    myGroups.forEach((g) => {
      g.members.forEach((mId) => {
        if (mId !== currentUser?.id) friendIdSet.add(mId);
      });
    });
    return friendIdSet.has(u.id);
  });

  if (!isOpen || !currentUser) return null;

  const toggleGroupMemberSelection = (userId: string) => {
    if (groupValidationError) setGroupValidationError(null);
    if (newGroupMemberIds.includes(userId)) {
      setNewGroupMemberIds(newGroupMemberIds.filter((id) => id !== userId));
    } else {
      setNewGroupMemberIds([...newGroupMemberIds, userId]);
    }
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    setGroupValidationError(null);

    const isNameInvalid = !newGroupName.trim();
    const isMembersInvalid = newGroupMemberIds.length === 0;

    if (isNameInvalid && isMembersInvalid) {
      setGroupValidationError('Please enter a valid group name and select at least one member.');
      return;
    }
    if (isNameInvalid) {
      setGroupValidationError('Group name cannot be blank or contain only whitespace.');
      return;
    }
    if (isMembersInvalid) {
      setGroupValidationError('Please select at least one friend to join the group.');
      return;
    }

    const newGroupId = createGroup(newGroupName, newGroupCategory, newGroupMemberIds);
    
    // reset
    setNewGroupName('');
    setNewGroupCategory('trip');
    setNewGroupMemberIds([]);
    setGroupValidationError(null);
    
    onClose();
    if (newGroupId) {
      onGroupCreated(newGroupId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#2C2B29]/40 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl border border-[#E6E1DA] shadow-xl max-w-md w-full flex flex-col max-h-[92vh] animate-sheet-up sm:animate-none overflow-hidden">
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-[#E6E1DA]" />
        </div>

        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#E6E1DA]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#3C5A48] flex items-center justify-center text-white">
              <Users className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-[#2C2B29]">Create a Group</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#736F6A] hover:bg-[#F8F5F2] hover:text-[#2C2B29] transition-colors cursor-pointer"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreateGroup} noValidate className="p-4 sm:p-5 flex flex-col gap-4 overflow-y-auto">
          {groupValidationError && (
            <div className="p-3 bg-[#FDF3F0] border border-[#C86D51]/40 rounded-xl text-xs text-[#C86D51] font-semibold flex items-start gap-2.5 shadow-2xs">
              <AlertCircle className="w-4 h-4 text-[#C86D51] flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="block font-bold">Unable to create group</span>
                <span className="font-normal text-[11px] text-[#A64B32]">{groupValidationError}</span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="new-group-name" className="text-xs font-bold text-[#2C2B29]">
                Group Name <span className="text-[#C86D51]">*</span>
              </label>
            </div>
            <input
              id="new-group-name"
              type="text"
              placeholder="e.g. Ski Trip 2026, Flatmates, Roadtrip"
              value={newGroupName}
              onChange={(e) => {
                setNewGroupName(e.target.value);
                if (groupValidationError) setGroupValidationError(null);
              }}
              className="w-full px-3 py-2.5 border border-[#E6E1DA] rounded-xl text-sm focus:outline-none transition-colors text-[#2C2B29] bg-[#FAF8F5]/30 focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48]"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-group-category" className="text-xs font-bold text-[#2C2B29]">Category</label>
            <select
              id="new-group-category"
              value={newGroupCategory}
              onChange={(e) => setNewGroupCategory(e.target.value as GroupCategory)}
              className="w-full px-3 py-2.5 border border-[#E6E1DA] rounded-xl text-sm bg-white focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] transition-colors text-[#2C2B29]"
            >
              <option value="trip">Trip / Vacation</option>
              <option value="home">Apartment / House</option>
              <option value="couple">Couple / Relationship</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="flex flex-col gap-2 mt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#2C2B29]">
                Select Members <span className="text-[#C86D51]">*</span>
              </label>
            </div>
            <div className="border border-[#E6E1DA] rounded-xl bg-[#F8F5F2]/50 p-2.5 max-h-[160px] overflow-y-auto flex flex-col gap-2 transition-colors">
              {friendsList.length === 0 ? (
                <div className="flex flex-col gap-1 text-center py-2">
                  <span className="text-xs text-[#736F6A] font-medium">No friends available to add.</span>
                </div>
              ) : (
                friendsList.map((friend) => {
                  const isSelected = newGroupMemberIds.includes(friend.id);
                  return (
                    <button
                      key={friend.id}
                      type="button"
                      onClick={() => toggleGroupMemberSelection(friend.id)}
                      className={`flex items-center justify-between p-2 rounded-lg text-left transition-colors bg-white border cursor-pointer ${
                        isSelected ? 'border-[#3C5A48] bg-[#EBF1ED]/50 shadow-2xs' : 'border-[#E6E1DA] hover:bg-[#F8F5F2]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <img src={friend.avatar} alt={friend.name} className="w-6 h-6 rounded-full object-cover" />
                        <span className="text-xs font-semibold text-[#2C2B29]">{friend.name}</span>
                      </div>
                      <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors border ${
                        isSelected ? 'bg-[#3C5A48] border-[#3C5A48] text-white' : 'border-[#E6E1DA] bg-white'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-3 border-t border-[#E6E1DA] pb-safe">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-[#E6E1DA] hover:bg-[#F8F5F2] text-[#2C2B29] font-medium text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 bg-[#3C5A48] hover:bg-[#2E4738] text-white font-semibold text-xs rounded-xl transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              Create Group
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
