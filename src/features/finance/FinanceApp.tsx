import React, { useEffect } from 'react';
import { Lock } from 'lucide-react';
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
import type { FinanceTab } from './types';

export const FINANCE_TABS: { id: FinanceTab; label: string }[] = [
  { id: 'home', label: 'Overview' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'review', label: 'Review' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'commitments', label: 'Commitments' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'documents', label: 'Documents' },
  { id: 'categories', label: 'Categories & rules' },
  { id: 'import', label: 'Import' },
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
      <div className="-mx-3.5 sm:mx-0 px-3.5 sm:px-0 overflow-x-auto no-scrollbar">
        <div className="flex gap-1.5 w-max">
          {FINANCE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onNavigate(t.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border cursor-pointer transition-colors ${tab === t.id ? 'bg-[#3C5A48] text-white border-[#3C5A48]' : 'bg-white text-[#736F6A] border-[#E6E1DA] hover:text-[#2C2B29]'}`}
            >
              {t.label}
              {t.id === 'review' && reviewCount > 0 && <span className={`ml-1.5 px-1.5 rounded-full text-[10px] ${tab === t.id ? 'bg-white text-[#3C5A48]' : 'bg-[#C86D51] text-white'}`}>{reviewCount}</span>}
            </button>
          ))}
        </div>
      </div>

      {basics.loading && !basics.data ? <Spinner /> : basics.error ? <ErrorBlock message={basics.error} onRetry={basics.reload} /> : (
        <>
          {tab === 'home' && <FinanceHome onNavigate={onNavigate} />}
          {tab === 'transactions' && <Transactions key={JSON.stringify(params || {})} initial={params} />}
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
