/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User } from '../types';
import { SUPPORTED_CURRENCIES, formatAmount, getCurrencyConfig } from '../utils/currency';
import { X, Settings, DollarSign, User as UserIcon, RotateCcw, Check, Sparkles, Globe, Shield } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  currency: string;
  onCurrencyChange: (newCurrencyCode: string) => void;
  onUpdateProfile: (updatedUser: Partial<User>) => void;
  onResetData: () => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  currentUser,
  currency,
  onCurrencyChange,
  onUpdateProfile,
  onResetData,
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
    if (userName.trim() !== currentUser.name || userEmail.trim() !== currentUser.email) {
      onUpdateProfile({
        name: userName.trim() || currentUser.name,
        email: userEmail.trim() || currentUser.email,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2C2B29]/40 backdrop-blur-xs animate-fadeIn" id="settings-modal-backdrop">
      <div className="bg-white border border-[#E6E1DA] rounded-3xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]" id="settings-modal-container">
        
        {/* Header */}
        <div className="p-5 border-b border-[#E6E1DA] bg-[#FAF8F5] flex items-center justify-between" id="settings-modal-header">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#EBF1ED] text-[#3C5A48] flex items-center justify-center border border-[#E6E1DA]">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#2C2B29]">App Settings & Preferences</h2>
              <p className="text-[11px] text-[#736F6A]">Customize currency, profile & app data</p>
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
                  className="px-3 py-2 border border-[#E6E1DA] rounded-xl text-xs text-[#2C2B29] focus:outline-none focus:border-[#3C5A48] bg-white"
                  required
                />
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
                  <span className="text-xs font-bold text-[#2C2B29] block">Reset to Sample Demo Data</span>
                  <span className="text-[11px] text-[#736F6A] block">Restores initial sample groups, friends & expenses.</span>
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
                <span className="text-xs font-bold text-[#C86D51]">Are you sure you want to reset all app data?</span>
                <p className="text-[11px] text-[#736F6A]">This will restore default sample groups, friends, expenses and reset local storage.</p>
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
                    Yes, Reset Everything
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer Save Button */}
          <div className="pt-2 border-t border-[#E6E1DA] flex items-center justify-between" id="settings-footer">
            <span className="text-[11px] text-[#736F6A]">Changes are saved locally</span>
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
