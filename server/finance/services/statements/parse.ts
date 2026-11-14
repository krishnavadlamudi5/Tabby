import { createRequire } from 'module';
import path from 'path';
import Papa from 'papaparse';
import { parseAmountToPaise } from '../../lib/money';
import { parseIndianDate } from '../../lib/time';

/** One line of a bank statement, amounts in paise. */
export interface StatementLine {
  lineNo: number;
  date: Date;
  description: string;
  ref: string;
  debitPaise: number;
  creditPaise: number;
  balancePaise: number | null;
}

export interface ParsedStatement {
  lines: StatementLine[];
  openingBalancePaise: number | null;
  closingBalancePaise: number | null;
}

export class StatementParseError extends Error {
  status = 400;
  constructor(message: string, public code: 'password_needed' | 'wrong_password' | 'unreadable' = 'unreadable') {
    super(message);
  }
}

const H = {
  date: /^(txn |transaction |tran |value |posting )?date$|^date$|txn date|tran date|transaction date/i,
  desc: /narration|description|particulars|remarks|details|transaction details/i,
  ref: /ref|chq|cheque/i,
  debit: /debit|withdrawal|dr\.?\s*amount|^dr$|amount \(dr\)/i,
  credit: /credit|deposit|cr\.?\s*amount|^cr$|amount \(cr\)/i,
  amount: /^amount|txn amount|transaction amount/i,
  type: /dr\s*\/\s*cr|^type$|debit\/credit|cr\/dr/i,
  balance: /balance/i,
};

function findCol(header: string[], re: RegExp, skip: number[] = []): number {
  return header.findIndex((h, i) => !skip.includes(i) && re.test(h.trim()));
}

/**
 * Net-banking CSV/TSV export (Kotak, ICICI, HDFC, SBI and most others).
 * Finds the header row by its column names, skipping the preamble banks put
 * above it, then reads one line per dated row.
 */
export function parseCsvStatement(text: string): ParsedStatement {
  const rows = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: true }).data
    .map((r) => r.map((c) => String(c ?? '').trim()));
  const headerIdx = rows.findIndex((r) => r.some((c) => H.date.test(c)) && r.some((c) => H.debit.test(c) || H.amount.test(c) || H.credit.test(c)));
  if (headerIdx < 0) throw new StatementParseError('Could not find the column headings (Date, Description, Debit/Credit) in this file');
  const header = rows[headerIdx];
  const col = {
    date: findCol(header, H.date),
    desc: findCol(header, H.desc),
    ref: findCol(header, H.ref),
    debit: findCol(header, H.debit),
    credit: findCol(header, H.credit),
    balance: findCol(header, H.balance),
  };
  const amountCol = col.debit < 0 ? findCol(header, H.amount) : -1;
  const typeCol = amountCol >= 0 ? findCol(header, H.type, [amountCol]) : -1;
  if (col.date < 0 || (col.debit < 0 && col.credit < 0 && amountCol < 0)) {
    throw new StatementParseError('This file is missing a date or amount column');
  }

  const lines: StatementLine[] = [];
  let opening: number | null = null;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const desc = col.desc >= 0 ? r[col.desc] || '' : '';
    if (/opening balance/i.test(r.join(' '))) {
      const bal = col.balance >= 0 ? parseAmountToPaise(r[col.balance]) : null;
      if (bal !== null) opening = bal;
      continue;
    }
    const date = parseIndianDate(r[col.date] || '');
    if (!date) continue;
    let debit = 0;
    let credit = 0;
    if (amountCol >= 0) {
      const amt = Math.abs(parseAmountToPaise(r[amountCol]) || 0);
      const type = (typeCol >= 0 ? r[typeCol] : '').toUpperCase();
      const negative = /^-/.test(r[amountCol] || '');
      if (type.startsWith('CR') || (!type && !negative && /cr\b/i.test(r[amountCol] || ''))) credit = amt;
      else if (type.startsWith('DR') || negative) debit = amt;
      else credit = amt;
    } else {
      debit = Math.abs(parseAmountToPaise(col.debit >= 0 ? r[col.debit] : '') || 0);
      credit = Math.abs(parseAmountToPaise(col.credit >= 0 ? r[col.credit] : '') || 0);
    }
    if (!debit && !credit) continue;
    lines.push({
      lineNo: lines.length + 1,
      date,
      description: desc,
      ref: col.ref >= 0 ? r[col.ref] || '' : '',
      debitPaise: debit,
      creditPaise: credit,
      balancePaise: col.balance >= 0 ? parseAmountToPaise(r[col.balance]) : null,
    });
  }
  if (!lines.length) throw new StatementParseError('No transactions found in this file');
  return { lines, openingBalancePaise: opening, closingBalancePaise: lines[lines.length - 1].balancePaise };
}

/**
 * Text-based PDF statement. Unlocks with the account's statement password,
 * rebuilds text lines from positioned text, and reads lines that start with
 * a date and end with "amount balance". The debit/credit side comes from how
 * the running balance moves. Scanned (image) PDFs are not supported.
 */
export async function parsePdfStatement(data: Buffer, password?: string): Promise<ParsedStatement> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let doc: any;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(data), password, isEvalSupported: false, useSystemFonts: false, standardFontDataUrl: standardFontsDir() }).promise;
  } catch (err: any) {
    if (err?.name === 'PasswordException') {
      throw new StatementParseError(
        password ? 'The saved statement password is wrong' : 'This statement is password protected. Save the statement password on the account first.',
        password ? 'wrong_password' : 'password_needed',
      );
    }
    throw new StatementParseError('Could not read this PDF');
  }

  const textLines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items as any[]) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5]);
      const key = Array.from(rows.keys()).find((k) => Math.abs(k - y) <= 2) ?? y;
      const row = rows.get(key) || [];
      row.push({ x: item.transform[4], s: item.str.trim() });
      rows.set(key, row);
    }
    Array.from(rows.entries()).sort((a, b) => b[0] - a[0]).forEach(([, items]) => {
      textLines.push(items.sort((a, b) => a.x - b.x).map((i) => i.s).join(' '));
    });
  }
  return parseStatementTextLines(textLines);
}

const AMOUNT_RE = /-?[\d,]+\.\d{2}(?:\s*(?:Cr|Dr))?/gi;

/** Shared by the PDF reader and tests: lines of text -> statement lines. */
export function parseStatementTextLines(textLines: string[]): ParsedStatement {
  const lines: StatementLine[] = [];
  let opening: number | null = null;
  let prevBalance: number | null = null;
  for (const raw of textLines) {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (/opening balance/i.test(t)) {
      const nums = t.match(AMOUNT_RE);
      if (nums?.length) {
        opening = parseAmountToPaise(nums[nums.length - 1]);
        prevBalance = opening;
      }
      continue;
    }
    const dm = t.match(/^(\d{1,2}[-/ ](?:\d{1,2}|[A-Za-z]{3})[-/ ,]+\d{2,4})\s+(.*)$/);
    if (!dm) continue;
    const date = parseIndianDate(dm[1]);
    if (!date) continue;
    const nums = dm[2].match(AMOUNT_RE);
    if (!nums || nums.length < 2) continue;
    const balance = parseAmountToPaise(nums[nums.length - 1])!;
    const amountStr = nums[nums.length - 2];
    const amount = Math.abs(parseAmountToPaise(amountStr)!);
    let desc = dm[2];
    for (const n of nums) desc = desc.replace(n, '');
    desc = desc.replace(/\s+/g, ' ').trim();
    let credit = 0;
    let debit = 0;
    if (/cr$/i.test(amountStr.trim())) credit = amount;
    else if (/dr$/i.test(amountStr.trim())) debit = amount;
    else if (prevBalance !== null) {
      if (prevBalance + amount === balance) credit = amount;
      else debit = amount;
    } else debit = amount;
    if (opening === null) opening = balance + debit - credit;
    prevBalance = balance;
    lines.push({ lineNo: lines.length + 1, date, description: desc, ref: '', debitPaise: debit, creditPaise: credit, balancePaise: balance });
  }
  if (!lines.length) throw new StatementParseError('No transactions found in this PDF (scanned PDFs are not supported; use the CSV export)');
  return { lines, openingBalancePaise: opening, closingBalancePaise: lines[lines.length - 1].balancePaise };
}

/** pdf.js needs its bundled standard fonts in Node (avoids a warning on every PDF). */
function standardFontsDir(): string {
  const require = createRequire(import.meta.url);
  return path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;
}
