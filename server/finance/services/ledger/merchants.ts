// Merchant normalisation and the keyword dictionary used to categorise
// transactions that no user rule matched.

/** "RAZ*Meesho technologies P" -> "meesho technologies p" */
export function normaliseMerchant(raw: string | undefined): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/^(raz|rzp|razorpay|payu|pyu|ccavenue|paytm|bharatpe|phonepe|gpay|upi|pos|ecom|vps|www)[*\s.:/-]+/i, '')
    .replace(/\b(pvt|private|ltd|limited|llp|inc|india|payments?|technologies|services|retail)\b\.?/g, ' ')
    .replace(/\.(com|in|co)\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Display form: "WWW AMAZON IN" -> "Amazon". Keeps unknown names readable. */
export function displayMerchant(raw: string | undefined): string {
  if (!raw) return '';
  const known = KNOWN_NAMES.find(([re]) => re.test(raw));
  if (known) return known[1];
  const n = raw.replace(/^(RAZ|RZP|PYU|PAYU)\*/i, '').replace(/\s+/g, ' ').trim();
  return n.length > 3 && n === n.toUpperCase()
    ? n.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : n;
}

const KNOWN_NAMES: [RegExp, string][] = [
  [/amazon/i, 'Amazon'], [/flipkart/i, 'Flipkart'], [/meesho/i, 'Meesho'], [/swiggy/i, 'Swiggy'],
  [/zomato/i, 'Zomato'], [/blinkit|grofers/i, 'Blinkit'], [/bigbasket|bbnow/i, 'BigBasket'], [/zepto/i, 'Zepto'],
  [/myntra/i, 'Myntra'], [/irctc/i, 'IRCTC'], [/uber/i, 'Uber'], [/\bola\b|olacabs/i, 'Ola'], [/netflix/i, 'Netflix'],
];

/** keyword (lowercase, matched as substring of the normalised merchant) -> category key */
export const MERCHANT_DICTIONARY: [string, string][] = [
  // groceries
  ['blinkit', 'groceries'], ['bigbasket', 'groceries'], ['zepto', 'groceries'], ['instamart', 'groceries'],
  ['dmart', 'groceries'], ['more retail', 'groceries'], ['reliance fresh', 'groceries'], ['jiomart', 'groceries'],
  ['kirana', 'groceries'], ['general store', 'groceries'], ['provision', 'groceries'], ['supermarket', 'groceries'],
  ['rice', 'groceries'], ['vegetable', 'groceries'], ['fruits', 'groceries'], ['dairy', 'groceries'], ['milk', 'groceries'],
  ['country delight', 'groceries'], ['nandini', 'groceries'],
  // food
  ['swiggy', 'food'], ['zomato', 'food'], ['restaurant', 'food'], ['cafe', 'food'], ['hotel', 'food'],
  ['bakery', 'food'], ['starbucks', 'food'], ['dominos', 'food'], ['mcdonald', 'food'], ['kfc', 'food'], ['pizza', 'food'],
  // shopping
  ['amazon', 'shopping'], ['flipkart', 'shopping'], ['meesho', 'shopping'], ['myntra', 'shopping'], ['ajio', 'shopping'],
  ['nykaa', 'shopping'], ['nobero', 'shopping'], ['decathlon', 'shopping'], ['ikea', 'shopping'], ['croma', 'shopping'],
  ['pratyaya', 'shopping'],
  // health
  ['medical', 'health'], ['pharma', 'health'], ['chemist', 'health'], ['apollo', 'health'], ['1mg', 'health'],
  ['netmeds', 'health'], ['pharmeasy', 'health'], ['hospital', 'health'], ['clinic', 'health'], ['diagnostic', 'health'],
  // travel & transport
  ['irctc', 'travel.transport'], ['makemytrip', 'travel'], ['goibibo', 'travel'], ['cleartrip', 'travel'], ['indigo', 'travel.transport'],
  ['air india', 'travel.transport'], ['vistara', 'travel.transport'], ['akasa', 'travel.transport'], ['redbus', 'travel.transport'],
  ['oyo', 'travel.stay'], ['airbnb', 'travel.stay'], ['booking com', 'travel.stay'],
  ['uber', 'transport'], ['ola', 'transport'], ['rapido', 'transport'], ['petrol', 'transport'], ['fuel', 'transport'],
  ['indian oil', 'transport'], ['iocl', 'transport'], ['bpcl', 'transport'], ['hpcl', 'transport'], ['fastag', 'transport'], ['metro', 'transport'],
  // bills
  ['airtel', 'bills'], ['jio', 'bills'], ['vodafone', 'bills'], ['bsnl', 'bills'], ['electricity', 'bills'], ['bescom', 'bills'],
  ['tneb', 'bills'], ['tata power', 'bills'], ['broadband', 'bills'], ['gas', 'bills'], ['water', 'bills'], ['act fibernet', 'bills'],
  // subscriptions
  ['netflix', 'subscriptions'], ['spotify', 'subscriptions'], ['hotstar', 'subscriptions'], ['prime video', 'subscriptions'],
  ['youtube', 'subscriptions'], ['google play', 'subscriptions'], ['apple com', 'subscriptions'], ['beautiful slides', 'subscriptions'],
  // insurance, investments, education
  ['insurance', 'insurance'], ['care health', 'insurance'], ['lic', 'insurance'], ['policybazaar', 'insurance'], ['bima', 'insurance'],
  ['zerodha', 'investments'], ['groww', 'investments'], ['coin', 'investments'], ['mutual fund', 'investments'], ['kuvera', 'investments'],
  ['school', 'education'], ['college', 'education'], ['udemy', 'education'], ['coursera', 'education'], ['tuition', 'education'],
  ['rent', 'home'], ['nobroker', 'home'], ['urban company', 'home'],
];

export function dictionaryCategoryKey(merchant: string): string | null {
  const n = ` ${normaliseMerchant(merchant)} `;
  if (!n.trim()) return null;
  for (const [kw, key] of MERCHANT_DICTIONARY) {
    if (n.includes(` ${kw} `) || n.includes(` ${kw}`) && kw.length >= 5) return key;
  }
  return null;
}
