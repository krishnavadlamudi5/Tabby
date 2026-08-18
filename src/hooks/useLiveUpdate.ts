/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export interface LiveUpdateState {
  isUpdateAvailable: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  latestVersion: string | null;
  releaseNotes: string | null;
  downloadUrl: string | null;
  error: string | null;
  showBanner: boolean;
  setShowBanner: (show: boolean) => void;
  checkForUpdate: (isManualCheck?: boolean) => Promise<void>;
  applyUpdate: () => Promise<void>;
  dismissUpdate: () => void;
}

const GITHUB_REPO = 'krishnavadlamudi5/Tabby';
const STORAGE_CURRENT_VERSION_KEY = 'tabby_app_active_version';
const STORAGE_DISMISSED_VERSION_KEY = 'tabby_dismissed_update_version';

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
  const [showBanner, setShowBanner] = useState<boolean>(false);

  // Check for updates
  const checkForUpdate = useCallback(async (isManualCheck: boolean = false) => {
    try {
      setError(null);
      // Fetch latest GitHub release metadata with cache-buster timestamp
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest?t=${Date.now()}`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        // If 404 (no releases yet) or rate-limited, skip silently unless manual check
        if (isManualCheck) {
          setError(response.status === 404 ? 'No updates found on GitHub yet.' : 'GitHub check limit reached. Please try later.');
        }
        return;
      }

      const release = await response.json();
      const remoteVersion = release.tag_name || release.name;
      const zipAsset = release.assets?.find((asset: { name: string; browser_download_url: string }) => asset.name === 'dist.zip');

      if (!remoteVersion || !zipAsset) {
        if (isManualCheck) {
          setError('No dist.zip asset attached to the latest release.');
        }
        return;
      }

      // Check current local version
      let currentVersion = '0.0.0';
      if (Capacitor.isNativePlatform()) {
        try {
          const current = await CapacitorUpdater.current();
          currentVersion = current?.bundle?.version || '0.0.0';
          currentVersion = currentVersion.split('_cachebust_')[0];
        } catch (e) {
          console.warn('Could not determine native bundle version:', e);
        }
      } else {
        currentVersion = localStorage.getItem(STORAGE_CURRENT_VERSION_KEY) || '0.0.0';
        currentVersion = currentVersion.split('_cachebust_')[0];
      }

      // Check if this release was dismissed in this session
      const dismissedVersion = sessionStorage.getItem(STORAGE_DISMISSED_VERSION_KEY);

      if (remoteVersion !== currentVersion) {
        setLatestVersion(remoteVersion);
        setDownloadUrl(zipAsset.browser_download_url);
        setReleaseNotes(release.body || 'New enhancements and bug fixes.');
        setIsUpdateAvailable(true);

        if (!dismissedVersion || dismissedVersion !== remoteVersion || isManualCheck) {
          setShowBanner(true);
        }
      } else {
        setIsUpdateAvailable(false);
        setShowBanner(false);
      }
    } catch (err: any) {
      console.warn('Update check failed or offline:', err);
      if (isManualCheck) {
        setError('Network error while checking for updates.');
      }
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
    showBanner,
    setShowBanner,
    checkForUpdate,
    applyUpdate,
    dismissUpdate,
  };
}
