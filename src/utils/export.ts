import { Expense, Group, User } from '../types';
import { formatAmount } from './currency';

export function exportExpensesToCSV(
  expenses: Expense[],
  groups: Group[],
  users: User[],
  currency: string
) {
  // Define CSV headers
  const headers = [
    'Date',
    'Description',
    'Category',
    'Total Amount',
    'Currency',
    'Paid By',
    'Group',
    'Split Method',
    'Is Settlement',
  ];

  // Helper to map IDs to Names safely
  const getUserName = (id: string) => users.find(u => u.id === id)?.name || id;
  const getGroupName = (id: string | null) => {
    if (!id) return 'Non-group';
    return groups.find(g => g.id === id)?.name || id;
  };

  // Convert each expense to a row
  const rows = expenses.map(e => [
    e.date,
    `"${e.description.replace(/"/g, '""')}"`, // escape quotes for CSV
    e.category || 'other',
    formatAmount(e.amount, currency).replace(/,/g, ''), // remove commas from currency
    currency,
    `"${getUserName(e.paidBy)}"`,
    `"${getGroupName(e.groupId)}"`,
    e.splitMethod,
    e.isSettlement ? 'Yes' : 'No'
  ]);

  // Combine headers and rows
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  // Trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `tabby_expenses_export_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** CSV download from rows of cells (quotes and commas escaped). */
export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Trip summary export: personal payments on the trip plus the group's shared expenses. */
export function exportTripToCSV(trip: {
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  budgetPaise?: number | null;
  personal: { postedAt: string; merchant: string; amountPaise: number; category: string }[];
  shared: { date: string; description: string; amount: number; paidBy: string; category: string }[];
  perPerson: { name: string; paidPaise: number; sharePaise: number }[];
  totalPaise: number;
}) {
  const r = (p: number) => (p / 100).toFixed(2);
  const rows: (string | number)[][] = [
    ['Trip', trip.name],
    ['Dates', `${trip.startDate || ''} to ${trip.endDate || ''}`],
    ['Budget (INR)', trip.budgetPaise ? r(trip.budgetPaise) : ''],
    ['Total (INR)', r(trip.totalPaise)],
    [],
    ['Shared expenses'],
    ['Date', 'Description', 'Category', 'Amount (INR)', 'Paid by'],
    ...trip.shared.map((s) => [s.date, s.description, s.category, s.amount.toFixed(2), s.paidBy]),
    [],
    ['My personal payments'],
    ['Date', 'Merchant', 'Category', 'Amount (INR)'],
    ...trip.personal.map((p) => [p.postedAt.slice(0, 10), p.merchant, p.category, r(p.amountPaise)]),
    [],
    ['Per person (shared expenses)'],
    ['Name', 'Paid (INR)', 'Share (INR)', 'Balance (INR)'],
    ...trip.perPerson.map((p) => [p.name, r(p.paidPaise), r(p.sharePaise), r(p.paidPaise - p.sharePaise)]),
  ];
  downloadCSV(`tabby_trip_${trip.name.replace(/\W+/g, '_')}.csv`, rows);
}
