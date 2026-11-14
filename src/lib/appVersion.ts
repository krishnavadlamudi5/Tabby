import { Capacitor } from '@capacitor/core';
import { BUILD_INFO } from '../hooks/useLiveUpdate';

/**
 * Version of the code running now: the version CI baked into this bundle
 * (shared by the APK and its OTA release), else the active OTA bundle.
 */
export async function currentAppVersion(): Promise<string> {
  if (BUILD_INFO.version) return `v${BUILD_INFO.version}`;
  try {
    if (Capacitor.isNativePlatform()) {
      const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
      const v = (await CapacitorUpdater.current())?.bundle?.version;
      if (v && v !== 'builtin') return v.split('_cachebust_')[0];
    }
  } catch {
    // fall through
  }
  return 'Development build';
}

/** Every version and what changed (GitHub Releases, one per build). */
export const RELEASES_URL = 'https://github.com/krishnavadlamudi5/Tabby/releases';
/** APK builds (GitHub Actions artifacts "Tabby-Android-App-Debug-v<version>"). */
export const APK_DOWNLOAD_URL = 'https://github.com/krishnavadlamudi5/Tabby/actions/workflows/build-apk.yml';
