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
