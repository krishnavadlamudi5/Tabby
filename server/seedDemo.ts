import { User } from './models/User';
import { Group } from './models/Group';
import { Expense } from './models/Expense';
import { Activity } from './models/Activity';

export const DEMO_USERS_SEED = [
  {
    id: 'user-alex',
    name: 'Alex Morgan',
    email: 'alex.split@gmail.com',
    phone: '+15550199',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80',
    friendIds: ['user-sarah', 'user-david', 'user-emily', 'user-ryan'],
    createdAt: '2026-08-01T10:00:00Z',
  },
  {
    id: 'user-sarah',
    name: 'Sara Chen',
    email: 'sarah.c@gmail.com',
    phone: '+15550288',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80',
    friendIds: ['user-alex', 'user-david', 'user-emily', 'user-ryan'],
    createdAt: '2026-08-01T10:05:00Z',
  },
  {
    id: 'user-david',
    name: 'David Kim',
    email: 'david.k@gmail.com',
    phone: '+15550377',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80',
    friendIds: ['user-alex', 'user-sarah'],
    createdAt: '2026-08-01T10:10:00Z',
  },
  {
    id: 'user-emily',
    name: 'Emily Watson',
    email: 'emily.w@gmail.com',
    phone: '+15550466',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&h=150&q=80',
    friendIds: ['user-alex', 'user-sarah', 'user-ryan'],
    createdAt: '2026-08-01T10:15:00Z',
  },
  {
    id: 'user-ryan',
    name: 'Ryan Gallagher',
    email: 'ryan.g@gmail.com',
    phone: '+15550555',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80',
    friendIds: ['user-alex', 'user-sarah', 'user-emily'],
    createdAt: '2026-08-01T10:20:00Z',
  },
];

export const DEMO_GROUPS_SEED = [
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
  {
    id: 'group-foodies',
    name: 'Weekend Foodies Club',
    category: 'other',
    members: ['user-alex', 'user-sarah', 'user-david', 'user-emily'],
    createdAt: '2026-08-08T18:00:00Z',
  },
];

export const DEMO_EXPENSES_SEED = [
  // --- Group: Apartment 4B ---
  {
    id: 'exp-1',
    description: 'August Rent',
    amount: 1500,
    date: '2026-08-01',
    paidBy: 'user-alex',
    groupId: 'group-apt',
    splitMethod: 'equally',
    category: 'rent',
    isSettlement: false,
    createdBy: 'user-alex',
    createdAt: '2026-08-01T12:05:00Z',
    involvedUserIds: ['user-alex', 'user-sarah', 'user-david'],
    splits: [
      { userId: 'user-alex', amount: 500 },
      { userId: 'user-sarah', amount: 500 },
      { userId: 'user-david', amount: 500 },
    ],
  },
  {
    id: 'exp-2',
    description: 'Electricity & AC Bill',
    amount: 120,
    date: '2026-08-03',
    paidBy: 'user-sarah',
    groupId: 'group-apt',
    splitMethod: 'equally',
    category: 'utilities',
    isSettlement: false,
    createdBy: 'user-sarah',
    createdAt: '2026-08-03T15:40:00Z',
    involvedUserIds: ['user-alex', 'user-sarah', 'user-david'],
    splits: [
      { userId: 'user-alex', amount: 40 },
      { userId: 'user-sarah', amount: 40 },
      { userId: 'user-david', amount: 40 },
    ],
  },
  {
    id: 'exp-3',
    description: 'High-Speed Fiber Internet',
    amount: 60,
    date: '2026-08-04',
    paidBy: 'user-alex',
    groupId: 'group-apt',
    splitMethod: 'equally',
    category: 'utilities',
    isSettlement: false,
    createdBy: 'user-alex',
    createdAt: '2026-08-04T10:15:00Z',
    involvedUserIds: ['user-alex', 'user-sarah', 'user-david'],
    splits: [
      { userId: 'user-alex', amount: 20 },
      { userId: 'user-sarah', amount: 20 },
      { userId: 'user-david', amount: 20 },
    ],
  },
  {
    id: 'exp-4',
    description: 'Groceries & Kitchen Supplies',
    amount: 90,
    date: '2026-08-05',
    paidBy: 'user-david',
    groupId: 'group-apt',
    splitMethod: 'equally',
    category: 'groceries',
    isSettlement: false,
    createdBy: 'user-david',
    createdAt: '2026-08-05T18:12:00Z',
    involvedUserIds: ['user-alex', 'user-sarah', 'user-david'],
    splits: [
      { userId: 'user-alex', amount: 30 },
      { userId: 'user-sarah', amount: 30 },
      { userId: 'user-david', amount: 30 },
    ],
  },

  // --- Group: Summer Cabin 2026 ---
  {
    id: 'exp-5',
    description: 'Lake Cabin Rental Deposit',
    amount: 800,
    date: '2026-08-05',
    paidBy: 'user-alex',
    groupId: 'group-trip',
    splitMethod: 'equally',
    category: 'rent',
    isSettlement: false,
    createdBy: 'user-alex',
    createdAt: '2026-08-05T10:00:00Z',
    involvedUserIds: ['user-alex', 'user-sarah', 'user-emily', 'user-ryan'],
    splits: [
      { userId: 'user-alex', amount: 200 },
      { userId: 'user-sarah', amount: 200 },
      { userId: 'user-emily', amount: 200 },
      { userId: 'user-ryan', amount: 200 },
    ],
  },
  {
    id: 'exp-6',
    description: 'BBQ Food & Drinks',
    amount: 160,
    date: '2026-08-06',
    paidBy: 'user-emily',
    groupId: 'group-trip',
    splitMethod: 'equally',
    category: 'food',
    isSettlement: false,
    createdBy: 'user-emily',
    createdAt: '2026-08-06T14:30:00Z',
    involvedUserIds: ['user-alex', 'user-sarah', 'user-emily', 'user-ryan'],
    splits: [
      { userId: 'user-alex', amount: 40 },
      { userId: 'user-sarah', amount: 40 },
      { userId: 'user-emily', amount: 40 },
      { userId: 'user-ryan', amount: 40 },
    ],
  },
  {
    id: 'exp-7',
    description: 'Highway Tolls & Fuel',
    amount: 48,
    date: '2026-08-07',
    paidBy: 'user-ryan',
    groupId: 'group-trip',
    splitMethod: 'equally',
    category: 'transport',
    isSettlement: false,
    createdBy: 'user-ryan',
    createdAt: '2026-08-07T11:15:00Z',
    involvedUserIds: ['user-alex', 'user-sarah', 'user-emily', 'user-ryan'],
    splits: [
      { userId: 'user-alex', amount: 12 },
      { userId: 'user-sarah', amount: 12 },
      { userId: 'user-emily', amount: 12 },
      { userId: 'user-ryan', amount: 12 },
    ],
  },
  {
    id: 'exp-8',
    description: 'Kayak & Paddleboard Rentals',
    amount: 120,
    date: '2026-08-08',
    paidBy: 'user-sarah',
    groupId: 'group-trip',
    splitMethod: 'equally',
    category: 'entertainment',
    isSettlement: false,
    createdBy: 'user-sarah',
    createdAt: '2026-08-08T16:20:00Z',
    involvedUserIds: ['user-alex', 'user-sarah', 'user-emily', 'user-ryan'],
    splits: [
      { userId: 'user-alex', amount: 30 },
      { userId: 'user-sarah', amount: 30 },
      { userId: 'user-emily', amount: 30 },
      { userId: 'user-ryan', amount: 30 },
    ],
  },

  // --- Group: Weekend Foodies Club ---
  {
    id: 'exp-9',
    description: 'Sunday Brunch Buffet',
    amount: 100,
    date: '2026-08-09',
    paidBy: 'user-alex',
    groupId: 'group-foodies',
    splitMethod: 'equally',
    category: 'food',
    isSettlement: false,
    createdBy: 'user-alex',
    createdAt: '2026-08-09T13:00:00Z',
    involvedUserIds: ['user-alex', 'user-sarah', 'user-david', 'user-emily'],
    splits: [
      { userId: 'user-alex', amount: 25 },
      { userId: 'user-sarah', amount: 25 },
      { userId: 'user-david', amount: 25 },
      { userId: 'user-emily', amount: 25 },
    ],
  },
  {
    id: 'exp-10',
    description: 'Artisan Pastries & Coffee',
    amount: 40,
    date: '2026-08-10',
    paidBy: 'user-sarah',
    groupId: 'group-foodies',
    splitMethod: 'equally',
    category: 'food',
    isSettlement: false,
    createdBy: 'user-sarah',
    createdAt: '2026-08-10T11:45:00Z',
    involvedUserIds: ['user-alex', 'user-sarah', 'user-david', 'user-emily'],
    splits: [
      { userId: 'user-alex', amount: 10 },
      { userId: 'user-sarah', amount: 10 },
      { userId: 'user-david', amount: 10 },
      { userId: 'user-emily', amount: 10 },
    ],
  },

  // --- Non-Group / Direct Friend Expenses ---
  {
    id: 'exp-11',
    description: 'Friday Movie Tickets & Popcorn',
    amount: 44,
    date: '2026-08-11',
    paidBy: 'user-alex',
    groupId: null,
    splitMethod: 'equally',
    category: 'entertainment',
    isSettlement: false,
    createdBy: 'user-alex',
    createdAt: '2026-08-11T21:30:00Z',
    involvedUserIds: ['user-alex', 'user-sarah'],
    splits: [
      { userId: 'user-alex', amount: 22 },
      { userId: 'user-sarah', amount: 22 },
    ],
  },
  {
    id: 'exp-12',
    description: 'Uber Ride to Downtown',
    amount: 26,
    date: '2026-08-12',
    paidBy: 'user-sarah',
    groupId: null,
    splitMethod: 'equally',
    category: 'transport',
    isSettlement: false,
    createdBy: 'user-sarah',
    createdAt: '2026-08-12T23:15:00Z',
    involvedUserIds: ['user-alex', 'user-sarah'],
    splits: [
      { userId: 'user-alex', amount: 13 },
      { userId: 'user-sarah', amount: 13 },
    ],
  },

  // --- Settlement Expense ---
  {
    id: 'settle-1',
    description: 'Settle Up Payment',
    amount: 100,
    date: '2026-08-13',
    paidBy: 'user-sarah',
    groupId: null,
    splitMethod: 'equally',
    category: 'other',
    isSettlement: true,
    createdBy: 'user-sarah',
    createdAt: '2026-08-13T16:00:00Z',
    involvedUserIds: ['user-sarah', 'user-alex'],
    splits: [
      { userId: 'user-alex', amount: 100 },
    ],
  },
];

export const DEMO_ACTIVITIES_SEED = [
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
    description: 'added "Electricity & AC Bill" ($120.00) in "Apartment 4B"',
    timestamp: '2026-08-03T15:40:00Z',
  },
  {
    id: 'act-4',
    type: 'expense_add',
    userId: 'user-alex',
    description: 'added "High-Speed Fiber Internet" ($60.00) in "Apartment 4B"',
    timestamp: '2026-08-04T10:15:00Z',
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
    description: 'added "Lake Cabin Rental Deposit" ($800.00) in "Summer Cabin 2026"',
    timestamp: '2026-08-05T10:00:00Z',
  },
  {
    id: 'act-7',
    type: 'expense_add',
    userId: 'user-david',
    description: 'added "Groceries & Kitchen Supplies" ($90.00) in "Apartment 4B"',
    timestamp: '2026-08-05T18:12:00Z',
  },
  {
    id: 'act-8',
    type: 'expense_add',
    userId: 'user-emily',
    description: 'added "BBQ Food & Drinks" ($160.00) in "Summer Cabin 2026"',
    timestamp: '2026-08-06T14:30:00Z',
  },
  {
    id: 'act-9',
    type: 'expense_add',
    userId: 'user-ryan',
    description: 'added "Highway Tolls & Fuel" ($48.00) in "Summer Cabin 2026"',
    timestamp: '2026-08-07T11:15:00Z',
  },
  {
    id: 'act-10',
    type: 'group_create',
    userId: 'user-alex',
    description: 'created the group "Weekend Foodies Club"',
    timestamp: '2026-08-08T18:00:00Z',
  },
  {
    id: 'act-11',
    type: 'expense_add',
    userId: 'user-sarah',
    description: 'added "Kayak & Paddleboard Rentals" ($120.00) in "Summer Cabin 2026"',
    timestamp: '2026-08-08T16:20:00Z',
  },
  {
    id: 'act-12',
    type: 'expense_add',
    userId: 'user-alex',
    description: 'added "Sunday Brunch Buffet" ($100.00) in "Weekend Foodies Club"',
    timestamp: '2026-08-09T13:00:00Z',
  },
  {
    id: 'act-13',
    type: 'expense_add',
    userId: 'user-sarah',
    description: 'added "Artisan Pastries & Coffee" ($40.00) in "Weekend Foodies Club"',
    timestamp: '2026-08-10T11:45:00Z',
  },
  {
    id: 'act-14',
    type: 'expense_add',
    userId: 'user-alex',
    description: 'added "Friday Movie Tickets & Popcorn" ($44.00) outside of any group',
    timestamp: '2026-08-11T21:30:00Z',
  },
  {
    id: 'act-15',
    type: 'expense_add',
    userId: 'user-sarah',
    description: 'added "Uber Ride to Downtown" ($26.00) outside of any group',
    timestamp: '2026-08-12T23:15:00Z',
  },
  {
    id: 'act-16',
    type: 'settlement',
    userId: 'user-sarah',
    description: 'recorded a payment of $100.00 to Alex Morgan',
    timestamp: '2026-08-13T16:00:00Z',
  },
];

export async function seedDemoData(): Promise<void> {
  try {
    console.log('🌱 Checking / Seeding Demo Data in MongoDB...');

    // 1. Seed Users
    for (const u of DEMO_USERS_SEED) {
      await User.findOneAndUpdate(
        { id: u.id },
        { $set: u },
        { upsert: true, new: true }
      );
    }

    // 2. Seed Groups
    for (const g of DEMO_GROUPS_SEED) {
      await Group.findOneAndUpdate(
        { id: g.id },
        { $set: g },
        { upsert: true, new: true }
      );
    }

    // 3. Seed Expenses
    for (const e of DEMO_EXPENSES_SEED) {
      await Expense.findOneAndUpdate(
        { id: e.id },
        { $set: e },
        { upsert: true, new: true }
      );
    }

    // 4. Seed Activities
    for (const a of DEMO_ACTIVITIES_SEED) {
      await Activity.findOneAndUpdate(
        { id: a.id },
        { $set: a },
        { upsert: true, new: true }
      );
    }

    console.log('✅ Demo Data verified & successfully populated in MongoDB.');
  } catch (error) {
    console.error('Error seeding demo data:', error);
  }
}
