import { parseAmountToPaise } from '../../lib/money';
import { parseIndianDate } from '../../lib/time';
import type { PolicyExtraction, PolicyKind } from '../insurance/policyExtract';

// Optional backup reader using Cloudflare Workers AI (free daily allowance).
// Off unless CF_ACCOUNT_ID and CF_AI_TOKEN are set. Only masked text is sent,
// and every value it returns must literally appear in the source text.

export function isAiConfigured(): boolean {
  return Boolean(process.env.CF_ACCOUNT_ID && process.env.CF_AI_TOKEN);
}

/** Removes personal identifiers before text leaves the server. */
export function maskForAi(text: string, ownerName = ''): string {
  let t = text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/(?:\+?91[\s-]?)?\b[6-9]\d{9}\b/g, '[phone]')
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, '[aadhaar]')
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, '[pan]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[card]');
  for (const part of ownerName.split(/\s+/).filter((p) => p.length > 2)) {
    t = t.replace(new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '[name]');
  }
  return t.slice(0, 12_000);
}

const SCHEMA = {
  type: 'object',
  properties: {
    insurer: { type: 'string' }, policyNumber: { type: 'string' },
    type: { type: 'string', enum: ['health', 'term_life', 'life', 'vehicle', 'home', 'travel', 'personal_accident', 'other'] },
    planName: { type: 'string' }, vehicleNumber: { type: 'string' },
    sumInsured: { type: 'string' }, premium: { type: 'string' },
    startDate: { type: 'string' }, endDate: { type: 'string' }, nominee: { type: 'string' },
  },
};

const compact = (s: string) => s.replace(/[\s,]/g, '').toLowerCase();

/**
 * Asks the model for policy fields. Returns null when not configured or on
 * any error (the caller falls back to the review queue).
 */
export async function aiExtractPolicy(text: string, ownerName = '', fetchImpl: typeof fetch = fetch): Promise<PolicyExtraction | null> {
  if (!isAiConfigured()) return null;
  const masked = maskForAi(text, ownerName);
  const model = process.env.CF_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
  try {
    const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'You read Indian insurance policy documents. Reply with JSON only. Copy values exactly as written in the document. Leave a field out if it is not in the document. Dates as written. Amounts as written, digits only.' },
          { role: 'user', content: `Extract: insurer, policyNumber, type, planName, vehicleNumber, sumInsured, premium (total paid), startDate, endDate (expiry/renewal), nominee.\n\nDocument:\n${masked}` },
        ],
        response_format: { type: 'json_schema', json_schema: SCHEMA },
        max_tokens: 400,
      }),
    });
    if (!res.ok) return null;
    const body: any = await res.json();
    const raw = body?.result?.response;
    const obj = typeof raw === 'object' && raw ? raw : JSON.parse(String(raw).match(/\{[\s\S]*\}/)?.[0] || 'null');
    if (!obj) return null;
    return validateAi(obj, text);
  } catch (err) {
    console.warn('AI policy extraction failed:', (err as Error)?.message);
    return null;
  }
}

/** Keeps only values that can be found in the original document. */
export function validateAi(obj: Record<string, any>, source: string): PolicyExtraction {
  const src = compact(source);
  const appears = (v: unknown) => typeof v === 'string' && v.trim().length > 1 && src.includes(compact(v));
  const out: PolicyExtraction = { found: [], method: 'ai' };
  const keep = (field: keyof PolicyExtraction, value: any, label: string) => {
    if (value === undefined || value === null) return;
    (out as any)[field] = value;
    out.found.push(label);
  };
  if (appears(obj.insurer)) keep('insurer', String(obj.insurer).trim(), 'insurer');
  if (appears(obj.policyNumber) && /\d/.test(obj.policyNumber)) keep('policyNumber', String(obj.policyNumber).trim(), 'policyNumber');
  if (['health', 'term_life', 'life', 'vehicle', 'home', 'travel', 'personal_accident', 'other'].includes(obj.type)) keep('type', obj.type as PolicyKind, 'type');
  if (appears(obj.planName)) out.planName = String(obj.planName).trim();
  if (appears(obj.vehicleNumber)) keep('vehicleNumber', String(obj.vehicleNumber).replace(/[\s-]/g, '').toUpperCase(), 'vehicleNumber');
  for (const [k, f] of [['sumInsured', 'sumInsuredPaise'], ['premium', 'premiumPaise']] as const) {
    const v = obj[k];
    if (v !== undefined && appears(String(v).replace(/\.0+$/, ''))) keep(f, parseAmountToPaise(String(v)) ?? undefined, k);
  }
  for (const k of ['startDate', 'endDate'] as const) {
    if (appears(obj[k])) keep(k, parseIndianDate(String(obj[k])) || undefined, k);
  }
  if (appears(obj.nominee)) keep('nominee', String(obj.nominee).trim(), 'nominee');
  out.found = out.found.filter((f) => (out as any)[f === 'sumInsured' ? 'sumInsuredPaise' : f === 'premium' ? 'premiumPaise' : f] !== undefined);
  return out;
}
