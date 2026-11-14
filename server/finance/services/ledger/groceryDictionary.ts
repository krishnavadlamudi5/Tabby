// Maps grocery line items to grocery sub-categories by keyword.

const GROCERY_KEYWORDS: [string, string[]][] = [
  ['groceries.vegetables', ['tomato', 'onion', 'potato', 'aloo', 'carrot', 'beans', 'cabbage', 'cauliflower', 'capsicum', 'chilli', 'ginger', 'garlic', 'coriander', 'dhania', 'mint', 'pudina', 'spinach', 'palak', 'methi', 'brinjal', 'bhindi', 'okra', 'cucumber', 'lemon', 'gourd', 'beetroot', 'radish', 'mushroom', 'banana', 'apple', 'mango', 'orange', 'grapes', 'papaya', 'pomegranate', 'watermelon', 'guava', 'fruit', 'vegetable', 'curry leaves', 'coconut']],
  ['groceries.dairy', ['milk', 'curd', 'dahi', 'paneer', 'butter', 'ghee', 'cheese', 'yogurt', 'yoghurt', 'egg', 'buttermilk', 'lassi', 'cream', 'amul', 'nandini', 'mother dairy']],
  ['groceries.staples', ['atta', 'rice', 'dal', 'toor', 'moong', 'chana', 'urad', 'masoor', 'rajma', 'oil', 'sugar', 'salt', 'jaggery', 'besan', 'maida', 'sooji', 'rava', 'poha', 'flour', 'wheat', 'spice', 'masala', 'turmeric', 'haldi', 'jeera', 'cumin', 'mustard', 'tamarind', 'pulses', 'millet', 'ragi', 'oats']],
  ['groceries.snacks', ['lays', 'chips', 'biscuit', 'cookie', 'namkeen', 'bhujia', 'chocolate', 'juice', 'cola', 'pepsi', 'coke', 'soda', 'tea', 'coffee', 'noodles', 'maggi', 'bread', 'cake', 'ice cream', 'snack', 'drink', 'water bottle', 'kurkure', 'nuts', 'almond', 'cashew', 'dry fruit', 'jam', 'ketchup', 'sauce']],
  ['groceries.meat', ['chicken', 'mutton', 'fish', 'prawn', 'meat', 'egg curry', 'licious']],
  ['groceries.household', ['vim', 'detergent', 'surf', 'ariel', 'tide', 'rin', 'harpic', 'lizol', 'cleaner', 'dishwash', 'scrub', 'garbage bag', 'tissue', 'foil', 'mop', 'broom', 'phenyl', 'freshener', 'colin', 'odonil', 'bulb', 'battery', 'hit ', 'good knight', 'all out']],
  ['groceries.personal_care', ['soap', 'shampoo', 'toothpaste', 'colgate', 'toothbrush', 'deo', 'deodorant', 'lotion', 'face wash', 'facewash', 'sanitizer', 'handwash', 'razor', 'shaving', 'sanitary', 'pad', 'hair oil', 'cream', 'dettol', 'lifebuoy', 'dove', 'nivea']],
  ['groceries.baby', ['diaper', 'pampers', 'huggies', 'baby', 'cerelac', 'wipes']],
  ['groceries.pooja', ['agarbatti', 'incense', 'camphor', 'kapoor', 'diya', 'pooja', 'puja', 'kumkum', 'flowers', 'wick', 'dhoop']],
];

/** Category key for one line item, or null when nothing matched. */
const escape = (w: string) => w.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MATCHERS: [string, RegExp][] = GROCERY_KEYWORDS.map(([key, words]) => [
  key,
  // Whole words, allowing plurals: "tomatoes" matches tomato, "salted" doesn't match salt.
  new RegExp(`\\b(?:${words.map(escape).join('|')})(?:s|es)?\\b`, 'i'),
]);

export function groceryKeyForItem(name: string): string | null {
  // Lists are ordered so the more specific grocery groups win
  // (e.g. "fresh cream" is dairy, not personal care).
  for (const [key, re] of MATCHERS) {
    if (re.test(name)) return key;
  }
  return null;
}
