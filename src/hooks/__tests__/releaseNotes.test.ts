import { describe, it, expect, vi } from 'vitest';

vi.mock('@capgo/capacitor-updater', () => ({ CapacitorUpdater: {} }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false }, CapacitorHttp: {} }));

import { summarizeReleaseNotes } from '../useLiveUpdate';

describe('summarizeReleaseNotes', () => {
  it('strips the Markdown heading and emoji prefix', () => {
    expect(summarizeReleaseNotes("### 🚀 What's New in this Update: Cleaner Activity screen\n\n- item")).toBe('Cleaner Activity screen');
  });
  it('falls through to the next line when the heading has no text', () => {
    expect(summarizeReleaseNotes("### 🚀 What's New in this Update:\n\n**Cleaner Activity screen**")).toBe('Cleaner Activity screen');
  });
  it('skips merge-commit lines in favour of the PR title', () => {
    expect(summarizeReleaseNotes("### 🚀 What's New in this Update: Merge pull request #5 from someone/branch\n\nAndroid Google sign-in: always show the account chooser")).toBe('Android Google sign-in: always show the account chooser');
  });
  it('skips Markdown divider lines', () => {
    expect(summarizeReleaseNotes('---\n\nCleaner Activity screen')).toBe('Cleaner Activity screen');
  });
  it('has a fallback for empty bodies', () => {
    expect(summarizeReleaseNotes('')).toBe('New improvements and fixes.');
  });
});
