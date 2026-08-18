/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Capacitor } from '@capacitor/core';

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
        } catch (e) {
          console.warn('Could not determine native bundle version:', e);
        }
      } else {
        currentVersion = localStorage.getItem(STORAGE_CURRENT_VERSION_KEY) || '0.0.0';
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
        console.log('[LiveUpdate] Starting download:', downloadUrl, 'version:', latestVersion);
        setDownloadProgress(35);

        let downloadedBundle;
        try {
          downloadedBundle = await CapacitorUpdater.download({
            url: downloadUrl,
            version: latestVersion,
          });
          console.log('[LiveUpdate] Download complete:', JSON.stringify(downloadedBundle));
        } catch (downloadErr: any) {
          const msg = `Download failed: ${downloadErr?.message || String(downloadErr)}`;
          console.error('[LiveUpdate]', msg);
          alert(`[Tabby Update Debug]\n${msg}\n\nURL: ${downloadUrl}`);
          setError(msg);
          setIsDownloading(false);
          return;
        }

        setDownloadProgress(85);

        if (!downloadedBundle || !downloadedBundle.id) {
          const msg = `Bundle invalid after download: ${JSON.stringify(downloadedBundle)}`;
          console.error('[LiveUpdate]', msg);
          alert(`[Tabby Update Debug]\n${msg}`);
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
          const msg = `Set bundle failed: ${setErr?.message || String(setErr)}`;
          console.error('[LiveUpdate]', msg);
          alert(`[Tabby Update Debug]\n${msg}\n\nBundle ID: ${downloadedBundle.id}`);
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
      const msg = `Unexpected error: ${err?.message || String(err)}`;
      console.error('[LiveUpdate]', msg);
      alert(`[Tabby Update Debug]\n${msg}`);
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
