/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User } from '../types';
import { SUPPORTED_CURRENCIES, formatAmount, getCurrencyConfig } from '../utils/currency';
import { exportExpensesToCSV } from '../utils/export';
import { X, Settings, DollarSign, User as UserIcon, RotateCcw, Check, Sparkles, Globe, Shield, Download, LogOut } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  currency: string;
  onCurrencyChange: (newCurrencyCode: string) => void;
  onUpdateProfile: (updatedUser: Partial<User>) => void;
  onResetData: () => void;
  onSignOut: () => void;
  isDemo?: boolean;
  expenses?: any[];
  groups?: any[];
  allUsers?: any[];
}

export default function SettingsModal({
  isOpen,
  onClose,
  currentUser,
  currency,
  onCurrencyChange,
  onUpdateProfile,
  onResetData,
  onSignOut,
  isDemo = false,
  expenses = [],
  groups = [],
  allUsers = [],
}: SettingsModalProps) {
  const [selectedCurrency, setSelectedCurrency] = useState(currency);
  const [userName, setUserName] = useState(currentUser.name);
  const [userEmail, setUserEmail] = useState(currentUser.email);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Update currency
    if (selectedCurrency !== currency) {
      onCurrencyChange(selectedCurrency);
    }

    // Update profile
    const emailChanged = isDemo && userEmail.trim() !== currentUser.email;
    if (userName.trim() !== currentUser.name || emailChanged) {
      onUpdateProfile({
        name: userName.trim() || currentUser.name,
        ...(emailChanged ? { email: userEmail.trim() } : {}),
      });
    }

    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 600);
  };

  const activeCurrencyConfig = getCurrencyConfig(selectedCurrency);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#2C2B29]/40 backdrop-blur-xs animate-fadeIn" id="settings-modal-backdrop">
      <div className="bg-white border border-[#E6E1DA] rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[92vh] animate-sheet-up sm:animate-none" id="settings-modal-container">
        
        {/* Mobile Drag Handle */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-[#E6E1DA]" />
        </div>

        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#E6E1DA] bg-[#FAF8F5] flex items-center justify-between" id="settings-modal-header">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#EBF1ED] text-[#3C5A48] flex items-center justify-center border border-[#E6E1DA] shrink-0">
              <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-[#2C2B29]">App Settings & Preferences</h2>
              <p className="text-[11px] sm:text-xs text-[#736F6A]">Customize currency, profile & app data</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#736F6A] hover:bg-[#E6E1DA]/50 hover:text-[#2C2B29] transition-colors cursor-pointer"
            type="button"
            id="close-settings-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 flex flex-col gap-6 overflow-y-auto" id="settings-form">
          
          {/* SECTION 1: Currency Selection */}
          <div className="flex flex-col gap-3" id="settings-section-currency">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#2C2B29] uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[#3C5A48]" />
                Primary Display Currency
              </label>
              <span className="text-[11px] font-bold text-[#3C5A48] bg-[#EBF1ED] px-2 py-0.5 rounded-md">
                Active: {activeCurrencyConfig.code} ({activeCurrencyConfig.symbol})
              </span>
            </div>

            <p className="text-xs text-[#736F6A]">
              Choose the currency symbol used across all balances, expenses, group reports, and debt calculations.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" id="currency-picker-grid">
              {SUPPORTED_CURRENCIES.map((c) => {
                const isSelected = selectedCurrency === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setSelectedCurrency(c.code)}
                    className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#3C5A48] bg-[#EBF1ED] text-[#3C5A48] font-bold shadow-2xs'
                        : 'border-[#E6E1DA] bg-[#FAF8F5]/40 hover:bg-[#FAF8F5] text-[#2C2B29]'
                    }`}
                    id={`currency-opt-${c.code}`}
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-bold">{c.code}</span>
                      <span className="text-[10px] text-[#736F6A] truncate max-w-[85px]">{c.name}</span>
                    </div>
                    <span className="text-sm font-black opacity-80">{c.symbol}</span>
                  </button>
                );
              })}
            </div>

            {/* Currency Preview Box */}
            <div className="p-3 bg-[#FAF8F5] border border-[#E6E1DA] rounded-xl flex items-center justify-between text-xs" id="currency-preview-box">
              <span className="text-[#736F6A]">Formatting Example:</span>
              <div className="flex items-center gap-3 font-extrabold">
                <span className="text-[#2E7D52]">{formatAmount(142.50, selectedCurrency, true)}</span>
                <span className="text-[#C86D51]">{formatAmount(-65.00, selectedCurrency, true)}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-[#E6E1DA]" />

          {/* SECTION 1.5: Data Export */}
          <div className="flex flex-col gap-3">
            <label className="text-xs font-bold text-[#2C2B29] uppercase tracking-wider flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5 text-[#3C5A48]" />
              Export Data
            </label>
            <p className="text-xs text-[#736F6A]">
              Download a complete CSV backup of all your expenses, splits, and history.
            </p>
            <button
              type="button"
              onClick={() => exportExpensesToCSV(expenses, groups, allUsers, currency)}
              className="px-4 py-2 bg-white border border-[#E6E1DA] hover:bg-[#FAF8F5] text-[#2C2B29] font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download CSV Report
            </button>
          </div>

          <div className="border-t border-[#E6E1DA]" />

          {/* SECTION 2: Profile Settings */}
          <div className="flex flex-col gap-3" id="settings-section-profile">
            <label className="text-xs font-bold text-[#2C2B29] uppercase tracking-wider flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5 text-[#3C5A48]" />
              Account Profile Settings
            </label>

            <div className="flex items-center gap-3 bg-[#FAF8F5] p-3 rounded-xl border border-[#E6E1DA]">
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-12 h-12 rounded-full object-cover border border-[#E6E1DA]"
                referrerPolicy="no-referrer"
              />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[#2C2B29]">{currentUser.name}</span>
                <span className="text-[11px] text-[#736F6A]">{currentUser.email}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="settings-user-name" className="text-xs font-bold text-[#2C2B29]">Display Name</label>
                <input
                  id="settings-user-name"
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="px-3 py-2 border border-[#E6E1DA] rounded-xl text-xs text-[#2C2B29] focus:outline-none focus:border-[#3C5A48] bg-white"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="settings-user-email" className="text-xs font-bold text-[#2C2B29]">Email Address</label>
                <input
                  id="settings-user-email"
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  readOnly={!isDemo}
                  className={`px-3 py-2 border border-[#E6E1DA] rounded-xl text-xs text-[#2C2B29] focus:outline-none focus:border-[#3C5A48] ${isDemo ? 'bg-white' : 'bg-[#FAF8F5] text-[#736F6A]'}`}
                  required
                />
                {!isDemo && <span className="text-[10px] text-[#A39E98]">Comes from your Google account.</span>}
              </div>
            </div>
          </div>

          <div className="border-t border-[#E6E1DA]" />

          {/* SECTION 3: Reset Data & Storage */}
          <div className="flex flex-col gap-3" id="settings-section-reset">
            <label className="text-xs font-bold text-[#C86D51] uppercase tracking-wider flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5 text-[#C86D51]" />
              Data & Storage Management
            </label>

            {!showConfirmReset ? (
              <div className="p-3 bg-[#FDF3F0] border border-[#C86D51]/30 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#2C2B29] block">{isDemo ? 'Reset Demo Data' : 'Reload From Server'}</span>
                  <span className="text-[11px] text-[#736F6A] block">{isDemo ? 'Restores the sample groups, friends & expenses.' : 'Clears this device\'s copy and downloads your data again.'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowConfirmReset(true)}
                  className="px-3 py-1.5 bg-white border border-[#C86D51] text-[#C86D51] hover:bg-[#C86D51] hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex-shrink-0"
                  id="trigger-reset-data-btn"
                >
                  Reset App Data
                </button>
              </div>
            ) : (
              <div className="p-4 bg-[#FDF3F0] border border-[#C86D51] rounded-xl flex flex-col gap-3 animate-fadeIn">
                <span className="text-xs font-bold text-[#C86D51]">{isDemo ? 'Reset the demo data?' : 'Reload your data from the server?'}</span>
                <p className="text-[11px] text-[#736F6A]">{isDemo ? 'This restores the default sample groups, friends and expenses.' : 'Nothing on the server is deleted. Changes still waiting to sync are kept and sent first.'}</p>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowConfirmReset(false)}
                    className="px-3 py-1.5 bg-white border border-[#E6E1DA] text-[#2C2B29] font-medium text-xs rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onResetData();
                      setShowConfirmReset(false);
                      onClose();
                    }}
                    className="px-3 py-1.5 bg-[#C86D51] hover:bg-[#A64B32] text-white font-bold text-xs rounded-xl cursor-pointer"
                    id="confirm-reset-data-btn"
                  >
                    {isDemo ? 'Yes, Reset' : 'Yes, Reload'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 4: Account */}
          <div className="flex flex-col gap-3" id="settings-section-account">
            <label className="text-xs font-bold text-[#736F6A] uppercase tracking-wider flex items-center gap-1.5">
              <LogOut className="w-3.5 h-3.5" />
              Account
            </label>
            <div className="p-3 bg-[#FAF8F5] border border-[#E6E1DA] rounded-xl flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-xs font-bold text-[#2C2B29] block">{isDemo ? 'Leave demo mode' : 'Sign out'}</span>
                <span className="text-[11px] text-[#736F6A] block truncate">
                  {isDemo ? 'Go back to the sign-in screen.' : `Signed in as ${currentUser.email}`}
                </span>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="px-3 py-1.5 bg-white border border-[#E6E1DA] text-[#2C2B29] hover:bg-[#2C2B29] hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex-shrink-0 flex items-center gap-1.5"
                id="sign-out-btn"
              >
                <LogOut className="w-3.5 h-3.5" />
                {isDemo ? 'Exit demo' : 'Sign out'}
              </button>
            </div>
          </div>

          {/* Footer Save Button */}
          <div className="pt-2 border-t border-[#E6E1DA] flex items-center justify-between" id="settings-footer">
            <span className="text-[11px] text-[#736F6A]">{isDemo ? 'Demo: saved on this device only' : 'Changes sync to your account'}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-[#E6E1DA] hover:bg-[#FAF8F5] text-[#2C2B29] font-medium text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[#3C5A48] hover:bg-[#2E4738] text-white font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                id="save-settings-btn"
              >
                {saveSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Saved!
                  </>
                ) : (
                  'Save Preferences'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
