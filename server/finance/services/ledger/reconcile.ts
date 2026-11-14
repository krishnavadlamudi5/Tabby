import { StatementLine } from '../statements/parse';

export interface ReconcileResult {
  openingBalancePaise: number;
  closingBalancePaise: number;
  computedClosingPaise: number;
  mismatchPaise: number;
  issues: { line: number; message: string; amountPaise?: number }[];
}

/**
 * opening + credits - debits must equal closing. When lines carry running
 * balances, each break in the chain is reported at the line where it occurs,
 * with the amount that is missing (a skipped or unparsed line).
 */
export function reconcileLines(lines: StatementLine[], opening: number | null, closing: number | null): ReconcileResult {
  const issues: ReconcileResult['issues'] = [];
  const first = lines[0];
  const open = opening ?? (first && first.balancePaise !== null ? first.balancePaise - first.creditPaise + first.debitPaise : 0);
  let running = open;
  for (const l of lines) {
    running += l.creditPaise - l.debitPaise;
    if (l.balancePaise !== null && l.balancePaise !== running) {
      const gap = l.balancePaise - running;
      issues.push({
        line: l.lineNo,
        message: `Balance after line ${l.lineNo} is off by ${gap / 100} - a line before it may be missing`,
        amountPaise: gap,
      });
      running = l.balancePaise; // resync so one gap is reported once
    }
  }
  const computed = open + lines.reduce((s, l) => s + l.creditPaise - l.debitPaise, 0);
  const close = closing ?? (lines.length && lines[lines.length - 1].balancePaise !== null ? lines[lines.length - 1].balancePaise! : computed);
  return {
    openingBalancePaise: open,
    closingBalancePaise: close,
    computedClosingPaise: computed,
    mismatchPaise: close - computed,
    issues,
  };
}
