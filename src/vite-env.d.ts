/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** e.g. "1.1.57" — set by CI; absent in local / Netlify builds. */
  readonly VITE_APP_VERSION?: string;
  readonly VITE_APP_COMMIT?: string;
  readonly VITE_APP_BUILD_DATE?: string;
}

interface Window {
  google?: any;
}
