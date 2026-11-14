import { TXN_CHANNELS } from '../../models/ledger';

export type Channel = (typeof TXN_CHANNELS)[number];

export type EventType =
  | 'transaction'      // money moved (debit or credit)
  | 'declined'         // attempted payment that failed - excluded from totals
  | 'refund_credit'    // bank credit that reverses/refunds an earlier debit
  | 'expected_refund'  // merchant says a refund is on its way
  | 'order'            // order / invoice with line items
  | 'emi_due'
  | 'sip_report'
  | 'subscription'
  | 'policy'
  | 'statement'
  | 'info'             // from a bank but no money movement (limits, settings)
  | 'otp'
  | 'marketing'
  | 'unknown';

/** What one parser pulls out of one email. Amounts in paise. */
export interface Extraction {
  eventType: EventType;
  amountPaise?: number;
  currency?: string;
  direction?: 'debit' | 'credit';
  occurredAt?: Date;
  merchant?: string;
  /** Last 4 digits of the bank account named in the email. */
  accountHint?: string;
  /** Last 4 digits of the card named in the email. */
  cardHint?: string;
  institution?: string;
  channel?: Channel;
  referenceIds: string[];
  counterparty?: { name?: string; account?: string; ifsc?: string };
  expectedAt?: Date;
  dueDate?: Date;
  orderId?: string;
  lineItems?: { name: string; qty?: number; amountPaise?: number }[];
  commitment?: { type: 'emi' | 'sip' | 'subscription' | 'premium'; name: string; externalKey: string; status: string; note?: string };
  /** 'bank' = alert from the account holder's bank; 'merchant' = receipt from a payment gateway/shop. */
  sourceKind: 'bank' | 'merchant';
  confidence: number;
  notes?: string;
}

export interface EmailInput {
  sender: string;
  subject: string;
  text: string;
  receivedAt: Date;
}

export interface Parser {
  name: string;
  version: number;
  matches(sender: string, subject: string): boolean;
  /** Returns null when this parser does not recognise the email. */
  parse(email: EmailInput): Extraction | null;
}
