import React, { useEffect } from 'react';
import { Lock, LayoutGrid, List, BarChart3, ClipboardCheck, Landmark, Repeat, Shield, FileText, Tags, Inbox } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useFinanceStore } from './store';
import { financeApi } from './api';
import { ErrorBlock, Spinner, useAsync } from './components/ui';
import FinanceHome from './views/FinanceHome';
import Transactions from './views/Transactions';
import ReviewQueue from './views/ReviewQueue';
import Accounts from './views/Accounts';
import Categories from './views/Categories';
import Commitments from './views/Commitments';
import Insurance from './views/Insurance';
import Documents from './views/Documents';
import ImportView from './views/ImportView';
import Reports from './views/Reports';
import type { FinanceTab } from './types';

export const FINANCE_TABS: { id: FinanceTab; label: string; short: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Overview', short: 'Overview', icon: <LayoutGrid className="w-4 h-4" /> },
  { id: 'transactions', label: 'Transactions', short: 'Txns', icon: <List className="w-4 h-4" /> },
  { id: 'reports', label: 'Reports', short: 'Reports', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'review', label: 'Review', short: 'Review', icon: <ClipboardCheck className="w-4 h-4" /> },
  { id: 'accounts', label: 'Accounts', short: 'Accounts', icon: <Landmark className="w-4 h-4" /> },
  { id: 'insurance', label: 'Insurance', short: 'Insurance', icon: <Shield className="w-4 h-4" /> },
  { id: 'commitments', label: 'Commitments', short: 'EMIs & SIPs', icon: <Repeat className="w-4 h-4" /> },
  { id: 'documents', label: 'Documents', short: 'Documents', icon: <FileText className="w-4 h-4" /> },
  { id: 'categories', label: 'Categories & rules', short: 'Categories', icon: <Tags className="w-4 h-4" /> },
  { id: 'import', label: 'Import', short: 'Import', icon: <Inbox className="w-4 h-4" /> },
];

export default function FinanceApp({ tab, params, onNavigate }: {
  tab: FinanceTab;
  params?: Record<string, string>;
  onNavigate: (tab: FinanceTab, params?: Record<string, string>) => void;
}) {
  const authStatus = useAppStore((s) => s.authStatus);
  const reviewCount = useFinanceStore((s) => s.reviewCount);
  const loadBasics = useFinanceStore((s) => s.loadBasics);
  const basics = useAsync(() => (authStatus === 'signedIn' ? loadBasics() : Promise.resolve()), [authStatus]);

  // Keep the review badge fresh.
  useEffect(() => {
    if (authStatus !== 'signedIn') return;
    financeApi.dashboard(new Date().toISOString().slice(0, 7))
      .then((d) => useFinanceStore.getState().setReviewCount(d.review.total))
      .catch(() => {});
  }, [authStatus, tab]);

  if (authStatus !== 'signedIn') {
    return (
      <div className="flex flex-col items-center text-center gap-3 py-16 px-6">
        <div className="w-12 h-12 rounded-2xl bg-[#EBF1ED] text-[#3C5A48] flex items-center justify-center"><Lock className="w-5 h-5" /></div>
        <h2 className="text-lg font-extrabold">Money needs your account</h2>
        <p className="text-xs text-[#736F6A] max-w-sm">Your bank transactions, statements, policies and documents are private to your Google account. Leave demo mode and sign in to use them.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold">Money</h1>
      </div>
      {/* Phones: every section visible at once as an icon grid (no hidden sideways scroll). */}
      <nav className="sm:hidden grid grid-cols-5 gap-1.5" aria-label="Money sections" id="money-tabs-grid">
        {FINANCE_TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button key={t.id} type="button" onClick={() => onNavigate(t.id)} aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center gap-1 py-2 rounded-xl border text-[10px] font-bold leading-tight cursor-pointer transition-colors ${active ? 'bg-[#3C5A48] text-white border-[#3C5A48]' : 'bg-white text-[#736F6A] border-[#E6E1DA]'}`}>
              {t.icon}
              <span className="truncate max-w-full px-0.5">{t.short}</span>
              {t.id === 'review' && reviewCount > 0 && <span className={`absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full text-[9px] flex items-center justify-center ${active ? 'bg-white text-[#3C5A48]' : 'bg-[#C86D51] text-white'}`}>{reviewCount}</span>}
            </button>
          );
        })}
      </nav>
      {/* Larger screens: one row of chips that wraps. */}
      <nav className="hidden sm:flex flex-wrap gap-1.5" aria-label="Money sections">
        {FINANCE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onNavigate(t.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border cursor-pointer transition-colors inline-flex items-center gap-1.5 ${tab === t.id ? 'bg-[#3C5A48] text-white border-[#3C5A48]' : 'bg-white text-[#736F6A] border-[#E6E1DA] hover:text-[#2C2B29]'}`}
          >
            {t.icon}{t.label}
            {t.id === 'review' && reviewCount > 0 && <span className={`ml-0.5 px-1.5 rounded-full text-[10px] ${tab === t.id ? 'bg-white text-[#3C5A48]' : 'bg-[#C86D51] text-white'}`}>{reviewCount}</span>}
          </button>
        ))}
      </nav>

      {basics.loading && !basics.data ? <Spinner /> : basics.error ? <ErrorBlock message={basics.error} onRetry={basics.reload} /> : (
        <>
          {tab === 'home' && <FinanceHome onNavigate={onNavigate} />}
          {tab === 'transactions' && <Transactions key={JSON.stringify(params || {})} initial={params} />}
          {tab === 'reports' && <Reports onNavigate={onNavigate} />}
          {tab === 'review' && <ReviewQueue onNavigate={onNavigate} />}
          {tab === 'accounts' && <Accounts initial={params} />}
          {tab === 'commitments' && <Commitments />}
          {tab === 'insurance' && <Insurance />}
          {tab === 'documents' && <Documents />}
          {tab === 'categories' && <Categories />}
          {tab === 'import' && <ImportView onNavigate={onNavigate} />}
        </>
      )}
    </div>
  );
}
