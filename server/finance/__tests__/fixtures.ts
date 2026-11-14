import fs from 'fs';
import path from 'path';

export interface EmailFixture {
  name: string;
  messageId: string;
  sender: string;
  subject: string;
  receivedAt: string;
  bodyText: string;
  expected: Record<string, any>;
}

const dir = path.join(__dirname, '..', '__fixtures__', 'emails');

export function loadFixtures(): EmailFixture[] {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({
    name: f.replace('.json', ''),
    ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')),
  }));
}

export function fixture(prefix: string): EmailFixture {
  const f = loadFixtures().find((x) => x.name.startsWith(prefix));
  if (!f) throw new Error(`No fixture ${prefix}`);
  return f;
}
