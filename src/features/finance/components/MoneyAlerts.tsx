import React from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { financeApi } from '../api';
import { useAppStore } from '../../../store/useAppStore';
import { fmtDate, useAsync, toastError } from './ui';

/** Unread money alerts (renewals, missed EMIs, declined payments…) shown in Notifications. */
export default function MoneyAlerts() {
  const authStatus = useAppStore((s) => s.authStatus);
  const { data, reload } = useAsync(() => (authStatus === 'signedIn' ? financeApi.alerts() : Promise.resolve(null)), [authStatus]);
  const unread = (data?.alerts || []).filter((a) => !a.readAt);
  if (!unread.length) return null;
  return (
    <div className="bg-white border border-[#E6E1DA] rounded-2xl p-4 shadow-xs flex flex-col gap-2" id="money-alerts">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-[#736F6A] uppercase tracking-wider">Money alerts · {unread.length}</span>
        <button type="button" className="text-[11px] font-bold text-[#3C5A48] cursor-pointer" onClick={async () => { try { await financeApi.readAllAlerts(); reload(); } catch (e) { toastError(e); } }}>Mark all read</button>
      </div>
      {unread.slice(0, 8).map((a) => (
        <div key={a.id} className="flex items-start gap-2 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 text-[#C86D51] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold">{a.title}</div>
            <div className="text-[11px] text-[#736F6A]">{fmtDate(a.createdAt, true)}{a.body ? ` · ${a.body}` : ''}</div>
          </div>
          <button type="button" aria-label="Mark read" className="p-1 text-[#A39E98] hover:text-[#3C5A48] cursor-pointer" onClick={async () => { await financeApi.readAlert(a.id); reload(); }}><Check className="w-3.5 h-3.5" /></button>
        </div>
      ))}
    </div>
  );
}
