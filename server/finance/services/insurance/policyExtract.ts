import { parseAmountToPaise } from '../../lib/money';
import { parseIndianDate } from '../../lib/time';

// Reads insurance policy details from plain text (email body and/or PDF
// text) using the labels Indian policy schedules use. No AI.

export type PolicyKind = 'health' | 'term_life' | 'life' | 'vehicle' | 'home' | 'travel' | 'personal_accident' | 'other';

export interface PolicyExtraction {
  insurer?: string;
  policyNumber?: string;
  type?: PolicyKind;
  planName?: string;
  vehicleNumber?: string;
  sumInsuredPaise?: number;
  premiumPaise?: number;
  startDate?: Date;
  endDate?: Date;
  nominee?: string;
  isRenewal?: boolean;
  /** Which fields were found, for the "auto-added" check badge. */
  found: string[];
  method: 'labels' | 'ai' | 'none';
}

// Domain or name fragment -> display name. Aggregators (PolicyBazaar,
// Bima Central, Ditto…) aren't insurers, so the insurer is read from the text.
const INSURERS: [RegExp, string][] = [
  [/\backo\b/i, 'Acko General Insurance'],
  [/go ?digit|\bdigit insurance\b|godigit/i, 'Go Digit General Insurance'],
  [/icici ?lombard/i, 'ICICI Lombard'],
  [/hdfc ?ergo/i, 'HDFC ERGO'],
  [/bajaj ?allianz/i, 'Bajaj Allianz'],
  [/tata ?aig/i, 'Tata AIG'],
  [/care ?health|careinsurance|religare health/i, 'Care Health Insurance'],
  [/niva ?bupa|max ?bupa/i, 'Niva Bupa'],
  [/star ?health/i, 'Star Health'],
  [/aditya ?birla ?health|abhicl/i, 'Aditya Birla Health'],
  [/manipal ?cigna/i, 'ManipalCigna'],
  [/sbi ?general/i, 'SBI General'],
  [/sbi ?life/i, 'SBI Life'],
  [/reliance ?general/i, 'Reliance General'],
  [/new india assurance|newindia/i, 'New India Assurance'],
  [/united india/i, 'United India Insurance'],
  [/oriental insurance/i, 'Oriental Insurance'],
  [/national insurance/i, 'National Insurance'],
  [/kotak ?(general|mahindra general)/i, 'Kotak General Insurance'],
  [/zuno|edelweiss general/i, 'Zuno General Insurance'],
  [/chola ?ms|cholamandalam/i, 'Chola MS'],
  [/iffco ?tokio/i, 'IFFCO Tokio'],
  [/future ?generali/i, 'Future Generali'],
  [/liberty ?general/i, 'Liberty General'],
  [/royal ?sundaram/i, 'Royal Sundaram'],
  [/navi ?general/i, 'Navi General Insurance'],
  [/\blic\b|life insurance corporation/i, 'LIC'],
  [/hdfc ?life/i, 'HDFC Life'],
  [/icici ?pru/i, 'ICICI Prudential Life'],
  [/max ?life|axis max life/i, 'Axis Max Life'],
  [/tata ?aia/i, 'Tata AIA Life'],
  [/bajaj ?allianz life|bajaj life/i, 'Bajaj Allianz Life'],
  [/kotak ?life/i, 'Kotak Life'],
];

const AGGREGATORS = /policybazaar|bimacentral|bima central|joinditto|ditto|insurancedekho|coverfox|turtlemint|renewbuy|paytm insurance|phonepe insurance/i;

export function insurerFrom(sender: string, text: string): string | undefined {
  const domain = sender.toLowerCase();
  if (!AGGREGATORS.test(domain)) {
    const bySender = INSURERS.find(([re]) => re.test(domain));
    if (bySender) return bySender[1];
  }
  // Most-mentioned insurer in the text wins (aggregator emails name the insurer).
  let best: { name: string; count: number } | undefined;
  for (const [re, name] of INSURERS) {
    const count = (text.match(new RegExp(re.source, 'gi')) || []).length;
    if (count && (!best || count > best.count)) best = { name, count };
  }
  return best?.name;
}

function typeFrom(text: string): { type?: PolicyKind; planName?: string } {
  const t = text.toLowerCase();
  if (/two[\s-]?wheeler|\bbike\b|motor ?cycle|scooter|\b2w\b/.test(t)) return { type: 'vehicle', planName: 'Two-wheeler' };
  if (/private car|four[\s-]?wheeler|\bcar insurance\b|\b4w\b/.test(t)) return { type: 'vehicle', planName: 'Car' };
  if (/commercial vehicle|goods carrying/.test(t)) return { type: 'vehicle', planName: 'Commercial vehicle' };
  if (/travel insurance|overseas travel|trip cover/.test(t)) return { type: 'travel' };
  if (/term (life|plan|insurance)|\bterm\b.*\bsum assured\b/.test(t)) return { type: 'term_life' };
  if (/health|mediclaim|hospitali[sz]ation|super top[\s-]?up/.test(t)) return { type: 'health' };
  if (/personal accident/.test(t)) return { type: 'personal_accident' };
  if (/home insurance|householder|bharat griha|fire and burglary/.test(t)) return { type: 'home' };
  if (/endowment|ulip|life insurance|sum assured/.test(t)) return { type: 'life' };
  return {};
}

const SEP = '\\s*[:\\-–]?\\s*';
const MONEY = '(?:₹|rs\\.?|inr|₨)?\\s*([\\d,]+(?:\\.\\d{1,2})?)';
const DATE = '(\\d{1,2}[-/ ](?:\\d{1,2}|[A-Za-z]{3,9})[-/ ,]+\\d{2,4}|[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})';

function first(text: string, patterns: string[], flags = 'i'): RegExpMatchArray | null {
  for (const p of patterns) {
    const m = text.match(new RegExp(p, flags));
    if (m) return m;
  }
  return null;
}

/**
 * Extracts what it can. Values come only from the text, so nothing is
 * invented; anything not found is left empty for the owner to fill.
 */
export function extractPolicy(text: string, sender = '', subject = ''): PolicyExtraction {
  const t = `${subject}\n${text}`.replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
  const found: string[] = [];
  const out: PolicyExtraction = { found, method: 'labels' };

  out.insurer = insurerFrom(sender, t);
  if (out.insurer) found.push('insurer');

  const pn = first(t, [
    `policy\\s*(?:no\\.?|number|#)${SEP}([A-Z0-9][A-Z0-9/\\-]{5,39})`,
    `certificate\\s*(?:no\\.?|number)${SEP}([A-Z0-9][A-Z0-9/\\-]{5,39})`,
  ]);
  if (pn && /\d/.test(pn[1])) {
    out.policyNumber = pn[1].replace(/[-/]+$/, '');
    found.push('policyNumber');
  }

  const kind = typeFrom(t);
  Object.assign(out, kind);
  if (kind.type) found.push('type');
  const plan = first(t, [`(?:plan|product)\\s*name${SEP}([^\\n]{3,60})`]);
  if (plan) out.planName = plan[1].trim();

  const reg = t.match(/\b([A-Z]{2})[ -]?(\d{1,2})[ -]?([A-Z]{1,3})[ -]?(\d{4})\b/);
  if (reg && /regist|vehicle|bike|car|motor/i.test(t)) {
    out.vehicleNumber = `${reg[1]}${reg[2].padStart(2, '0')}${reg[3]}${reg[4]}`;
    found.push('vehicleNumber');
  }

  const sum = first(t, [
    `(?:sum insured|sum assured|cover amount|insured declared value|\\bidv\\b)(?:\\s*\\([^)]*\\))?${SEP}${MONEY}`,
  ]);
  if (sum) {
    out.sumInsuredPaise = parseAmountToPaise(sum[1]) ?? undefined;
    if (out.sumInsuredPaise) found.push('sumInsured');
  }

  const prem = first(t, [
    `(?:total premium(?: payable| paid)?(?: \\(incl[^)]*\\))?|total amount paid|premium paid|amount paid|final premium|gross premium)${SEP}${MONEY}`,
    `(?:premium(?: amount)?)${SEP}${MONEY}`,
  ]);
  if (prem) {
    out.premiumPaise = parseAmountToPaise(prem[1]) ?? undefined;
    if (out.premiumPaise) found.push('premium');
  }

  const period = first(t, [
    `(?:period of insurance|policy period|policy tenure|coverage period|valid)\\s*(?:from)?${SEP}${DATE}(?:\\s*\\(?\\d{1,2}:\\d{2}[^)]*\\)?)?\\s*(?:to|till|until|-|–)\\s*(?:midnight of\\s*)?${DATE}`,
    `from\\s*${DATE}(?:[^\\n]{0,20}?)\\s*to\\s*(?:midnight of\\s*)?${DATE}`,
  ]);
  if (period) {
    out.startDate = parseIndianDate(period[1]) || undefined;
    out.endDate = parseIndianDate(period[2]) || undefined;
  }
  if (!out.startDate) {
    const s = first(t, [`(?:policy start date|start date|commencement date|risk start date|inception date)${SEP}${DATE}`]);
    if (s) out.startDate = parseIndianDate(s[1]) || undefined;
  }
  if (!out.endDate) {
    const e = first(t, [`(?:policy end date|end date|expiry date|expires on|valid till|valid upto|renewal date|due date)${SEP}${DATE}`]);
    if (e) out.endDate = parseIndianDate(e[1]) || undefined;
  }
  if (out.startDate) found.push('startDate');
  if (out.endDate) found.push('endDate');

  const nominee = first(t, [`nominee(?:\\s*name)?${SEP}([A-Za-z][A-Za-z .]{2,40})`]);
  if (nominee) {
    out.nominee = nominee[1].trim().replace(/\s+(relationship|relation|age|dob).*$/i, '');
    found.push('nominee');
  }
  out.isRenewal = /renew(ed|al)/i.test(subject) || /policy (has been )?renewed/i.test(t);
  return out;
}

/** Enough to file a policy without asking: who, which, and when it ends. */
export function isUsable(x: PolicyExtraction): boolean {
  return Boolean(x.insurer && (x.policyNumber || x.endDate) && (x.premiumPaise || x.sumInsuredPaise || x.endDate));
}

/** Combines several readings (email body, each PDF); earlier sources win per field. */
export function mergeExtractions(parts: PolicyExtraction[]): PolicyExtraction {
  const out: PolicyExtraction = { found: [], method: 'none' };
  for (const p of parts) {
    for (const [k, v] of Object.entries(p)) {
      if (k === 'found' || k === 'method' || v === undefined || v === null || v === '') continue;
      if ((out as any)[k] === undefined) (out as any)[k] = v;
    }
    if (p.found.length && out.method === 'none') out.method = p.method;
    out.found = Array.from(new Set([...out.found, ...p.found]));
  }
  return out;
}
