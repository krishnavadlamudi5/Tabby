import { createRequire } from 'module';
import path from 'path';
import { StatementParseError } from './parse';

/**
 * Plain text from a PDF, trying no password and then each candidate
 * password. Returns '' for scanned (image-only) PDFs - those are read on the
 * phone with OCR instead.
 */
export async function pdfToText(data: Buffer, passwords: string[] = []): Promise<{ text: string; pages: number; usedPassword: boolean }> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const tries: (string | undefined)[] = [undefined, ...passwords.filter(Boolean)];
  let lastErr: unknown;
  for (const password of tries) {
    try {
      const doc = await pdfjs.getDocument({ data: new Uint8Array(data), password, isEvalSupported: false, useSystemFonts: false, standardFontDataUrl: standardFontsDir() }).promise;
      const lines: string[] = [];
      for (let p = 1; p <= Math.min(doc.numPages, 20); p++) {
        const content = await (await doc.getPage(p)).getTextContent();
        const rows = new Map<number, { x: number; s: string }[]>();
        for (const item of content.items as any[]) {
          if (!item.str?.trim()) continue;
          const y = Math.round(item.transform[5]);
          const key = Array.from(rows.keys()).find((k) => Math.abs(k - y) <= 2) ?? y;
          rows.set(key, [...(rows.get(key) || []), { x: item.transform[4], s: item.str.trim() }]);
        }
        Array.from(rows.entries()).sort((a, b) => b[0] - a[0]).forEach(([, items]) => lines.push(items.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ')));
      }
      return { text: lines.join('\n'), pages: doc.numPages, usedPassword: Boolean(password) };
    } catch (err: any) {
      lastErr = err;
      if (err?.name !== 'PasswordException') break;
    }
  }
  if ((lastErr as any)?.name === 'PasswordException') {
    throw new StatementParseError('This PDF is password protected. Save its password under Insurance → PDF passwords.', 'password_needed');
  }
  throw new StatementParseError('Could not read this PDF');
}

/** pdf.js needs its bundled standard fonts in Node (avoids a warning on every PDF). */
function standardFontsDir(): string {
  const require = createRequire(import.meta.url);
  return path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;
}
