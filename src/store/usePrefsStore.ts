import { create } from 'zustand';
import { getPreferencesApi, savePreferencesApi, Preferences } from '../lib/api';
import { readJson, writeJson } from '../lib/storage';
import { useToastStore } from './useToastStore';

const KEY = 'tabby_prefs';

/**
 * User preferences, saved to the account (so they follow you across
 * devices) and cached on the device. Every change saves immediately.
 */
interface PrefsState {
  prefs: Preferences;
  load: () => Promise<void>;
  save: (patch: Preferences, quiet?: boolean) => Promise<void>;
  reset: () => void;
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  prefs: readJson<Preferences>(KEY) || {},
  load: async () => {
    try {
      const prefs = await getPreferencesApi();
      writeJson(KEY, prefs);
      set({ prefs });
    } catch {
      // offline: keep the cached copy
    }
  },
  save: async (patch, quiet = false) => {
    const before = get().prefs;
    const optimistic = { ...before, ...patch, alerts: { ...(before.alerts || {}), ...(patch.alerts || {}) } };
    set({ prefs: optimistic });
    writeJson(KEY, optimistic);
    try {
      const saved = await savePreferencesApi(patch);
      set({ prefs: saved });
      writeJson(KEY, saved);
      if (!quiet) useToastStore.getState().addToast('Saved', 'success');
    } catch (e: any) {
      set({ prefs: before });
      writeJson(KEY, before);
      useToastStore.getState().addToast(e?.message || 'Could not save', 'error');
    }
  },
  reset: () => {
    writeJson(KEY, null);
    set({ prefs: {} });
  },
}));
