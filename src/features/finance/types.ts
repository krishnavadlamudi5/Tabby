// Shapes returned by /api/finance. Money is always integer paise.

export type TxnKind = 'expense' | 'income' | 'refund' | 'self_transfer' | 'cc_bill_payment' | 'reversal' | 'fee' | 'investment' | 'emi';
export type TxnStatus = 'pending' | 'settled' | 'declined' | 'reversed';
export type Channel = 'card' | 'upi' | 'imps' | 'neft' | 'rtgs' | 'netbanking' | 'autodebit' | 'cash' | 'other';

export interface Account {
  id: string;
  name: string;
  institution: string;
  type: 'savings' | 'current' | 'credit_card' | 'loan' | 'investment' | 'wallet' | 'cash';
  last4: string;
  aliases: string[];
  cardLast4s: string[];
  ifsc: string;
  holderName: string;
  openingBalancePaise: number;
  currency: string;
  isActive: boolean;
  hasStatementPassword: boolean;
  balancePaise?: number;
  balanceAsOf?: string | null;
  lastStatementStatus?: 'parsed' | 'reconciled' | 'mismatch' | null;
  lastStatementEnd?: string | null;
  unreconciledCount?: number;
}

export interface SplitPart {
  categoryId: string | null;
  amountPaise: number;
  note?: string;
  lineItems?: { name: string; qty?: number; amountPaise?: number }[];
}

export interface Transaction {
  id: string;
  accountId: string | null;
  postedAt: string;
  amountPaise: number;
  direction: 'debit' | 'credit';
  currency: string;
  merchantRaw: string;
  merchant: string;
  description: string;
  channel: Channel;
  referenceIds: string[];
  kind: TxnKind;
  status: TxnStatus;
  expectedAt?: string;
  linkedTransactionId: string | null;
  categoryId: string | null;
  categorySource: string;
  splits: SplitPart[];
  tags: string[];
  tripId: string | null;
  sharedExpenseId: string | null;
  mySharePaise: number | null;
  notes: string;
  reconciled: boolean;
  source: string;
  sourceKinds: string[];
  counterpartyName: string;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  icon: string;
  color: string;
  kind: 'expense' | 'income' | 'transfer';
  isSystem: boolean;
  sortOrder: number;
  budgetPaise: number;
  key: string;
}

export interface Rule {
  id: string;
  match: { merchantContains?: string; senderEquals?: string; channel?: string; amountMinPaise?: number; amountMaxPaise?: number };
  action: { categoryId?: string; kind?: string; tags?: string[]; splitTemplateId?: string };
  priority: number;
  createdFrom: string;
  hits: number;
}

export interface SplitTemplate {
  id: string;
  name: string;
  parts: { categoryId: string; percent: number }[];
}

export interface ReviewEvent {
  id: string;
  source: string;
  sender: string;
  subject: string;
  receivedAt: string;
  detectedType: string;
  reason: string;
  reasonText: string;
  extracted: any;
  bodyPreview: string;
  transactions: Transaction[];
  attachments: { documentId: string; filename: string; mimeType: string }[];
}

export interface Statement {
  id: string;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  openingBalancePaise: number;
  closingBalancePaise: number;
  format: 'csv' | 'pdf';
  lineCount: number;
  matchedCount: number;
  createdCount: number;
  status: 'parsed' | 'reconciled' | 'mismatch';
  mismatchPaise: number;
  issues: { line: number; message: string; amountPaise?: number }[];
}

export interface Person {
  id: string;
  name: string;
  relation: string;
  dob?: string;
}

export type PolicyType = 'health' | 'term_life' | 'life' | 'vehicle' | 'home' | 'travel' | 'personal_accident' | 'other';

export interface Policy {
  id: string;
  insurer: string;
  policyNumber: string;
  type: PolicyType;
  planName: string;
  insuredMemberIds: string[];
  nominee: string;
  sumInsuredPaise: number;
  premiumPaise: number;
  premiumFrequency: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'single';
  paymentMode: string;
  startDate?: string;
  renewalDate?: string;
  termYears?: number;
  status: 'active' | 'renewal_due' | 'lapsed' | 'renewed' | 'cancelled';
  agent: { name?: string; phone?: string; email?: string };
  claimHelpline: string;
  tpa: string;
  taxSection: '80C' | '80D' | null;
  premiumTransactionIds: string[];
  documentIds: string[];
  notes: string;
  vehicleNumber: string;
  renewUrl: string;
  autoAdded: boolean;
  needsCheck: boolean;
}

export interface PolicyExtraction {
  insurer?: string;
  policyNumber?: string;
  type?: PolicyType;
  planName?: string;
  vehicleNumber?: string;
  sumInsuredPaise?: number;
  premiumPaise?: number;
  startDate?: string;
  endDate?: string;
  nominee?: string;
  found: string[];
  method: 'labels' | 'ai' | 'none';
}

export interface Claim {
  id: string;
  policyId: string;
  date: string;
  reason: string;
  claimedPaise: number;
  settledPaise: number;
  status: 'filed' | 'in_review' | 'settled' | 'rejected';
  notes: string;
}

export type DocumentType = 'policy' | 'renewal_notice' | 'premium_receipt' | 'tax_certificate' | 'claim' | 'statement' | 'invoice' | 'warranty' | 'loan' | 'id' | 'other';

export interface FinDocument {
  id: string;
  title: string;
  type: DocumentType;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  linkedTo: { kind: 'policy' | 'transaction' | 'trip' | 'claim' | 'statement'; id: string }[];
  source: 'upload' | 'gmail';
  expiresAt: string | null;
  createdAt: string;
}

export interface Commitment {
  id: string;
  type: 'emi' | 'sip' | 'subscription' | 'premium' | 'rent' | 'other';
  name: string;
  amountPaise: number;
  currency: string;
  schedule: { freq: 'weekly' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly'; dayOfMonth?: number; nextDueDate: string };
  accountId: string | null;
  matchRule: { merchantContains?: string; tolerancePct: number };
  status: 'paid' | 'due' | 'missed' | 'failed' | 'paused' | 'action_needed';
  statusNote: string;
  lastPaidAt?: string;
  policyId: string | null;
  source: string;
}

export interface Alert {
  id: string;
  type: string;
  title: string;
  body: string;
  dueAt?: string;
  entity: { kind: string; id: string } | null;
  readAt: string | null;
  createdAt: string;
}

export interface Dashboard {
  month: string;
  spendPaise: number;
  previousMonth: string;
  previousSpendPaise: number;
  byCategory: { categoryId: string | null; name: string; color: string; icon: string; amountPaise: number }[];
  budgets: { categoryId: string; name: string; color: string; budgetPaise: number; spentPaise: number }[];
  groceries: null | {
    totalPaise: number;
    breakdown: { id: string; name: string; color: string; amountPaise: number }[];
    trend: { month: string; amountPaise: number }[];
  };
  upcoming: { kind: 'commitment' | 'policy'; id: string; type: string; name: string; amountPaise: number; currency: string; dueDate: string; status: string }[];
  pendingRefunds: { id: string; merchant: string; amountPaise: number; expectedAt: string | null; overdue: boolean }[];
  review: { events: number; uncategorised: number; statements: number; total: number };
  unreconciledAccounts: { accountId: string; name: string; unreconciledCount: number; lastStatementStatus: string | null }[];
  unreadAlerts: number;
}

/** Main pages (in the sidebar) and the pages opened from them or from Settings. */
export type FinanceTab =
  | 'home' | 'transactions' | 'insurance' | 'investments'
  | 'reports' | 'review' | 'accounts' | 'commitments' | 'documents' | 'categories' | 'import' | 'passwords';

export interface SpendingSummary {
  from: string;
  to: string;
  days: number;
  granularity: 'day' | 'month';
  spendPaise: number;
  incomePaise: number;
  previous: { from: string; to: string; spendPaise: number };
  byCategory: { categoryId: string | null; key: string; name: string; color: string; icon: string; amountPaise: number; children: { categoryId: string; name: string; amountPaise: number }[] }[];
  trend: { key: string; spendPaise: number }[];
  budget: { monthlyPaise: number; budgetPaise: number; spentPaise: number } | null;
  categoryBudgets: { categoryId: string; name: string; color: string; monthlyPaise: number; budgetPaise: number; spentPaise: number }[];
  topMerchants: { name: string; amountPaise: number; count: number }[];
}

export type HoldingType = 'mutual_fund' | 'stock' | 'fd' | 'rd' | 'ppf' | 'epf' | 'nps' | 'gold' | 'bond' | 'real_estate' | 'crypto' | 'other';

export interface Holding {
  id: string;
  name: string;
  type: HoldingType;
  provider: string;
  reference: string;
  investedPaise: number;
  currentValuePaise: number;
  valueAsOf: string;
  startDate?: string | null;
  maturityDate?: string | null;
  interestRatePct?: number | null;
  commitmentId: string | null;
  history: { date: string; investedPaise: number; valuePaise: number }[];
  notes: string;
  isActive: boolean;
}

export interface InvestmentSummary {
  totals: { investedPaise: number; valuePaise: number; gainPaise: number; gainPct: number | null; sipMonthlyPaise: number; putInThisMonthPaise: number; putInLast12Paise: number };
  byType: { type: HoldingType; investedPaise: number; valuePaise: number; count: number }[];
  timeline: { month: string; investedPaise: number; valuePaise: number; putInPaise: number }[];
  holdings: Holding[];
  sips: Commitment[];
}

export interface PremiumSummary {
  basis: 'calendar' | 'fy';
  years: string[];
  rows: { policyId: string; insurer: string; type: PolicyType; planName: string; vehicleNumber: string; status: string; members: { id: string; name: string; relation: string }[]; byYear: Record<string, number>; total: number; annualPremiumPaise: number; premiumFrequency: string }[];
  totalsByYear: Record<string, number>;
  byType: Record<string, Record<string, number>>;
  byPerson: Record<string, Record<string, number>>;
  grandTotal: number;
}

export interface YearReport {
  year: number;
  basis: 'calendar' | 'fy';
  label: string;
  months: { key: string; spendPaise: number; incomePaise: number }[];
  categories: { categoryId: string | null; name: string; color: string; perMonth: Record<string, number>; total: number }[];
  years: { label: string; spendPaise: number; incomePaise: number }[];
  totalSpendPaise: number;
  totalIncomePaise: number;
}
