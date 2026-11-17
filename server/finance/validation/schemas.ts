import { z } from 'zod';
import { ACCOUNT_TYPES, TXN_CHANNELS, TXN_KINDS, TXN_STATUSES } from '../models/ledger';
import { POLICY_TYPES, PREMIUM_FREQUENCIES, POLICY_STATUSES } from '../models/insurance';
import { DOCUMENT_TYPES, LINK_KINDS } from '../models/vault';
import { COMMITMENT_TYPES, COMMITMENT_STATUSES, FREQUENCIES } from '../models/planning';
import { HOLDING_TYPES } from '../models/investments';

/**
 * Update (PATCH) schema from a create schema: every field optional and NO
 * defaults. zod's .partial() keeps defaults, which would silently reset every
 * field the client didn't send (e.g. a policy's premium to 0).
 */
function patchOf<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    let f: any = field;
    while (f instanceof z.ZodDefault || f instanceof z.ZodOptional) f = f.unwrap();
    if (f instanceof z.ZodObject) f = patchOf(f);
    shape[key] = f.optional();
  }
  return z.object(shape) as unknown as z.ZodObject<{ [K in keyof T]: z.ZodOptional<any> }>;
}

// Shared building blocks
export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'must be an id');
export const paise = z.number().int('must be whole paise').min(0);
export const signedPaise = z.number().int('must be whole paise');
export const dateLike = z.coerce.date();
const shortText = z.string().trim().max(200);
const longText = z.string().max(5000);
const last4 = z.string().trim().regex(/^\d{4}$/, 'must be the last 4 digits');

// --- Accounts
export const accountCreate = z.object({
  name: shortText.min(1),
  institution: shortText.default('other'),
  type: z.enum(ACCOUNT_TYPES).default('savings'),
  last4: z.union([last4, z.literal('')]).default(''),
  aliases: z.array(shortText).max(20).default([]),
  cardLast4s: z.array(last4).max(10).default([]),
  ifsc: z.string().trim().max(11).default(''),
  holderName: shortText.default(''),
  openingBalancePaise: signedPaise.default(0),
  openingBalanceDate: dateLike.optional(),
  currency: z.string().length(3).default('INR'),
  isActive: z.boolean().default(true),
});
export const accountUpdate = patchOf(accountCreate);
export const statementPassword = z.object({ password: z.string().max(100) });

// --- Categories, rules, templates
export const categoryCreate = z.object({
  name: shortText.min(1),
  parentId: objectId.nullable().default(null),
  icon: shortText.default('tag'),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#736F6A'),
  kind: z.enum(['expense', 'income', 'transfer']).default('expense'),
  sortOrder: z.number().int().default(0),
  budgetPaise: paise.default(0),
});
export const categoryUpdate = patchOf(categoryCreate);
export const categoryReorder = z.object({ ids: z.array(objectId).min(1) });

export const ruleCreate = z.object({
  match: z.object({
    merchantContains: shortText.optional(),
    senderEquals: shortText.optional(),
    channel: z.enum(TXN_CHANNELS).optional(),
    amountMinPaise: paise.optional(),
    amountMaxPaise: paise.optional(),
  }).refine((m) => Object.values(m).some((v) => v !== undefined && v !== ''), 'a rule needs at least one condition'),
  action: z.object({
    categoryId: objectId.optional(),
    kind: z.enum(TXN_KINDS).optional(),
    tags: z.array(shortText).max(10).optional(),
    splitTemplateId: objectId.optional(),
  }).refine((a) => Object.values(a).some((v) => v !== undefined), 'a rule needs an action'),
  priority: z.number().int().default(0),
});
export const ruleUpdate = z.object({
  match: ruleCreate.shape.match.optional(),
  action: ruleCreate.shape.action.optional(),
  priority: z.number().int().optional(),
});

export const splitTemplateCreate = z.object({
  name: shortText.min(1),
  parts: z.array(z.object({ categoryId: objectId, percent: z.number().positive().max(100) })).min(1)
    .refine((parts) => Math.abs(parts.reduce((s, p) => s + p.percent, 0) - 100) < 0.001, 'percentages must add up to 100'),
});
export const splitTemplateUpdate = patchOf(splitTemplateCreate);

// --- Transactions
export const transactionCreate = z.object({
  accountId: objectId.nullable().default(null),
  postedAt: dateLike,
  amountPaise: paise.min(1),
  direction: z.enum(['debit', 'credit']),
  currency: z.string().length(3).default('INR'),
  merchant: shortText.default(''),
  description: shortText.default(''),
  channel: z.enum(TXN_CHANNELS).default('other'),
  kind: z.enum(TXN_KINDS).optional(),
  categoryId: objectId.nullable().optional(),
  tags: z.array(shortText).max(20).default([]),
  notes: longText.default(''),
  tripId: z.string().nullable().optional(),
});
export const transactionUpdate = z.object({
  accountId: objectId.nullable().optional(),
  postedAt: dateLike.optional(),
  merchant: shortText.optional(),
  description: shortText.optional(),
  kind: z.enum(TXN_KINDS).optional(),
  status: z.enum(TXN_STATUSES).optional(),
  categoryId: objectId.nullable().optional(),
  tags: z.array(shortText).max(20).optional(),
  notes: longText.optional(),
  tripId: z.string().nullable().optional(),
  /** When true (default) a category change also teaches a rule for this merchant. */
  learn: z.boolean().default(true),
});
export const splitsBody = z.object({
  mode: z.enum(['amounts', 'percent', 'template', 'clear']).default('amounts'),
  parts: z.array(z.object({
    categoryId: objectId.nullable(),
    amountPaise: paise.optional(),
    percent: z.number().min(0).max(100).optional(),
    note: shortText.optional(),
    lineItems: z.array(z.object({ name: shortText, qty: z.number().optional(), amountPaise: paise.optional() })).optional(),
  })).default([]),
  templateId: objectId.optional(),
});
export const linkBody = z.object({ otherId: objectId.nullable() });
export const shareBody = z.object({
  description: shortText.min(1),
  groupId: z.string().nullable().default(null),
  splitMethod: z.enum(['equally', 'exactly', 'percentage']).default('equally'),
  splits: z.array(z.object({ userId: z.string().min(1), amount: z.number().min(0), percentage: z.number().optional() })).min(2),
  category: z.string().default('other'),
});

// --- Review & ingest
export const reviewConfirm = z.object({
  amountPaise: paise.min(1).optional(),
  direction: z.enum(['debit', 'credit']).optional(),
  postedAt: dateLike.optional(),
  merchant: shortText.optional(),
  accountId: objectId.nullable().optional(),
  categoryId: objectId.nullable().optional(),
  kind: z.enum(TXN_KINDS).optional(),
  channel: z.enum(TXN_CHANNELS).optional(),
});
export const manualIngest = z.object({
  text: z.string().min(5).max(100_000),
  sender: z.string().max(200).default(''),
  subject: z.string().max(500).default(''),
  receivedAt: dateLike.optional(),
});
export const emailIngest = z.object({
  messageId: z.string().min(1).max(200),
  threadId: z.string().max(200).optional(),
  from: z.string().max(500).default(''),
  to: z.string().max(2000).optional(),
  subject: z.string().max(1000).default(''),
  date: dateLike.optional(),
  bodyText: z.string().max(200_000).default(''),
  attachments: z.array(z.object({
    filename: z.string().max(300),
    mimeType: z.string().max(100),
    size: z.number().int().min(0),
    base64: z.string(),
  })).max(10).default([]),
});

// --- Statements
export const statementUploadFields = z.object({
  accountId: objectId,
  openingBalancePaise: z.coerce.number().int().optional(),
  closingBalancePaise: z.coerce.number().int().optional(),
  password: z.string().max(100).optional(),
});

// --- Insurance
const agent = z.object({ name: shortText.optional(), phone: shortText.optional(), email: shortText.optional() }).default({});
export const policyCreate = z.object({
  insurer: shortText.min(1),
  policyNumber: shortText.default(''),
  type: z.enum(POLICY_TYPES).default('health'),
  planName: shortText.default(''),
  insuredMemberIds: z.array(objectId).default([]),
  nominee: shortText.default(''),
  sumInsuredPaise: paise.default(0),
  premiumPaise: paise.default(0),
  premiumFrequency: z.enum(PREMIUM_FREQUENCIES).default('yearly'),
  paymentMode: shortText.default(''),
  startDate: dateLike.optional(),
  renewalDate: dateLike.optional(),
  termYears: z.number().int().min(0).max(100).optional(),
  status: z.enum(POLICY_STATUSES).default('active'),
  agent,
  claimHelpline: shortText.default(''),
  tpa: shortText.default(''),
  taxSection: z.enum(['80C', '80D']).nullable().default(null),
  notes: longText.default(''),
  vehicleNumber: z.string().trim().max(20).default(''),
  renewUrl: z.union([z.literal(''), z.string().trim().url().max(500).refine((u) => /^https:\/\//.test(u), 'must start with https://')]).default(''),
  needsCheck: z.boolean().optional(),
  /** Review item this policy was created from: its attachments get linked and it is marked done. */
  fromRawEventId: objectId.optional(),
});
export const policyUpdate = patchOf(policyCreate);
export const policyExtractBody = z.object({
  text: z.string().max(200_000).optional(),
  sender: z.string().max(300).default(''),
  subject: z.string().max(500).default(''),
  rawEventId: objectId.optional(),
}).refine((b) => b.text || b.rawEventId, 'send text or rawEventId');
export const premiumPayment = z.object({ amountPaise: paise.min(1), date: dateLike, accountId: objectId.nullable().default(null), note: shortText.default('') });
export const docPasswordCreate = z.object({ label: shortText.min(1), password: z.string().min(1).max(100) });
export const personCreate = z.object({
  name: shortText.min(1),
  relation: shortText.default('self'),
  dob: dateLike.optional(),
  linkedUserId: z.string().optional(),
});
export const personUpdate = patchOf(personCreate);
export const claimCreate = z.object({
  policyId: objectId,
  date: dateLike,
  reason: shortText.default(''),
  claimedPaise: paise.default(0),
  settledPaise: paise.default(0),
  status: z.enum(['filed', 'in_review', 'settled', 'rejected']).default('filed'),
  documentIds: z.array(objectId).default([]),
  notes: longText.default(''),
});
export const claimUpdate = patchOf(claimCreate);

// --- Documents
export const documentFields = z.object({
  title: shortText.optional(),
  type: z.enum(DOCUMENT_TYPES).default('other'),
  linkKind: z.enum(LINK_KINDS).optional(),
  linkId: z.string().max(100).optional(),
  expiresAt: z.union([z.literal(''), dateLike]).optional(),
});
export const documentUpdate = z.object({
  title: shortText.min(1).optional(),
  expiresAt: dateLike.nullable().optional(),
  type: z.enum(DOCUMENT_TYPES).optional(),
  link: z.object({ kind: z.enum(LINK_KINDS), id: z.string().min(1) }).optional(),
  unlink: z.object({ kind: z.enum(LINK_KINDS), id: z.string().min(1) }).optional(),
});

// --- Commitments & alerts
export const commitmentCreate = z.object({
  type: z.enum(COMMITMENT_TYPES).default('other'),
  name: shortText.min(1),
  amountPaise: paise.default(0),
  currency: z.string().length(3).default('INR'),
  schedule: z.object({
    freq: z.enum(FREQUENCIES).default('monthly'),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    nextDueDate: dateLike,
  }),
  accountId: objectId.nullable().default(null),
  matchRule: z.object({
    merchantContains: shortText.optional(),
    senderEquals: shortText.optional(),
    tolerancePct: z.number().min(0).max(50).default(5),
  }).default({ tolerancePct: 5 }),
  status: z.enum(COMMITMENT_STATUSES).default('due'),
  policyId: objectId.nullable().default(null),
});
export const commitmentUpdate = patchOf(commitmentCreate);

// --- Investments
export const holdingCreate = z.object({
  name: shortText.min(1),
  type: z.enum(HOLDING_TYPES).default('mutual_fund'),
  provider: shortText.default(''),
  reference: shortText.default(''),
  investedPaise: paise.default(0),
  currentValuePaise: paise.default(0),
  valueAsOf: dateLike.optional(),
  startDate: dateLike.nullable().optional(),
  maturityDate: dateLike.nullable().optional(),
  interestRatePct: z.number().min(0).max(100).nullable().optional(),
  commitmentId: objectId.nullable().default(null),
  notes: longText.default(''),
  isActive: z.boolean().default(true),
});
export const holdingUpdate = patchOf(holdingCreate);

/** Spending summary period: whole India days, `to` inclusive. */
export const periodQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
});

// --- Trips (extra fields on existing groups)
export const tripUpdate = z.object({
  startDate: dateLike.nullable().optional(),
  endDate: dateLike.nullable().optional(),
  budgetPaise: paise.nullable().optional(),
  currency: z.string().length(3).optional(),
});
export const tripAssign = z.object({ tripId: z.string().nullable() });

export const monthQuery = z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM');

export const yearQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  basis: z.enum(['calendar', 'fy']).default('fy'),
});
