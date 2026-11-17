import React, { useEffect } from 'react';
import { ArrowLeft, Lock, LayoutGrid, Wallet, Shield, TrendingUp } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useFinanceStore } from './store';
import { financeApi } from './api';
import { ErrorBlock, Spinner, useAsync } from './components/ui';
import FinanceHome from './views/FinanceHome';
import Spending from './views/Spending';
import Transactions from './views/Transactions';
import ReviewQueue from './views/ReviewQueue';
import Accounts from './views/Accounts';
import Categories from './views/Categories';
import Commitments from './views/Commitments';
import Insurance, { PdfPasswords } from './views/Insurance';
import Investments from './views/Investments';
import Documents from './views/Documents';
import ImportView from './views/ImportView';
import Reports from './views/Reports';
import type { FinanceTab } from './types';

/** The four Money pages shown in the sidebar and on the phone. */
export const FINANCE_TABS: { id: FinanceTab; label: string; short: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Overview', short: 'Overview', icon: <LayoutGrid className="w-4 h-4" /> },
  { id: 'transactions', label: 'Spending', short: 'Spending', icon: <Wallet className="w-4 h-4" /> },
  { id: 'insurance', label: 'Insurance', short: 'Insurance', icon: <Shield className="w-4 h-4" /> },
  { id: 'investments', label: 'Investments', short: 'Investments', icon: <TrendingUp className="w-4 h-4" /> },
];

/** Pages opened from a main page (back goes there) or from Settings → Money. */
const SUB_PAGES: Partial<Record<FinanceTab, { title: string; parent: FinanceTab | 'settings' }>> = {
  review: { title: 'Needs your check', parent: 'transactions' },
  reports: { title: 'Year report', parent: 'transactions' },
  commitments: { title: 'Bills & EMIs', parent: 'transactions' },
  accounts: { title: 'Bank accounts & cards', parent: 'settings' },
  categories: { title: 'Categories & budgets', parent: 'settings' },
  import: { title: 'Import statements & Gmail', parent: 'settings' },
  documents: { title: 'Documents', parent: 'settings' },
  passwords: { title: 'PDF passwords', parent: 'settings' },
};

export default function FinanceApp({ tab, params, onNavigate, onOpenSettings }: {
  tab: FinanceTab;
  params?: Record<string, string>;
  onNavigate: (tab: FinanceTab, params?: Record<string, string>) => void;
  onOpenSettings?: () => void;
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

  const sub = SUB_PAGES[tab];
  const main = FINANCE_TABS.find((t) => t.id === tab);
  const goBack = () => (sub?.parent === 'settings' ? (onOpenSettings ? onOpenSettings() : onNavigate('home')) : onNavigate((sub?.parent as FinanceTab) || 'home'));

  return (
    <div className="flex flex-col gap-4">
      {sub ? (
        <div className="flex items-center gap-2" id="money-subpage-header">
          <button type="button" onClick={goBack} aria-label="Back" className="p-1.5 -ml-1.5 rounded-xl text-[#736F6A] hover:bg-[#EBF1ED] hover:text-[#2C2B29] cursor-pointer"><ArrowLeft className="w-5 h-5" /></button>
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-[#A39E98] uppercase tracking-wider">{sub.parent === 'settings' ? 'Settings · Money' : `Money · ${FINANCE_TABS.find((t) => t.id === sub.parent)?.label}`}</div>
            <h1 className="text-lg font-extrabold leading-tight truncate">{sub.title}</h1>
          </div>
        </div>
      ) : (
        <>
          <h1 className="text-xl font-extrabold">{main && tab !== 'home' ? main.label : 'Money'}</h1>
          {/* Phones: the four pages as one row of tabs. */}
          <nav className="sm:hidden grid grid-cols-4 gap-1.5" aria-label="Money sections" id="money-tabs-grid">
            {FINANCE_TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button key={t.id} type="button" onClick={() => onNavigate(t.id)} aria-current={active ? 'page' : undefined}
                  className={`relative flex flex-col items-center gap-1 py-2 rounded-xl border text-[10px] font-bold leading-tight cursor-pointer transition-colors ${active ? 'bg-[#3C5A48] text-white border-[#3C5A48]' : 'bg-white text-[#736F6A] border-[#E6E1DA]'}`}>
                  {t.icon}
                  <span className="truncate max-w-full px-0.5">{t.short}</span>
                  {t.id === 'transactions' && reviewCount > 0 && <span className={`absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full text-[9px] flex items-center justify-center ${active ? 'bg-white text-[#3C5A48]' : 'bg-[#C86D51] text-white'}`}>{reviewCount}</span>}
                </button>
              );
            })}
          </nav>
          {/* Larger screens: tabs as chips (the sidebar lists them too). */}
          <nav className="hidden sm:flex flex-wrap gap-1.5" aria-label="Money sections">
            {FINANCE_TABS.map((t) => (
              <button key={t.id} type="button" onClick={() => onNavigate(t.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border cursor-pointer transition-colors inline-flex items-center gap-1.5 ${tab === t.id ? 'bg-[#3C5A48] text-white border-[#3C5A48]' : 'bg-white text-[#736F6A] border-[#E6E1DA] hover:text-[#2C2B29]'}`}>
                {t.icon}{t.label}
                {t.id === 'transactions' && reviewCount > 0 && <span className={`ml-0.5 px-1.5 rounded-full text-[10px] ${tab === t.id ? 'bg-white text-[#3C5A48]' : 'bg-[#C86D51] text-white'}`}>{reviewCount}</span>}
              </button>
            ))}
          </nav>
        </>
      )}

      {basics.loading && !basics.data ? <Spinner /> : basics.error ? <ErrorBlock message={basics.error} onRetry={basics.reload} /> : (
        <>
          {tab === 'home' && <FinanceHome onNavigate={onNavigate} />}
          {tab === 'transactions' && <Spending key={JSON.stringify(params || {})} initial={params} onNavigate={onNavigate} />}
          {tab === 'insurance' && <Insurance />}
          {tab === 'investments' && <Investments />}
          {tab === 'reports' && <Reports onNavigate={onNavigate} />}
          {tab === 'review' && <ReviewQueue onNavigate={onNavigate} />}
          {tab === 'accounts' && <Accounts initial={params} />}
          {tab === 'commitments' && <Commitments />}
          {tab === 'documents' && <Documents />}
          {tab === 'categories' && <Categories />}
          {tab === 'import' && <ImportView onNavigate={onNavigate} />}
          {tab === 'passwords' && <PdfPasswords />}
        </>
      )}
    </div>
  );
}

/** Kept for links that still open the plain month list. */
export { Transactions };
