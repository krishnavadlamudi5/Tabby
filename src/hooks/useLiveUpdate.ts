/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export type UpdateCheckResult = 'available' | 'up-to-date' | 'error';

export interface LiveUpdateState {
  isUpdateAvailable: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  latestVersion: string | null;
  releaseNotes: string | null;
  downloadUrl: string | null;
  error: string | null;
  /** Version of the bundle currently running ('builtin' = the one shipped inside the APK). */
  currentVersion: string | null;
  showBanner: boolean;
  setShowBanner: (show: boolean) => void;
  checkForUpdate: (isManualCheck?: boolean) => Promise<UpdateCheckResult>;
  applyUpdate: () => Promise<void>;
  dismissUpdate: () => void;
}

const GITHUB_REPO = 'krishnavadlamudi5/Tabby';
const STORAGE_CURRENT_VERSION_KEY = 'tabby_app_active_version';
const STORAGE_DISMISSED_VERSION_KEY = 'tabby_dismissed_update_version';
const STORAGE_RELEASE_ETAG_KEY = 'tabby_gh_release_etag';
const STORAGE_RELEASE_CACHE_KEY = 'tabby_gh_release_cache';

/** "v1.1.57_cachebust_123" -> "1.1.57" */
function normalizeVersion(v: string | null | undefined): string {
  return (v || '').trim().replace(/^v/i, '').split('_cachebust_')[0];
}

function parseVersion(v: string): number[] | null {
  return /^\d+(\.\d+)*$/.test(v) ? v.split('.').map(Number) : null;
}

/** True when `remote` is strictly newer than `current`. An unknown current version always loses. */
function isNewerVersion(remote: string, current: string): boolean {
  const r = parseVersion(remote);
  if (!r) return false;
  const c = parseVersion(current);
  if (!c) return true;
  for (let i = 0; i < Math.max(r.length, c.length); i++) {
    const diff = (r[i] ?? 0) - (c[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/**
 * Version/commit/date baked into this exact JS bundle at build time by CI.
 * Because it travels inside the bundle, it is correct both for the code that
 * shipped inside the APK and for any OTA bundle applied later.
 */
export const BUILD_INFO = {
  version: normalizeVersion(import.meta.env.VITE_APP_VERSION) || null,
  commit: import.meta.env.VITE_APP_COMMIT || null,
  buildDate: import.meta.env.VITE_APP_BUILD_DATE || null,
};

/**
 * Resolves any HTTP 301/302 redirects to obtain the direct asset URL (e.g. AWS/Azure CDN link from GitHub Release).
 * Android's background HttpURLConnection in DownloadWorker does not automatically follow cross-domain redirects.
 */
async function resolveDirectDownloadUrl(initialUrl: string): Promise<string> {
  let targetUrl = initialUrl;
  let attempts = 0;
  const maxRedirects = 5;

  while (attempts < maxRedirects) {
    attempts++;
    try {
      if (Capacitor.isNativePlatform()) {
        const response = await CapacitorHttp.request({
          method: 'GET',
          url: targetUrl,
          headers: {
            'Accept': 'application/octet-stream',
          },
          disableRedirects: true,
          connectTimeout: 15000,
          readTimeout: 15000,
        });

        const redirectLocation = response.headers?.location || response.headers?.Location;
        if (redirectLocation && response.status >= 300 && response.status < 400) {
          console.log(`[LiveUpdate] Resolved redirect (${response.status}) -> ${redirectLocation}`);
          targetUrl = redirectLocation;
          continue;
        }

        // If status is 200 or no more redirects, return response.url if valid
        if (response.url && response.url !== targetUrl && response.url.startsWith('http')) {
          targetUrl = response.url;
        }
        break;
      } else {
        break;
      }
    } catch (e) {
      console.warn('[LiveUpdate] Redirect resolution attempt failed:', e);
      break;
    }
  }

  return targetUrl;
}

/**
 * capacitor-updater rejects with a bare "Failed to download from: <url>" and
 * hides the real cause in `code`/`data`, so pull everything out for the banner.
 */
function describeUpdateError(err: any): string {
  const parts = [err?.message || String(err)];
  if (err?.code) parts.push(`code: ${err.code}`);
  const detail = err?.data?.message || err?.data?.error || err?.cause?.message;
  if (detail) parts.push(String(detail));
  return parts.join(' — ');
}

export function useLiveUpdate(): LiveUpdateState {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [showBanner, setShowBanner] = useState<boolean>(false);

  // Check for updates
  const checkForUpdate = useCallback(async (isManualCheck: boolean = false): Promise<UpdateCheckResult> => {
    try {
      setError(null);

      // Conditional request via ETag instead of a `?t=` cache-buster: GitHub
      // still re-validates freshness on every call (so this is never stale),
      // but a 304 response does NOT count against the unauthenticated
      // rate limit (60/hr per IP) the way a full 200 always does. That limit
      // is shared across every device polling from behind the same IP
      // (office/campus NAT, carrier-grade NAT, etc.) every 15 minutes, so
      // this materially reduces the odds of update checks silently failing
      // once a handful of users share an egress IP.
      const storedEtag = localStorage.getItem(STORAGE_RELEASE_ETAG_KEY);
      const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
      if (storedEtag) headers['If-None-Match'] = storedEtag;

      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers,
        cache: 'no-store',
      });

      let release: any;
      if (response.status === 304) {
        // Not modified - reuse the last release payload we cached alongside its ETag.
        const cached = localStorage.getItem(STORAGE_RELEASE_CACHE_KEY);
        if (!cached) return 'error'; // nothing to compare against yet; wait for the next full fetch
        release = JSON.parse(cached);
      } else if (!response.ok) {
        // If 404 (no releases yet) or rate-limited, skip silently unless manual check
        if (isManualCheck) {
          setError(response.status === 404 ? 'No updates found on GitHub yet.' : 'GitHub check limit reached. Please try later.');
        }
        return 'error';
      } else {
        release = await response.json();
        const newEtag = response.headers.get('ETag');
        if (newEtag) {
          localStorage.setItem(STORAGE_RELEASE_ETAG_KEY, newEtag);
          localStorage.setItem(STORAGE_RELEASE_CACHE_KEY, JSON.stringify(release));
        }
      }
      const remoteVersion = normalizeVersion(release.tag_name || release.name);
      const zipAsset = release.assets?.find((asset: { name: string; browser_download_url: string }) => asset.name === 'dist.zip');

      if (!remoteVersion || !zipAsset) {
        if (isManualCheck) {
          setError('No dist.zip asset attached to the latest release.');
        }
        return 'error';
      }

      // Check current local version: prefer the version baked into this bundle.
      let currentVersion = '0.0.0';
      if (BUILD_INFO.version) {
        currentVersion = BUILD_INFO.version;
      } else if (Capacitor.isNativePlatform()) {
        try {
          const current = await CapacitorUpdater.current();
          currentVersion = current?.bundle?.version || '0.0.0';
          currentVersion = normalizeVersion(currentVersion);
        } catch (e) {
          console.warn('Could not determine native bundle version:', e);
        }
      } else {
        currentVersion = localStorage.getItem(STORAGE_CURRENT_VERSION_KEY) || '0.0.0';
        currentVersion = normalizeVersion(currentVersion);
      }

      setCurrentVersion(currentVersion);

      // Check if this release was dismissed in this session
      const dismissedVersion = sessionStorage.getItem(STORAGE_DISMISSED_VERSION_KEY);

      if (isNewerVersion(remoteVersion, currentVersion)) {
        setLatestVersion(remoteVersion);
        setDownloadUrl(zipAsset.browser_download_url);
        setReleaseNotes(release.body || 'New enhancements and bug fixes.');
        setIsUpdateAvailable(true);

        if (!dismissedVersion || dismissedVersion !== remoteVersion || isManualCheck) {
          setShowBanner(true);
        }
        return 'available';
      }
      setIsUpdateAvailable(false);
      setShowBanner(false);
      return 'up-to-date';
    } catch (err: any) {
      console.warn('Update check failed or offline:', err);
      if (isManualCheck) {
        setError('Network error while checking for updates.');
      }
      return 'error';
    }
  }, []);

  // Download and apply update
  const applyUpdate = useCallback(async () => {
    if (!latestVersion || !downloadUrl) {
      // Fallback: reload app
      window.location.reload();
      return;
    }

    try {
      setIsDownloading(true);
      setError(null);
      setDownloadProgress(15);

      if (Capacitor.isNativePlatform()) {
        // Native Android / iOS OTA update via CapacitorUpdater
        console.log('[LiveUpdate] Initial download URL:', downloadUrl, 'version:', latestVersion);
        setDownloadProgress(25);

        // Pre-resolve any 302 redirects to direct CDN storage URL (OkHttp / AWS / Azure Blob)
        const directAssetUrl = await resolveDirectDownloadUrl(downloadUrl);
        console.log('[LiveUpdate] Direct asset download URL:', directAssetUrl);
        setDownloadProgress(45);

        const uniqueVersion = `${latestVersion}_cachebust_${Date.now()}`;

        let downloadedBundle;
        try {
          downloadedBundle = await CapacitorUpdater.download({
            url: directAssetUrl,
            version: uniqueVersion,
          });
          console.log('[LiveUpdate] Download complete:', JSON.stringify(downloadedBundle));
        } catch (downloadErr: any) {
          const directMsg = describeUpdateError(downloadErr);
          // If direct URL failed and was different from initial URL, try fallback
          if (directAssetUrl !== downloadUrl) {
            console.warn('[LiveUpdate] Direct URL download failed:', directMsg);
            try {
              downloadedBundle = await CapacitorUpdater.download({
                url: downloadUrl,
                version: uniqueVersion,
              });
            } catch (fallbackErr: any) {
              const combinedMsg = `Update download failed. ${describeUpdateError(fallbackErr)}`;
              console.error('[LiveUpdate]', combinedMsg, { directMsg, directAssetUrl });
              setError(combinedMsg);
              setIsDownloading(false);
              return;
            }
          } else {
            console.error('[LiveUpdate]', directMsg, { directAssetUrl });
            setError(`Update download failed. ${directMsg}`);
            setIsDownloading(false);
            return;
          }
        }

        setDownloadProgress(85);

        if (!downloadedBundle || !downloadedBundle.id) {
          const msg = `Bundle invalid after download: ${JSON.stringify(downloadedBundle)}`;
          console.error('[LiveUpdate]', msg);
          setError('Downloaded bundle is invalid.');
          setIsDownloading(false);
          return;
        }

        try {
          localStorage.setItem(STORAGE_CURRENT_VERSION_KEY, latestVersion);
          setDownloadProgress(100);
          console.log('[LiveUpdate] Calling CapacitorUpdater.set with id:', downloadedBundle.id);
          await CapacitorUpdater.set({ id: downloadedBundle.id });
          // JS context is destroyed after set() — nothing below runs
        } catch (setErr: any) {
          const msg = `Could not apply the update. ${describeUpdateError(setErr)}`;
          console.error('[LiveUpdate]', msg, { bundleId: downloadedBundle.id });
          setError(msg);
          setIsDownloading(false);
        }
      } else {
        // Web Platform update
        setDownloadProgress(60);
        localStorage.setItem(STORAGE_CURRENT_VERSION_KEY, latestVersion);
        setDownloadProgress(100);
        setTimeout(() => {
          window.location.reload();
        }, 400);
      }
    } catch (err: any) {
      const msg = `Unexpected error: ${describeUpdateError(err)}`;
      console.error('[LiveUpdate]', msg);
      setError(msg);
      setIsDownloading(false);
    }
  }, [latestVersion, downloadUrl]);

  // Dismiss update banner
  const dismissUpdate = useCallback(() => {
    if (latestVersion) {
      sessionStorage.setItem(STORAGE_DISMISSED_VERSION_KEY, latestVersion);
    }
    setShowBanner(false);
  }, [latestVersion]);

  // Check on mount and periodically every 15 minutes
  useEffect(() => {
    checkForUpdate();

    const interval = setInterval(() => {
      checkForUpdate();
    }, 15 * 60 * 1000);

    return () => clearInterval(interval);
  }, [checkForUpdate]);

  return {
    isUpdateAvailable,
    isDownloading,
    downloadProgress,
    latestVersion,
    releaseNotes,
    downloadUrl,
    error,
    currentVersion,
    showBanner,
    setShowBanner,
    checkForUpdate,
    applyUpdate,
    dismissUpdate,
  };
}
