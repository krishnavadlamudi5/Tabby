import { apiDownload, apiRequest } from '../../lib/api';
import type {
  Account, Alert, Category, Claim, Commitment, Dashboard, FinDocument, Holding, InvestmentSummary, Person, SpendingSummary, Policy, PolicyExtraction, PremiumSummary, ReviewEvent, YearReport, Rule, SplitTemplate, Statement, Transaction,
} from './types';

const F = '/finance';

export interface GmailStatus {
  available: boolean;
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  imported: number;
  lastError: string | null;
  backfillDays: number;
}
const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? `?${p.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};

export interface TxnFilters {
  month?: string;
  /** India dates YYYY-MM-DD, both inclusive. */
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  kind?: string;
  status?: string;
  tag?: string;
  tripId?: string;
  q?: string;
  includeExcluded?: boolean;
  cursor?: string;
  limit?: number;
}

export const financeApi = {
  dashboard: (month: string) => apiRequest<Dashboard & { success: boolean }>(`${F}/dashboard${qs({ month })}`),

  transactions: (f: TxnFilters) => apiRequest<{ transactions: Transaction[]; nextCursor: string | null; totals: { count: number; debitPaise: number; creditPaise: number; spendPaise: number } }>(`${F}/transactions${qs({ ...f })}`),
  transaction: (id: string) => apiRequest<{ transaction: Transaction; linked: Transaction | null; sources: { id: string; source: string; sender: string; subject: string; receivedAt: string; parser: string; status: string; lineItems?: any[] }[]; documents: FinDocument[] }>(`${F}/transactions/${id}`),
  createTransaction: (body: Record<string, unknown>) => apiRequest<{ transaction: Transaction }>(`${F}/transactions`, { method: 'POST', body }),
  updateTransaction: (id: string, body: Record<string, unknown>) => apiRequest<{ transaction: Transaction }>(`${F}/transactions/${id}`, { method: 'PATCH', body }),
  deleteTransaction: (id: string) => apiRequest(`${F}/transactions/${id}`, { method: 'DELETE' }),
  saveSplits: (id: string, body: Record<string, unknown>) => apiRequest<{ transaction: Transaction }>(`${F}/transactions/${id}/splits`, { method: 'PUT', body }),
  autoSplit: (id: string) => apiRequest<{ transaction: Transaction }>(`${F}/transactions/${id}/auto-split`, { method: 'POST', body: {} }),
  link: (id: string, otherId: string | null) => apiRequest<{ transaction: Transaction }>(`${F}/transactions/${id}/link`, { method: 'POST', body: { otherId } }),
  share: (id: string, body: Record<string, unknown>) => apiRequest<{ transaction: Transaction }>(`${F}/transactions/${id}/share`, { method: 'POST', body }),

  accounts: () => apiRequest<{ accounts: Account[] }>(`${F}/accounts`),
  createAccount: (body: Record<string, unknown>) => apiRequest<{ account: Account }>(`${F}/accounts`, { method: 'POST', body }),
  updateAccount: (id: string, body: Record<string, unknown>) => apiRequest<{ account: Account }>(`${F}/accounts/${id}`, { method: 'PATCH', body }),
  deleteAccount: (id: string) => apiRequest<{ archived?: boolean; deleted?: boolean }>(`${F}/accounts/${id}`, { method: 'DELETE' }),
  setStatementPassword: (id: string, password: string) => apiRequest(`${F}/accounts/${id}/statement-password`, { method: 'PUT', body: { password } }),

  statements: (accountId?: string) => apiRequest<{ statements: Statement[] }>(`${F}/statements${qs({ accountId })}`),
  uploadStatement: (form: FormData) => apiRequest<{ statementId: string; status: string; lineCount: number; matchedCount: number; createdCount: number; mismatchPaise: number; issues: Statement['issues'] }>(`${F}/statements/upload`, { method: 'POST', body: form }),
  reconciliation: (id: string) => apiRequest<{ statement: Statement; unmatchedTransactions: Transaction[] }>(`${F}/statements/${id}/reconciliation`),

  categories: () => apiRequest<{ categories: Category[] }>(`${F}/categories`),
  createCategory: (body: Record<string, unknown>) => apiRequest<{ category: Category }>(`${F}/categories`, { method: 'POST', body }),
  updateCategory: (id: string, body: Record<string, unknown>) => apiRequest<{ category: Category }>(`${F}/categories/${id}`, { method: 'PATCH', body }),
  deleteCategory: (id: string) => apiRequest(`${F}/categories/${id}`, { method: 'DELETE' }),
  reorderCategories: (ids: string[]) => apiRequest(`${F}/categories/reorder`, { method: 'POST', body: { ids } }),

  rules: () => apiRequest<{ rules: Rule[] }>(`${F}/rules`),
  createRule: (body: Record<string, unknown>) => apiRequest<{ rule: Rule }>(`${F}/rules`, { method: 'POST', body }),
  deleteRule: (id: string) => apiRequest(`${F}/rules/${id}`, { method: 'DELETE' }),

  templates: () => apiRequest<{ templates: SplitTemplate[] }>(`${F}/split-templates`),
  createTemplate: (body: Record<string, unknown>) => apiRequest<{ template: SplitTemplate }>(`${F}/split-templates`, { method: 'POST', body }),
  deleteTemplate: (id: string) => apiRequest(`${F}/split-templates/${id}`, { method: 'DELETE' }),

  review: () => apiRequest<{ counts: { events: number; uncategorised: number; statements: number }; events: ReviewEvent[]; uncategorised: Transaction[]; statements: Statement[] }>(`${F}/review`),
  confirmReview: (id: string, body: Record<string, unknown>) => apiRequest(`${F}/review/${id}/confirm`, { method: 'POST', body }),
  ignoreReview: (id: string) => apiRequest(`${F}/review/${id}/ignore`, { method: 'POST', body: {} }),
  ignoreSender: (id: string) => apiRequest(`${F}/review/${id}/ignore-sender`, { method: 'POST', body: {} }),
  ruleFromReview: (id: string, body: Record<string, unknown>) => apiRequest(`${F}/review/${id}/rule`, { method: 'POST', body }),

  ingestStatus: () => apiRequest<{ configured: boolean; isIngestOwner: boolean; lastReceivedAt: string | null; lastSubject: string | null; emailsThisWeek: number; emailsTotal: number; needsReview: number; features: { encryption: boolean; documentsStorage: string; aiBackup: boolean; alertEmails: boolean } }>(`${F}/ingest/status`),
  gmailStatus: () => apiRequest<GmailStatus>(`${F}/gmail`),
  gmailConnect: () => apiRequest<{ url: string }>(`${F}/gmail/connect`, { method: 'POST', body: {} }),
  gmailSync: () => apiRequest<{ checked: number; imported: number; remaining: number; error?: string }>(`${F}/gmail/sync`, { method: 'POST', body: {} }),
  gmailDisconnect: () => apiRequest<{ success: boolean }>(`${F}/gmail`, { method: 'DELETE' }),
  ingestManual: (body: Record<string, unknown>) => apiRequest<{ status: string; reviewReason?: string; transactionIds: string[]; detectedType: string }>(`${F}/ingest/manual`, { method: 'POST', body }),

  policies: () => apiRequest<{ policies: Policy[] }>(`${F}/policies`),
  policy: (id: string) => apiRequest<{ policy: Policy; members: Person[]; premiums: Transaction[]; documents: FinDocument[]; claims: Claim[] }>(`${F}/policies/${id}`),
  createPolicy: (body: Record<string, unknown>) => apiRequest<{ policy: Policy }>(`${F}/policies`, { method: 'POST', body }),
  updatePolicy: (id: string, body: Record<string, unknown>) => apiRequest<{ policy: Policy }>(`${F}/policies/${id}`, { method: 'PATCH', body }),
  deletePolicy: (id: string) => apiRequest(`${F}/policies/${id}`, { method: 'DELETE' }),
  extractPolicy: (body: { text?: string; sender?: string; subject?: string; rawEventId?: string }) => apiRequest<{ extraction: PolicyExtraction; attachments?: { documentId?: string; filename: string; mimeType: string }[]; aiAvailable?: boolean }>(`${F}/policies/extract`, { method: 'POST', body }),
  docPasswords: () => apiRequest<{ passwords: { id: string; label: string }[] }>(`${F}/doc-passwords`),
  addDocPassword: (label: string, password: string) => apiRequest(`${F}/doc-passwords`, { method: 'POST', body: { label, password } }),
  deleteDocPassword: (id: string) => apiRequest(`${F}/doc-passwords/${id}`, { method: 'DELETE' }),
  premiumSummary: (basis: 'fy' | 'calendar', years = 4) => apiRequest<PremiumSummary>(`${F}/policies/premium-summary${qs({ basis, years })}`),
  addPremiumPayment: (id: string, body: Record<string, unknown>) => apiRequest(`${F}/policies/${id}/payments`, { method: 'POST', body }),
  removePremiumPayment: (id: string, txnId: string) => apiRequest(`${F}/policies/${id}/payments/${txnId}`, { method: 'DELETE' }),
  yearReport: (year: number, basis: 'fy' | 'calendar') => apiRequest<YearReport>(`${F}/reports/year${qs({ year, basis })}`),
  linkPremiums: (id: string) => apiRequest<{ linked: number }>(`${F}/policies/${id}/link-premiums`, { method: 'POST', body: {} }),
  tax: (fy?: string) => apiRequest<{ fy: string; rows: { policyId: string; insurer: string; planName: string; section: string; paidPaise: number; payments: number }[]; totals: { '80C': number; '80D': number } }>(`${F}/policies/tax${qs({ fy })}`),
  people: () => apiRequest<{ people: Person[] }>(`${F}/people`),
  createPerson: (body: Record<string, unknown>) => apiRequest<{ person: Person }>(`${F}/people`, { method: 'POST', body }),
  deletePerson: (id: string) => apiRequest(`${F}/people/${id}`, { method: 'DELETE' }),
  createClaim: (body: Record<string, unknown>) => apiRequest<{ claim: Claim }>(`${F}/claims`, { method: 'POST', body }),
  updateClaim: (id: string, body: Record<string, unknown>) => apiRequest<{ claim: Claim }>(`${F}/claims/${id}`, { method: 'PATCH', body }),
  deleteClaim: (id: string) => apiRequest(`${F}/claims/${id}`, { method: 'DELETE' }),

  documents: (f: { q?: string; type?: string; linkKind?: string; linkId?: string; expiring?: string } = {}) => apiRequest<{ documents: FinDocument[] }>(`${F}/documents${qs(f)}`),
  uploadDocument: (form: FormData) => apiRequest<{ document: FinDocument; existed: boolean }>(`${F}/documents`, { method: 'POST', body: form }),
  updateDocument: (id: string, body: Record<string, unknown>) => apiRequest<{ document: FinDocument }>(`${F}/documents/${id}`, { method: 'PATCH', body }),
  deleteDocument: (id: string) => apiRequest(`${F}/documents/${id}`, { method: 'DELETE' }),
  downloadDocument: (id: string) => apiDownload(`${F}/documents/${id}/download`),

  commitments: () => apiRequest<{ commitments: Commitment[] }>(`${F}/commitments`),
  commitmentSuggestions: () => apiRequest<{ suggestions: { name: string; merchantContains: string; amountPaise: number; dayOfMonth: number; months: string[] }[] }>(`${F}/commitments/suggestions`),
  createCommitment: (body: Record<string, unknown>) => apiRequest<{ commitment: Commitment }>(`${F}/commitments`, { method: 'POST', body }),
  updateCommitment: (id: string, body: Record<string, unknown>) => apiRequest<{ commitment: Commitment }>(`${F}/commitments/${id}`, { method: 'PATCH', body }),
  deleteCommitment: (id: string) => apiRequest(`${F}/commitments/${id}`, { method: 'DELETE' }),

  alerts: () => apiRequest<{ alerts: Alert[]; unread: number }>(`${F}/alerts`),
  readAlert: (id: string) => apiRequest(`${F}/alerts/${id}/read`, { method: 'POST', body: {} }),
  readAllAlerts: () => apiRequest(`${F}/alerts/read-all`, { method: 'POST', body: {} }),

  trip: (groupId: string) => apiRequest<{ group: any; personal: Transaction[]; suggestions: Transaction[]; summary: { totalPaise: number; sharedPaise: number; myPersonalPaise: number; budgetPaise: number | null; remainingPaise: number | null; byCategory: { name: string; amountPaise: number }[]; perPerson: { userId: string; paidPaise: number; sharePaise: number }[] } }>(`${F}/trips/${encodeURIComponent(groupId)}`),
  updateTrip: (groupId: string, body: Record<string, unknown>) => apiRequest<{ group: any }>(`${F}/trips/${encodeURIComponent(groupId)}`, { method: 'PATCH', body }),

  spending: (from: string, to: string) => apiRequest<SpendingSummary>(`${F}/spending${qs({ from, to })}`),
  investments: () => apiRequest<InvestmentSummary>(`${F}/investments`),
  createHolding: (body: Record<string, unknown>) => apiRequest<{ holding: Holding }>(`${F}/investments`, { method: 'POST', body }),
  updateHolding: (id: string, body: Record<string, unknown>) => apiRequest<{ holding: Holding }>(`${F}/investments/${id}`, { method: 'PATCH', body }),
  deleteHolding: (id: string) => apiRequest(`${F}/investments/${id}`, { method: 'DELETE' }),

  exportAll: () => apiDownload(`${F}/export`),
};

/** Saves a Blob as a file (browser download; best effort inside the Android WebView). */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
