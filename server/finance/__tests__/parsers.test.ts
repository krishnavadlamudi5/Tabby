import { describe, expect, it } from 'vitest';
import { loadFixtures } from './fixtures';
import { detectType } from '../services/ingest/detect';
import { findParser } from '../services/ingest/parsers';
import { normaliseBody } from '../services/ingest/text';

const fixtures = loadFixtures();

describe('email parsers (fixtures F1-F16 and scenario extras)', () => {
  it.each(fixtures.map((f) => [f.name, f] as const))('%s', (_name, f) => {
    const text = normaliseBody(f.bodyText);
    const detected = detectType(f.sender, f.subject, text);
    if (f.expected.detectedType) {
      expect(detected).toBe(f.expected.detectedType);
      return;
    }
    const parser = findParser(f.sender, f.subject);
    expect(parser, 'a parser for this sender').toBeTruthy();
    const ext = parser!.parse({ sender: f.sender, subject: f.subject, text, receivedAt: new Date(f.receivedAt) });
    expect(ext, 'parsed').toBeTruthy();
    const { occurredAt, expectedAt, dueDate, commitmentStatus, ...rest } = f.expected;
    expect(ext).toMatchObject(rest);
    if (occurredAt) expect(ext!.occurredAt?.toISOString()).toBe(occurredAt);
    if (expectedAt) expect(ext!.expectedAt?.toISOString()).toBe(expectedAt);
    if (dueDate) expect(ext!.dueDate?.toISOString()).toBe(dueDate);
    if (commitmentStatus) expect(ext!.commitment?.status).toBe(commitmentStatus);
    expect(ext!.confidence).toBe(1);
  });

  it('reads Blinkit line items', () => {
    const f = fixtures.find((x) => x.name.startsWith('X06'))!;
    const ext = findParser(f.sender, f.subject)!.parse({ sender: f.sender, subject: f.subject, text: normaliseBody(f.bodyText), receivedAt: new Date() });
    expect(ext!.lineItems!.map((i) => i.name)).toContain('Amul Taaza Toned Milk 500 ml');
    expect(ext!.lineItems).toHaveLength(7);
  });

  it('never treats a declined card alert as a successful one', () => {
    const f = fixtures.find((x) => x.name.startsWith('F02'))!;
    const ext = findParser(f.sender, f.subject)!.parse({ sender: f.sender, subject: f.subject, text: normaliseBody(f.bodyText), receivedAt: new Date() });
    expect(ext!.eventType).toBe('declined');
  });
});

import { groceryKeyForItem } from '../services/ledger/groceryDictionary';
describe('grocery dictionary', () => {
  it.each([
    ['Tomatoes 1 kg', 'groceries.vegetables'], ['Lays Classic Salted', 'groceries.snacks'], ['Tata Salt 1kg', 'groceries.staples'],
    ['Amul Fresh Cream', 'groceries.dairy'], ['Vim Dishwash Liquid', 'groceries.household'], ['Colgate toothpaste', 'groceries.personal_care'],
    ['Mystery item', null],
  ])('%s -> %s', (name, key) => expect(groceryKeyForItem(name)).toBe(key));
});
