import { Types } from 'mongoose';
import { Category } from '../models';

interface Seed {
  key: string;
  name: string;
  icon: string;
  color: string;
  kind?: 'expense' | 'income' | 'transfer';
  children?: { key: string; name: string; icon: string }[];
}

// Default categories created for every user on first sign-in. `key` is
// stable so dictionaries and rules can find them even after a rename.
export const DEFAULT_CATEGORIES: Seed[] = [
  {
    key: 'groceries', name: 'Groceries', icon: 'shopping-basket', color: '#5B8C5A',
    children: [
      { key: 'groceries.vegetables', name: 'Vegetables & fruits', icon: 'carrot' },
      { key: 'groceries.dairy', name: 'Dairy & eggs', icon: 'milk' },
      { key: 'groceries.staples', name: 'Staples (rice, atta, dal, oil)', icon: 'wheat' },
      { key: 'groceries.snacks', name: 'Snacks & beverages', icon: 'cookie' },
      { key: 'groceries.meat', name: 'Meat & fish', icon: 'fish' },
      { key: 'groceries.household', name: 'Household & cleaning', icon: 'spray-can' },
      { key: 'groceries.personal_care', name: 'Personal care', icon: 'sparkles' },
      { key: 'groceries.baby', name: 'Baby & kids', icon: 'baby' },
      { key: 'groceries.pooja', name: 'Pooja items', icon: 'flame' },
    ],
  },
  { key: 'food', name: 'Food & dining', icon: 'utensils', color: '#C86D51' },
  { key: 'shopping', name: 'Shopping', icon: 'shopping-bag', color: '#B5838D' },
  { key: 'health', name: 'Health & medicines', icon: 'pill', color: '#D1495B' },
  {
    key: 'travel', name: 'Travel', icon: 'plane', color: '#2E86AB',
    children: [
      { key: 'travel.transport', name: 'Flights, trains & buses', icon: 'train-front' },
      { key: 'travel.stay', name: 'Stay', icon: 'bed' },
      { key: 'travel.food', name: 'Food', icon: 'utensils' },
      { key: 'travel.local', name: 'Local transport', icon: 'car' },
      { key: 'travel.activities', name: 'Activities', icon: 'ticket' },
      { key: 'travel.shopping', name: 'Shopping', icon: 'shopping-bag' },
    ],
  },
  { key: 'bills', name: 'Bills & utilities', icon: 'receipt', color: '#E9C46A' },
  { key: 'home', name: 'Home & rent', icon: 'home', color: '#8D6A9F' },
  { key: 'insurance', name: 'Insurance', icon: 'shield', color: '#3C5A48' },
  { key: 'emi', name: 'Loan EMI', icon: 'landmark', color: '#6D597A' },
  { key: 'investments', name: 'Investments', icon: 'trending-up', color: '#2A9D8F' },
  { key: 'subscriptions', name: 'Subscriptions', icon: 'repeat', color: '#577590' },
  { key: 'education', name: 'Education', icon: 'graduation-cap', color: '#F4A261' },
  { key: 'gifts', name: 'Gifts', icon: 'gift', color: '#E76F51' },
  { key: 'fees', name: 'Fees & charges', icon: 'badge-percent', color: '#A39E98' },
  { key: 'transport', name: 'Fuel & transport', icon: 'fuel', color: '#264653' },
  { key: 'income', name: 'Income', icon: 'wallet', color: '#2D6A4F', kind: 'income' },
  { key: 'refund', name: 'Refund', icon: 'undo-2', color: '#52B788', kind: 'income' },
  { key: 'self_transfer', name: 'Self transfer', icon: 'arrow-left-right', color: '#ADB5BD', kind: 'transfer' },
];

/** Creates the default categories once per user. Safe to call repeatedly. */
export async function ensureDefaultCategories(ownerId: string): Promise<void> {
  const existing = await Category.countDocuments({ ownerId, isSystem: true });
  if (existing > 0) return;
  let order = 0;
  for (const seed of DEFAULT_CATEGORIES) {
    const parent = await Category.create({
      ownerId, key: seed.key, name: seed.name, icon: seed.icon, color: seed.color,
      kind: seed.kind || 'expense', isSystem: true, sortOrder: order++, parentId: null,
    });
    if (seed.children) {
      await Category.insertMany(seed.children.map((c, i) => ({
        ownerId, key: c.key, name: c.name, icon: c.icon, color: seed.color,
        kind: seed.kind || 'expense', isSystem: true, sortOrder: i, parentId: parent._id,
      })));
    }
  }
}

/** Map of category key -> id for one owner (seeding first if needed). */
export async function categoryIdsByKey(ownerId: string): Promise<Map<string, Types.ObjectId>> {
  await ensureDefaultCategories(ownerId);
  const cats = await Category.find({ ownerId, key: { $ne: '' } }, { key: 1 });
  return new Map(cats.map((c) => [c.key, c._id]));
}
