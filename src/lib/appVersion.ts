import { Capacitor } from '@capacitor/core';

/** Version of the web bundle currently running (OTA bundle on Android). */
export async function currentAppVersion(): Promise<string> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
      const current = await CapacitorUpdater.current();
      const v = current?.bundle?.version;
      if (v && v !== 'builtin') return v.split('_cachebust_')[0];
      return 'built-in (APK)';
    }
  } catch {
    // fall through
  }
  return (localStorage.getItem('tabby_app_active_version') || 'web').split('_cachebust_')[0];
}

export const APK_DOWNLOAD_URL = 'https://github.com/krishnavadlamudi5/Tabby/actions/workflows/build-apk.yml';
