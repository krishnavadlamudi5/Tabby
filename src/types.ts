/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  friendIds?: string[];
}

export type GroupCategory = 'trip' | 'home' | 'couple' | 'other';

export interface Group {
  id: string;
  name: string;
  category: GroupCategory;
  members: string[]; // List of user IDs
  createdAt: string;
}

export type SplitMethod = 'equally' | 'exactly' | 'percentage';

export interface Split {
  userId: string;
  amount: number;
  percentage?: number; // Optional for tracking details
}

export type ExpenseCategory = 'food' | 'groceries' | 'rent' | 'transport' | 'utilities' | 'entertainment' | 'other';

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  paidBy: string; // User ID who paid
  groupId: string | null; // null means individual/non-group expense
  splits: Split[];
  splitMethod: SplitMethod;
  category?: ExpenseCategory;
  isSettlement: boolean; // True if this is a settle-up transaction
  createdBy: string; // User ID who created it
  createdAt: string;
}

export interface Debt {
  from: string; // User ID who owes
  to: string; // User ID who is owed
  amount: number;
}

export type ActivityType = 'expense_add' | 'expense_delete' | 'settlement' | 'group_create' | 'friend_add' | 'app_update';

export interface Activity {
  id: string;
  type: ActivityType;
  userId: string; // The user who did the action
  description: string; // e.g. "Alex added 'Dinner' in Trip"
  timestamp: string;
}
