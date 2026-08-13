/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, Group, Expense, Activity } from '../types';

export const DEMO_USERS: User[] = [
  {
    id: 'user-alex',
    name: 'Alex (You)',
    email: 'alex.split@gmail.com',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80',
  },
  {
    id: 'user-sarah',
    name: 'Sarah Chen',
    email: 'sarah.c@gmail.com',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80',
  },
  {
    id: 'user-david',
    name: 'David Kim',
    email: 'david.k@gmail.com',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80',
  },
  {
    id: 'user-emily',
    name: 'Emily Watson',
    email: 'emily.w@gmail.com',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&h=150&q=80',
  },
  {
    id: 'user-ryan',
    name: 'Ryan Gallagher',
    email: 'ryan.g@gmail.com',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80',
  },
];

export const DEMO_GROUPS: Group[] = [
  {
    id: 'group-apt',
    name: 'Apartment 4B',
    category: 'home',
    members: ['user-alex', 'user-sarah', 'user-david'],
    createdAt: '2026-08-01T12:00:00Z',
  },
  {
    id: 'group-trip',
    name: 'Summer Cabin 2026',
    category: 'trip',
    members: ['user-alex', 'user-sarah', 'user-emily', 'user-ryan'],
    createdAt: '2026-08-05T09:30:00Z',
  },
];

export const DEMO_EXPENSES: Expense[] = [
  // Apartment Expenses
  {
    id: 'exp-1',
    description: 'August Rent',
    amount: 1500,
    date: '2026-08-01',
    paidBy: 'user-alex', // Alex paid
    groupId: 'group-apt',
    splitMethod: 'equally',
    isSettlement: false,
    createdBy: 'user-alex',
    createdAt: '2026-08-01T12:05:00Z',
    splits: [
      { userId: 'user-alex', amount: 500 },
      { userId: 'user-sarah', amount: 500 },
      { userId: 'user-david', amount: 500 },
    ],
  },
  {
    id: 'exp-2',
    description: 'Electricity & Gas Bill',
    amount: 90,
    date: '2026-08-03',
    paidBy: 'user-sarah', // Sarah paid
    groupId: 'group-apt',
    splitMethod: 'equally',
    isSettlement: false,
    createdBy: 'user-sarah',
    createdAt: '2026-08-03T15:40:00Z',
    splits: [
      { userId: 'user-alex', amount: 30 },
      { userId: 'user-sarah', amount: 30 },
      { userId: 'user-david', amount: 30 },
    ],
  },
  {
    id: 'exp-3',
    description: 'Toiletries & Cleaning supplies',
    amount: 15,
    date: '2026-08-04',
    paidBy: 'user-david', // David paid
    groupId: 'group-apt',
    splitMethod: 'equally',
    isSettlement: false,
    createdBy: 'user-david',
    createdAt: '2026-08-04T18:12:00Z',
    splits: [
      { userId: 'user-alex', amount: 5 },
      { userId: 'user-sarah', amount: 5 },
      { userId: 'user-david', amount: 5 },
    ],
  },

  // Summer Cabin Expenses
  {
    id: 'exp-4',
    description: 'Cabin Rental Deposit',
    amount: 800,
    date: '2026-08-05',
    paidBy: 'user-alex', // Alex paid
    groupId: 'group-trip',
    splitMethod: 'equally',
    isSettlement: false,
    createdBy: 'user-alex',
    createdAt: '2026-08-05T10:00:00Z',
    splits: [
      { userId: 'user-alex', amount: 200 },
      { userId: 'user-sarah', amount: 200 },
      { userId: 'user-emily', amount: 200 },
      { userId: 'user-ryan', amount: 200 },
    ],
  },
  {
    id: 'exp-5',
    description: 'Grocery Run & BBQ Food',
    amount: 160,
    date: '2026-08-06',
    paidBy: 'user-emily', // Emily paid
    groupId: 'group-trip',
    splitMethod: 'equally',
    isSettlement: false,
    createdBy: 'user-emily',
    createdAt: '2026-08-06T14:30:00Z',
    splits: [
      { userId: 'user-alex', amount: 40 },
      { userId: 'user-sarah', amount: 40 },
      { userId: 'user-emily', amount: 40 },
      { userId: 'user-ryan', amount: 40 },
    ],
  },
  {
    id: 'exp-6',
    description: 'Highway Gas & Tolls',
    amount: 40,
    date: '2026-08-07',
    paidBy: 'user-ryan', // Ryan paid
    groupId: 'group-trip',
    splitMethod: 'equally',
    isSettlement: false,
    createdBy: 'user-ryan',
    createdAt: '2026-08-07T11:15:00Z',
    splits: [
      { userId: 'user-alex', amount: 10 },
      { userId: 'user-sarah', amount: 10 },
      { userId: 'user-emily', amount: 10 },
      { userId: 'user-ryan', amount: 10 },
    ],
  },

  // Non-group individual expense
  {
    id: 'exp-7',
    description: 'Friday Movie Night & Pizza',
    amount: 60,
    date: '2026-08-08',
    paidBy: 'user-alex', // Alex paid
    groupId: null, // Non-group
    splitMethod: 'equally',
    isSettlement: false,
    createdBy: 'user-alex',
    createdAt: '2026-08-08T22:30:00Z',
    splits: [
      { userId: 'user-alex', amount: 30 },
      { userId: 'user-sarah', amount: 30 },
    ],
  },
];

export const DEMO_ACTIVITIES: Activity[] = [
  {
    id: 'act-1',
    type: 'group_create',
    userId: 'user-alex',
    description: 'created the group "Apartment 4B"',
    timestamp: '2026-08-01T12:00:00Z',
  },
  {
    id: 'act-2',
    type: 'expense_add',
    userId: 'user-alex',
    description: 'added "August Rent" ($1,500.00) in "Apartment 4B"',
    timestamp: '2026-08-01T12:05:00Z',
  },
  {
    id: 'act-3',
    type: 'expense_add',
    userId: 'user-sarah',
    description: 'added "Electricity & Gas Bill" ($90.00) in "Apartment 4B"',
    timestamp: '2026-08-03T15:40:00Z',
  },
  {
    id: 'act-4',
    type: 'expense_add',
    userId: 'user-david',
    description: 'added "Toiletries & Cleaning supplies" ($15.00) in "Apartment 4B"',
    timestamp: '2026-08-04T18:12:00Z',
  },
  {
    id: 'act-5',
    type: 'group_create',
    userId: 'user-alex',
    description: 'created the group "Summer Cabin 2026"',
    timestamp: '2026-08-05T09:30:00Z',
  },
  {
    id: 'act-6',
    type: 'expense_add',
    userId: 'user-alex',
    description: 'added "Cabin Rental Deposit" ($800.00) in "Summer Cabin 2026"',
    timestamp: '2026-08-05T10:00:00Z',
  },
  {
    id: 'act-7',
    type: 'expense_add',
    userId: 'user-emily',
    description: 'added "Grocery Run & BBQ Food" ($160.00) in "Summer Cabin 2026"',
    timestamp: '2026-08-06T14:30:00Z',
  },
  {
    id: 'act-8',
    type: 'expense_add',
    userId: 'user-ryan',
    description: 'added "Highway Gas & Tolls" ($40.00) in "Summer Cabin 2026"',
    timestamp: '2026-08-07T11:15:00Z',
  },
  {
    id: 'act-9',
    type: 'expense_add',
    userId: 'user-alex',
    description: 'added "Friday Movie Night & Pizza" ($60.00) outside of any group',
    timestamp: '2026-08-08T22:30:00Z',
  },
];
