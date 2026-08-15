/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, Group, Expense, Split, SplitMethod, ExpenseCategory } from '../types';
import { getCurrencyConfig, formatAmount } from '../utils/currency';
import { X, Calendar, DollarSign, FileText, Users, ChevronDown, Check, AlertCircle, Tag, Edit3, Camera } from 'lucide-react';
import ReceiptScanner from './ReceiptScanner';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  friends: User[];
  groups: Group[];
  allUsers: User[]; // Map of all user details
  currency?: string;
  onAddExpense?: (expense: Omit<Expense, 'id' | 'createdBy' | 'createdAt'>) => void;
  onSaveExpense?: (expense: Omit<Expense, 'id' | 'createdBy' | 'createdAt'> | Expense) => void;
  existingExpense?: Expense | null;
  initialGroupId?: string | null;
  initialFriendId?: string | null;
}

export default function ExpenseModal({
  isOpen,
  onClose,
  currentUser,
  friends,
  groups,
  allUsers,
  currency = 'USD',
  onAddExpense,
  onSaveExpense,
  existingExpense = null,
  initialGroupId = null,
  initialFriendId = null,
}: ExpenseModalProps) {
  const currencyConfig = getCurrencyConfig(currency);
  const isEditing = !!existingExpense;

  // Form States
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [groupId, setGroupId] = useState<string | 'none'>(initialGroupId || 'none');
  const [friendId, setFriendId] = useState<string | 'none'>(initialFriendId || 'none');
  const [paidBy, setPaidBy] = useState<string>(currentUser.id);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equally');
  const [category, setCategory] = useState<ExpenseCategory>('other');

  // List of candidate users for splitting based on Group vs. Individual
  const [eligibleUsers, setEligibleUsers] = useState<User[]>([]);
  // Which of those eligible users are active/included in the split
  const [includedUserIds, setIncludedUserIds] = useState<string[]>([]);
  // Manual exact values/percentages input state: Record<userId, string>
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});

  const [validationError, setValidationError] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  // Update eligible users when Group selection or Friend selection changes
  useEffect(() => {
    if (groupId && groupId !== 'none') {
      const selectedGroup = groups.find((g) => g.id === groupId);
      if (selectedGroup) {
        // Group members
        const members = allUsers.filter((u) => selectedGroup.members.includes(u.id));
        setEligibleUsers(members);
        setIncludedUserIds(members.map((m) => m.id));
      }
    } else {
      // Non-group: split between current user and selected friend
      const activeFriendId = friendId !== 'none' ? friendId : (friends[0]?.id || '');
      const members = [currentUser];
      const selectedFriend = friends.find((f) => f.id === activeFriendId);
      if (selectedFriend) {
        members.push(selectedFriend);
      }
      setEligibleUsers(members);
      setIncludedUserIds(members.map((m) => m.id));
    }
  }, [groupId, friendId, groups, friends, currentUser, allUsers]);

  // Handle setting initial group, friend, or existing expense data on modal open
  useEffect(() => {
    if (isOpen) {
      if (existingExpense) {
        setDescription(existingExpense.description);
        setAmountStr(existingExpense.amount.toString());
        setDate(existingExpense.date || new Date().toISOString().split('T')[0]);
        setGroupId(existingExpense.groupId || 'none');
        setPaidBy(existingExpense.paidBy);
        setSplitMethod(existingExpense.splitMethod);
        setCategory(existingExpense.category || 'other');
        
        // Populate splits & included user IDs
        const splitsUserIds = existingExpense.splits.map((s) => s.userId);
        setIncludedUserIds(splitsUserIds);
        
        if (existingExpense.splitMethod === 'exactly' || existingExpense.splitMethod === 'percentage') {
          const inputs: Record<string, string> = {};
          existingExpense.splits.forEach((s) => {
            inputs[s.userId] = existingExpense.splitMethod === 'percentage'
              ? (s.percentage?.toString() || '')
              : s.amount.toString();
          });
          setCustomInputs(inputs);
        }
      } else {
        setGroupId(initialGroupId || 'none');
        setFriendId(initialFriendId || 'none');
        setDescription('');
        setAmountStr('');
        setPaidBy(currentUser.id);
        setSplitMethod('equally');
        setCategory('other');
        setDate(new Date().toISOString().split('T')[0]);
      }
      setValidationError(null);
    }
  }, [isOpen, initialGroupId, initialFriendId, currentUser.id, existingExpense]);

  // Reset custom inputs when splitMethod or eligibleUsers changes
  useEffect(() => {
    const initialInputs: Record<string, string> = {};
    eligibleUsers.forEach((u) => {
      initialInputs[u.id] = '';
    });
    setCustomInputs(initialInputs);
    setValidationError(null);
  }, [splitMethod, eligibleUsers]);

  const totalAmount = parseFloat(amountStr) || 0;

  // Toggle user inclusion in splitting
  const toggleUserSplit = (userId: string) => {
    if (includedUserIds.includes(userId)) {
      // Keep at least one user
      if (includedUserIds.length > 1) {
        setIncludedUserIds(includedUserIds.filter((id) => id !== userId));
      }
    } else {
      setIncludedUserIds([...includedUserIds, userId]);
    }
  };

  const handleInputChange = (userId: string, val: string) => {
    // Only allow numbers and decimals
    if (/^\d*\.?\d*$/.test(val)) {
      setCustomInputs((prev) => ({ ...prev, [userId]: val }));
    }
  };

  // Perform live calculations and validations
  let computedSplits: Split[] = [];
  let sumCheck = 0;
  let remaining = 0;

  if (totalAmount > 0 && includedUserIds.length > 0) {
    if (splitMethod === 'equally') {
      const share = Number((totalAmount / includedUserIds.length).toFixed(2));
      let distributedSum = share * includedUserIds.length;
      let difference = Number((totalAmount - distributedSum).toFixed(2));

      computedSplits = eligibleUsers.map((user) => {
        const isIncluded = includedUserIds.includes(user.id);
        let amount = isIncluded ? share : 0;
        
        // Distribute rounding penny to the first included user
        if (isIncluded && difference !== 0) {
          amount = Number((amount + difference).toFixed(2));
          difference = 0; // Only adjust once
        }
        
        return { userId: user.id, amount };
      });
    } else if (splitMethod === 'exactly') {
      computedSplits = eligibleUsers.map((user) => {
        const isIncluded = includedUserIds.includes(user.id);
        const amount = isIncluded ? (parseFloat(customInputs[user.id]) || 0) : 0;
        sumCheck += amount;
        return { userId: user.id, amount };
      });
      remaining = Number((totalAmount - sumCheck).toFixed(2));
    } else if (splitMethod === 'percentage') {
      computedSplits = eligibleUsers.map((user) => {
        const isIncluded = includedUserIds.includes(user.id);
        const pct = isIncluded ? (parseFloat(customInputs[user.id]) || 0) : 0;
        sumCheck += pct;
        const amount = Number(((totalAmount * pct) / 100).toFixed(2));
        return { userId: user.id, amount, percentage: pct };
      });
      remaining = Number((100 - sumCheck).toFixed(2));
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (totalAmount <= 0) {
      setValidationError('Please enter a valid amount greater than $0.');
      return;
    }
    if (includedUserIds.length === 0) {
      setValidationError('At least one user must be included in the split.');
      return;
    }

    // Verify splits sum to exact total
    if (splitMethod === 'exactly') {
      const enteredSum = computedSplits.reduce((acc, s) => acc + s.amount, 0);
      if (Math.abs(enteredSum - totalAmount) > 0.01) {
        setValidationError(
          `Sum of individual splits ($${enteredSum.toFixed(2)}) must equal total cost ($${totalAmount.toFixed(2)}). Difference: $${(totalAmount - enteredSum).toFixed(2)}`
        );
        return;
      }
    } else if (splitMethod === 'percentage') {
      const enteredPctSum = computedSplits.reduce((acc, s) => acc + (s.percentage || 0), 0);
      if (Math.abs(enteredPctSum - 100) > 0.01) {
        setValidationError(`Percentages must sum to exactly 100%. Currently: ${enteredPctSum}%`);
        return;
      }
    }

    // Finalize split distribution
    const expensePayload = {
      ...(existingExpense ? { id: existingExpense.id, createdBy: existingExpense.createdBy, createdAt: existingExpense.createdAt } : {}),
      description: description.trim() || 'General Expense',
      amount: totalAmount,
      date,
      paidBy,
      groupId: groupId === 'none' ? null : groupId,
      splits: computedSplits.filter((s) => s.amount > 0),
      splitMethod,
      category,
      isSettlement: false,
    };

    if (onSaveExpense) {
      onSaveExpense(expensePayload as any);
    } else if (onAddExpense) {
      onAddExpense(expensePayload as any);
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#2C2B29]/40 backdrop-blur-xs transition-opacity animate-fadeIn" id="expense-modal-backdrop">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl border border-[#E6E1DA] shadow-xl max-w-lg w-full flex flex-col max-h-[92vh] animate-sheet-up sm:animate-none overflow-hidden" id="expense-modal-content">
        
        {/* Mobile Drag Handle */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-[#E6E1DA]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#E6E1DA]" id="expense-modal-header">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#3C5A48] flex items-center justify-center text-white shrink-0" id="header-icon-container">
              {isEditing ? <Edit3 className="w-4 h-4" /> : <Users className="w-4 h-4" />}
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[#2C2B29]">{isEditing ? 'Edit Expense' : 'Add an Expense'}</h2>
          </div>

          <div className="flex items-center gap-2" id="header-action-group">
            {!isEditing && (
              <button
                onClick={() => setShowScanner(!showScanner)}
                type="button"
                className="px-3.5 py-1.5 bg-[#EBF1ED] hover:bg-[#FAF8F5] text-[#3C5A48] font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                title="Scan Receipt with AI"
              >
                <Camera className="w-4 h-4" />
                <span className="hidden sm:inline">AI Scan</span>
              </button>
            )}
            <button
              onClick={handleSubmit}
              type="button"
              className="px-3.5 py-1.5 bg-[#3C5A48] hover:bg-[#2E4738] active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
              id="top-save-expense-btn"
              title="Save Expense Now"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>{isEditing ? 'Update' : 'Save'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-[#736F6A] hover:bg-[#F8F5F2] hover:text-[#2C2B29] transition-colors cursor-pointer"
              type="button"
              id="close-modal-btn"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {showScanner ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex items-center justify-center">
            <ReceiptScanner 
              onScanComplete={(items, total, tax) => {
                setDescription(`Receipt: ${items.length} items`);
                setAmountStr(total.toString());
                setShowScanner(false);
              }}
              onCancel={() => setShowScanner(false)}
            />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4 sm:gap-5">
          {/* Category Dropdown */}
          <div className="flex flex-col gap-1.5" id="category-selector-container">
            <label htmlFor="expense-category" className="text-xs font-bold text-[#2C2B29] flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-[#3C5A48]" /> Category
            </label>
            <select
              id="expense-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="w-full px-3 py-2 border border-[#E6E1DA] rounded-xl text-xs bg-white text-[#2C2B29] focus:outline-none focus:border-[#3C5A48]"
            >
              <option value="food">🍔 Food & Dining</option>
              <option value="groceries">🛒 Groceries</option>
              <option value="rent">🏠 Rent & Stay</option>
              <option value="transport">🚕 Transportation</option>
              <option value="utilities">⚡ Utilities</option>
              <option value="entertainment">🎬 Entertainment</option>
              <option value="other">📦 Other / General</option>
            </select>
          </div>

          {/* Top Priority Inputs: Amount & Description */}
          <div className="flex flex-col gap-3 bg-[#FAF8F5] p-3 sm:p-3.5 rounded-2xl border border-[#E6E1DA]" id="top-amount-desc-section">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              {/* Amount - Prominent First Input */}
              <div className="sm:col-span-5 flex flex-col gap-1" id="amount-container">
                <label htmlFor="expense-amount" className="text-xs font-black text-[#3C5A48] uppercase tracking-wider flex items-center gap-1">
                  Total Cost ({currencyConfig.symbol}) *
                </label>
                <div className="relative">
                  <span className="w-5 h-5 absolute left-3 top-2.5 text-[#3C5A48] font-black text-base text-center flex items-center justify-center">
                    {currencyConfig.symbol}
                  </span>
                  <input
                    id="expense-amount"
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    placeholder="0.00"
                    value={amountStr}
                    onChange={(e) => {
                      if (/^\d*\.?\d*$/.test(e.target.value)) {
                        setAmountStr(e.target.value);
                      }
                    }}
                    className="w-full pl-9 pr-3 py-2 bg-white border-2 border-[#3C5A48]/30 rounded-xl text-lg font-black focus:outline-none focus:border-[#3C5A48] focus:ring-2 focus:ring-[#3C5A48]/20 transition-all text-[#2C2B29]"
                    required
                  />
                </div>
              </div>

              {/* Description */}
              <div className="sm:col-span-7 flex flex-col gap-1" id="desc-container">
                <label htmlFor="expense-desc" className="text-xs font-bold text-[#2C2B29]">Expense Description <span className="text-[10px] text-[#736F6A] font-normal">(Optional)</span></label>
                <div className="relative">
                  <FileText className="w-4 h-4 absolute left-3 top-2.5 text-[#736F6A]" />
                  <input
                    id="expense-desc"
                    type="text"
                    placeholder="e.g. Dinner, Groceries, Taxi"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-[#E6E1DA] rounded-xl text-sm font-medium focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] transition-colors text-[#2C2B29]"
                  />
                </div>
              </div>
            </div>

            {/* Horizontal Scrollable Category Chips */}
            <div className="flex overflow-x-auto gap-1.5 py-0.5 no-scrollbar" id="category-chips">
              {[
                { label: '🍔 Dinner', cat: 'food' },
                { label: '🛒 Groceries', cat: 'groceries' },
                { label: '🏠 Rent', cat: 'rent' },
                { label: '🚕 Taxi', cat: 'transport' },
                { label: '☕ Coffee', cat: 'food' },
                { label: '⚡ Utilities', cat: 'utilities' },
                { label: '🎬 Movies', cat: 'entertainment' }
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => {
                    setCategory(chip.cat as ExpenseCategory);
                    if (!description) {
                      setDescription(chip.label);
                    } else if (!description.includes(chip.label.split(' ')[1])) {
                      setDescription(`${chip.label} - ${description}`);
                    }
                  }}
                  className={`px-2.5 py-1 border text-[11px] font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    category === chip.cat
                      ? 'border-[#3C5A48] bg-[#EBF1ED] text-[#3C5A48]'
                      : 'border-[#E6E1DA] bg-white hover:border-[#3C5A48] hover:bg-[#EBF1ED]/40 text-[#2C2B29]'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Group / Individual Scope Selector & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" id="scope-selector-group">
            <div className="flex flex-col gap-1.5" id="group-select-container">
              <label htmlFor="group-select" className="text-xs font-bold text-[#2C2B29]">Group Association</label>
              <div className="relative">
                <select
                  id="group-select"
                  value={groupId}
                  onChange={(e) => {
                    setGroupId(e.target.value);
                    if (e.target.value !== 'none') {
                      setFriendId('none');
                    }
                  }}
                  className="w-full pl-3 pr-8 py-2 border border-[#E6E1DA] rounded-xl text-xs appearance-none bg-white focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] transition-colors text-[#2C2B29]"
                >
                  <option value="none">Non-Group (Direct)</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-2.5 top-2.5 text-[#736F6A] pointer-events-none" />
              </div>
            </div>

            {groupId === 'none' && (
              <div className="flex flex-col gap-1.5 animate-fadeIn" id="friend-select-container">
                <label htmlFor="friend-select" className="text-xs font-bold text-[#2C2B29]">Split with Friend</label>
                <div className="relative">
                  <select
                    id="friend-select"
                    value={friendId}
                    onChange={(e) => setFriendId(e.target.value)}
                    className="w-full pl-3 pr-8 py-2 border border-[#E6E1DA] rounded-xl text-xs appearance-none bg-white focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] transition-colors text-[#2C2B29]"
                  >
                    {friends.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-2.5 top-2.5 text-[#736F6A] pointer-events-none" />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5" id="date-container">
              <label htmlFor="expense-date" className="text-xs font-bold text-[#2C2B29]">Date</label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-2.5 text-[#736F6A]" />
                <input
                  id="expense-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-[#E6E1DA] rounded-xl text-xs bg-white focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] transition-colors text-[#2C2B29]"
                  required
                />
              </div>
            </div>
          </div>

          <div className="border-t border-[#E6E1DA]"></div>

          {/* Quick Split Presets */}
          <div className="flex flex-col gap-2" id="quick-split-presets">
            <span className="text-xs font-bold text-[#2C2B29]">Quick Split Presets</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setPaidBy(currentUser.id);
                  setSplitMethod('equally');
                  setIncludedUserIds(eligibleUsers.map((u) => u.id));
                }}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  paidBy === currentUser.id && splitMethod === 'equally' && includedUserIds.length === eligibleUsers.length
                    ? 'border-[#3C5A48] bg-[#EBF1ED] text-[#3C5A48] font-bold'
                    : 'border-[#E6E1DA] bg-white hover:bg-[#FAF8F5] text-[#2C2B29]'
                }`}
              >
                <div className="font-semibold">You paid, split equally</div>
                <div className="text-[10px] text-[#736F6A] mt-0.5">Everyone owes their share</div>
              </button>

              {eligibleUsers.filter((u) => u.id !== currentUser.id).length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const otherUser = eligibleUsers.find((u) => u.id !== currentUser.id);
                    if (otherUser) {
                      setPaidBy(otherUser.id);
                      setSplitMethod('equally');
                      setIncludedUserIds(eligibleUsers.map((u) => u.id));
                    }
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    paidBy !== currentUser.id && splitMethod === 'equally' && includedUserIds.length === eligibleUsers.length
                      ? 'border-[#3C5A48] bg-[#EBF1ED] text-[#3C5A48] font-bold'
                      : 'border-[#E6E1DA] bg-white hover:bg-[#FAF8F5] text-[#2C2B29]'
                  }`}
                >
                  <div className="font-semibold">
                    {eligibleUsers.find((u) => u.id !== currentUser.id)?.name.split(' ')[0] || 'Friend'} paid, split equally
                  </div>
                  <div className="text-[10px] text-[#736F6A] mt-0.5">You owe your share</div>
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-[#E6E1DA]"></div>

          {/* Payor and Split Style Configuration */}
          <div className="flex flex-col gap-3" id="split-settings">
            <div className="flex flex-wrap gap-3 items-center justify-between" id="split-settings-header">
              {/* Paid By */}
              <div className="flex items-center gap-1.5" id="paid-by-container">
                <span className="text-xs sm:text-sm text-[#736F6A]">Paid by</span>
                <div className="relative inline-block">
                  <select
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                    className="pl-2.5 pr-8 py-1.5 bg-[#FAF8F5] border border-[#E6E1DA] rounded-lg text-xs sm:text-sm font-semibold text-[#2C2B29] appearance-none focus:outline-none focus:border-[#3C5A48] cursor-pointer"
                  >
                    {eligibleUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.id === currentUser.id ? 'You' : u.name.split(' ')[0]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-2.5 top-3 text-[#736F6A] pointer-events-none" />
                </div>
              </div>

              {/* Split Mode Selector */}
              <div className="flex items-center gap-1.5" id="split-mode-container">
                <span className="text-xs sm:text-sm text-[#736F6A]">Split</span>
                <div className="relative inline-block">
                  <select
                    value={splitMethod}
                    onChange={(e) => setSplitMethod(e.target.value as SplitMethod)}
                    className="pl-2.5 pr-8 py-1.5 bg-[#FAF8F5] border border-[#E6E1DA] rounded-lg text-xs sm:text-sm font-semibold text-[#2C2B29] appearance-none focus:outline-none focus:border-[#3C5A48] cursor-pointer"
                  >
                    <option value="equally">Equally</option>
                    <option value="exactly">Exactly ($)</option>
                    <option value="percentage">By Percent (%)</option>
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-2.5 top-3 text-[#736F6A] pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Split Distribution List */}
            <div className="border border-[#E6E1DA] rounded-xl bg-[#FAF8F5] p-3 sm:p-4 flex flex-col gap-3" id="split-distribution-list">
              <span className="text-[10px] sm:text-xs font-bold text-[#736F6A] uppercase tracking-wider block">Split Details</span>
              
              <div className="flex flex-col gap-2" id="split-rows-container">
                {eligibleUsers.map((user) => {
                  const isIncluded = includedUserIds.includes(user.id);
                  const isEqually = splitMethod === 'equally';
                  
                  // Extract calculated split value
                  const matchedSplit = computedSplits.find((s) => s.userId === user.id);
                  const computedVal = matchedSplit ? matchedSplit.amount : 0;
                  const pctVal = matchedSplit?.percentage || 0;

                  return (
                    <div
                      key={user.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl transition-colors ${isIncluded ? 'bg-white border border-[#E6E1DA] shadow-2xs' : 'opacity-50'}`}
                      id={`split-row-${user.id}`}
                    >
                      {/* Left: User name & select checkbox */}
                      <button
                        type="button"
                        onClick={() => toggleUserSplit(user.id)}
                        className="flex items-center gap-2.5 text-left flex-1 cursor-pointer min-w-0"
                        id={`toggle-user-split-${user.id}`}
                      >
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0 ${isIncluded ? 'bg-[#3C5A48] border-[#3C5A48] text-white' : 'border-[#E6E1DA] bg-white'}`}>
                          {isIncluded && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="w-7 h-7 rounded-full object-cover shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <span className="text-xs sm:text-sm font-semibold text-[#2C2B29] truncate">
                          {user.id === currentUser.id ? 'You' : user.name}
                        </span>
                      </button>

                      {/* Right: Input or computed share */}
                      <div className="flex items-center gap-2 shrink-0" id={`input-container-${user.id}`}>
                        {isIncluded && !isEqually && (
                          <div className="relative w-20 sm:w-24">
                            {splitMethod === 'exactly' && (
                              <DollarSign className="w-3 h-3 absolute left-2 top-2.5 text-[#736F6A]" />
                            )}
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0"
                              value={customInputs[user.id] || ''}
                              onChange={(e) => handleInputChange(user.id, e.target.value)}
                              className={`w-full py-1 text-right rounded-lg border border-[#E6E1DA] text-xs sm:text-sm focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] pr-2 text-[#2C2B29] ${splitMethod === 'exactly' ? 'pl-5' : 'pr-6'}`}
                            />
                            {splitMethod === 'percentage' && (
                              <span className="text-xs text-[#736F6A] absolute right-2 top-1.5">%</span>
                            )}
                          </div>
                        )}

                        <div className="text-right min-w-[65px]">
                          <span className="text-xs sm:text-sm font-bold text-[#2C2B29]">
                            {formatAmount(computedVal, currency)}
                          </span>
                          {splitMethod === 'percentage' && isIncluded && (
                            <div className="text-[10px] text-[#736F6A]">
                              {pctVal.toFixed(1)}%
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Validation helper status bar */}
              <div className="flex items-center justify-between border-t border-[#E6E1DA] pt-2.5 mt-1 text-[11px] sm:text-xs" id="status-helper-bar">
                {splitMethod === 'equally' ? (
                  <span className="text-[#736F6A] truncate">
                    Split among {includedUserIds.length} participant{includedUserIds.length !== 1 ? 's' : ''}
                  </span>
                ) : splitMethod === 'exactly' ? (
                  <span className={`truncate ${remaining === 0 ? 'text-[#2E7D52] font-semibold' : 'text-[#736F6A]'}`}>
                    {remaining === 0 ? (
                      '✓ Perfect balance'
                    ) : remaining > 0 ? (
                      `${formatAmount(remaining, currency)} left`
                    ) : (
                      `Over by ${formatAmount(Math.abs(remaining), currency)}`
                    )}
                  </span>
                ) : (
                  <span className={`truncate ${remaining === 0 ? 'text-[#2E7D52] font-semibold' : 'text-[#736F6A]'}`}>
                    {remaining === 0 ? (
                      '✓ Perfect 100%'
                    ) : remaining > 0 ? (
                      `${remaining.toFixed(1)}% left`
                    ) : (
                      `Over by ${Math.abs(remaining).toFixed(1)}%`
                    )}
                  </span>
                )}
                
                <span className="text-[#736F6A] font-medium shrink-0">
                  Total: <strong className="text-[#2C2B29]">{formatAmount(totalAmount, currency)}</strong>
                </span>
              </div>
            </div>
          </div>

          {validationError && (
            <div className="p-3 bg-[#FDF3F0] border border-[#C86D51]/30 rounded-xl text-xs text-[#C86D51] font-medium flex items-start gap-2 animate-fadeIn" id="validation-error-box">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{validationError}</span>
            </div>
          )}
          </form>
        )}
      </div>
    </div>
  );
}
