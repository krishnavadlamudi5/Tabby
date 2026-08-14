import React, { useState, useEffect } from 'react';
import { User, Group } from '../types';
import { formatAmount, getCurrencyConfig } from '../utils/currency';
import { X, CheckCircle2, ArrowRight, DollarSign, Wallet, AlertCircle } from 'lucide-react';

interface SettleUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromUser: User | null;
  toUser: User | null;
  totalDebt: number; // Positive debt amount
  groupId?: string | null;
  groups: Group[];
  allUsers: User[];
  currency?: string;
  onSettleDebt: (fromUserId: string, toUserId: string, amount: number, groupId: string | null) => void;
}

export default function SettleUpModal({
  isOpen,
  onClose,
  fromUser,
  toUser,
  totalDebt,
  groupId = null,
  groups,
  allUsers,
  currency = 'USD',
  onSettleDebt,
}: SettleUpModalProps) {
  const currencyConfig = getCurrencyConfig(currency);

  const [settlementType, setSettlementType] = useState<'full' | 'partial'>('full');
  const [customAmountStr, setCustomAmountStr] = useState<string>('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(groupId || null);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSettlementType('full');
      setCustomAmountStr(totalDebt > 0 ? totalDebt.toFixed(2) : '');
      setSelectedGroupId(groupId || null);
      setPaymentMethod('cash');
      setErrorMsg(null);
    }
  }, [isOpen, totalDebt, groupId]);

  if (!isOpen || !fromUser || !toUser) return null;

  const currentSettlementAmount =
    settlementType === 'full'
      ? Math.max(0, totalDebt)
      : parseFloat(customAmountStr) || 0;

  const remainingBalance = Math.max(0, totalDebt - currentSettlementAmount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (currentSettlementAmount <= 0) {
      setErrorMsg('Please enter a valid settlement amount greater than 0.');
      return;
    }

    if (currentSettlementAmount > totalDebt + 0.01) {
      setErrorMsg(`Settlement amount exceeds current debt of ${formatAmount(totalDebt, currency)}.`);
      return;
    }

    onSettleDebt(fromUser.id, toUser.id, currentSettlementAmount, selectedGroupId);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#2C2B29]/40 backdrop-blur-xs animate-fadeIn"
      id="settle-up-backdrop"
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl border border-[#E6E1DA] shadow-xl max-w-md w-full flex flex-col max-h-[92vh] overflow-hidden animate-sheet-up sm:animate-none"
        id="settle-up-modal"
      >
        {/* Mobile Drag Handle */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-[#E6E1DA]" />
        </div>

        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#E6E1DA] bg-[#FAF8F5]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#2E7D52] flex items-center justify-center text-white shadow-xs shrink-0">
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-[#2C2B29]">Settle Up Debt</h2>
              <p className="text-[11px] sm:text-xs text-[#736F6A]">Record a payment to balance accounts</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmit}
              type="button"
              className="px-3.5 py-1.5 bg-[#2E7D52] hover:bg-[#236340] active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
              id="top-settle-save-btn"
              title="Save Settlement Now"
            >
              <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
              <span>Save</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#736F6A] hover:bg-[#E6E1DA]/50 hover:text-[#2C2B29] transition-colors cursor-pointer"
              type="button"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Payer and Payee Flow Header */}
        <div className="p-4 bg-[#EBF1ED]/50 border-b border-[#E6E1DA] flex items-center justify-around text-center">
          <div className="flex flex-col items-center gap-1">
            <img
              src={fromUser.avatar}
              alt={fromUser.name}
              className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-xs"
              referrerPolicy="no-referrer"
            />
            <span className="text-xs font-bold text-[#2C2B29] truncate max-w-[100px]">{fromUser.name}</span>
            <span className="text-[10px] text-[#C86D51] font-bold uppercase">Payer</span>
          </div>

          <div className="flex flex-col items-center">
            <div className="p-2 rounded-full bg-white border border-[#E6E1DA] text-[#3C5A48] shadow-2xs">
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </div>
            <span className="text-[10px] text-[#736F6A] font-bold mt-1">
              Pays {formatAmount(currentSettlementAmount, currency)}
            </span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <img
              src={toUser.avatar}
              alt={toUser.name}
              className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-xs"
              referrerPolicy="no-referrer"
            />
            <span className="text-xs font-bold text-[#2C2B29] truncate max-w-[100px]">{toUser.name}</span>
            <span className="text-[10px] text-[#2E7D52] font-bold uppercase">Recipient</span>
          </div>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {errorMsg && (
            <div className="p-3 bg-[#FDF3F0] border border-[#C86D51]/30 rounded-xl text-xs text-[#C86D51] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Settlement Option Radio Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-[#2C2B29]">Settlement Type</label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setSettlementType('full');
                  setCustomAmountStr(totalDebt.toFixed(2));
                  setErrorMsg(null);
                }}
                className={`p-3 rounded-xl border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                  settlementType === 'full'
                    ? 'border-[#2E7D52] bg-[#EBF1ED]/60 ring-1 ring-[#2E7D52]'
                    : 'border-[#E6E1DA] hover:bg-[#FAF8F5]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2C2B29]">Full Settlement</span>
                  <div
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      settlementType === 'full' ? 'border-[#2E7D52] bg-[#2E7D52]' : 'border-[#E6E1DA]'
                    }`}
                  >
                    {settlementType === 'full' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <span className="text-xs font-extrabold text-[#2E7D52] mt-1">
                  {formatAmount(totalDebt, currency)}
                </span>
                <span className="text-[10px] text-[#736F6A]">Pay total debt in full</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSettlementType('partial');
                  setCustomAmountStr((totalDebt / 2).toFixed(2));
                  setErrorMsg(null);
                }}
                className={`p-3 rounded-xl border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                  settlementType === 'partial'
                    ? 'border-[#2E7D52] bg-[#EBF1ED]/60 ring-1 ring-[#2E7D52]'
                    : 'border-[#E6E1DA] hover:bg-[#FAF8F5]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2C2B29]">Partial Payment</span>
                  <div
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      settlementType === 'partial' ? 'border-[#2E7D52] bg-[#2E7D52]' : 'border-[#E6E1DA]'
                    }`}
                  >
                    {settlementType === 'partial' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <span className="text-xs font-semibold text-[#2C2B29] mt-1">Custom Amount</span>
                <span className="text-[10px] text-[#736F6A]">Pay partial balance</span>
              </button>
            </div>
          </div>

          {/* Amount Input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="settlement-amount-input" className="text-xs font-bold text-[#2C2B29]">
                Payment Amount ({currencyConfig.symbol})
              </label>
              <span className="text-[11px] text-[#736F6A]">
                Total debt: <strong className="text-[#2C2B29]">{formatAmount(totalDebt, currency)}</strong>
              </span>
            </div>
            <div className="relative">
              <span className="w-4 h-4 absolute left-3 top-2.5 text-[#736F6A] font-bold text-sm text-center flex items-center justify-center">
                {currencyConfig.symbol}
              </span>
              <input
                id="settlement-amount-input"
                type="number"
                step="0.01"
                min="0.01"
                max={totalDebt}
                value={customAmountStr}
                onChange={(e) => {
                  setCustomAmountStr(e.target.value);
                  setErrorMsg(null);
                }}
                disabled={settlementType === 'full'}
                className="w-full pl-8 pr-3 py-2 border border-[#E6E1DA] rounded-xl text-sm font-bold text-[#2C2B29] focus:outline-none focus:border-[#2E7D52] focus:ring-1 focus:ring-[#2E7D52] disabled:bg-[#F8F5F2] disabled:text-[#736F6A]"
                placeholder="0.00"
                required
              />
            </div>
            <div className="flex items-center justify-between text-[11px] px-1 text-[#736F6A]">
              <span>Remaining balance after payment:</span>
              <span className={`font-bold ${remainingBalance > 0 ? 'text-[#C86D51]' : 'text-[#2E7D52]'}`}>
                {formatAmount(remainingBalance, currency)}
              </span>
            </div>
          </div>

          {/* Group Scope Selection */}
          {groups.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="settlement-group-select" className="text-xs font-bold text-[#2C2B29]">
                Associate with Group (Optional)
              </label>
              <select
                id="settlement-group-select"
                value={selectedGroupId || ''}
                onChange={(e) => setSelectedGroupId(e.target.value || null)}
                className="w-full px-3 py-2 border border-[#E6E1DA] rounded-xl text-xs bg-white text-[#2C2B29] focus:outline-none focus:border-[#2E7D52]"
              >
                <option value="">-- General / Non-Group Debt --</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    👥 {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Payment Method Note */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[#2C2B29]">Payment Method Note</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'cash', label: '💵 Cash' },
                { id: 'venmo', label: '📱 Online / App' },
                { id: 'bank', label: '🏦 Bank Transfer' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`py-1.5 px-2 rounded-lg border text-xs font-semibold text-center transition-colors cursor-pointer ${
                    paymentMethod === m.id
                      ? 'border-[#2E7D52] bg-[#EBF1ED] text-[#2E7D52]'
                      : 'border-[#E6E1DA] text-[#736F6A] hover:bg-[#FAF8F5]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
