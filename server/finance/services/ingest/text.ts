// Turns an email body (plain text or HTML) into normalised plain text that
// parsers can run regexes over.

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rupee: '₹',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h\d|table)>/gi, '\n')
      .replace(/<\/(td|th)>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

export function looksLikeHtml(s: string): boolean {
  return /<(html|body|div|table|p|br|span)\b/i.test(s);
}

/** Plain text with collapsed spaces; newlines kept (single). */
export function normaliseBody(body: string): string {
  const text = looksLikeHtml(body) ? htmlToText(body) : decodeEntities(body);
  return text
    .replace(/\r/g, '')
    .replace(/[\t  ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Single-line version for regexes that span what were table cells. */
export function flat(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Keep only the last 4 digits of a masked number ("XXXXXX9564" -> "9564"). */
export function last4(masked: string | undefined | null): string | undefined {
  if (!masked) return undefined;
  const digits = masked.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : undefined;
}

/** Hides every run of 5+ digits except its last 4 (for logs, review text). */
export function maskNumbers(s: string): string {
  return s.replace(/\d{5,}/g, (m) => 'X'.repeat(m.length - 4) + m.slice(-4));
}
