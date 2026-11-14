import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';

// Public OAuth web client id (not a secret: it ships in every build). The
// Android plugin also uses it as the "server client id" so the ID token's
// audience is the same on both platforms.
export const GOOGLE_CLIENT_ID: string =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '888676247797-cn7buordb6vqmd7qm6a35u8n6smievcr.apps.googleusercontent.com';

export const isNative = (): boolean => Capacitor.isNativePlatform();

/** True when the user simply closed the Google account picker. */
export function isCancelError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '');
  return /cancel|dismiss|12501|USER_CANCELLED/i.test(msg);
}

// --- Android (native account picker) ---------------------------------

let nativeInitialized = false;

export async function nativeGoogleIdToken(): Promise<string> {
  if (!nativeInitialized) {
    await SocialLogin.initialize({ google: { webClientId: GOOGLE_CLIENT_ID } });
    nativeInitialized = true;
  }
  const response = await SocialLogin.login({
    provider: 'google',
    options: { scopes: ['email', 'profile'] },
  });
  const idToken = (response?.result as any)?.idToken;
  if (!idToken) throw new Error('Google did not return an identity token.');
  return idToken;
}

export async function nativeGoogleSignOut(): Promise<void> {
  if (!isNative() || !nativeInitialized) return;
  try {
    await SocialLogin.logout({ provider: 'google' });
  } catch {
    // Not signed in natively - nothing to do.
  }
}

// --- Web (Google Identity Services button) ---------------------------

let webCallback: ((idToken: string) => void) | null = null;
let webInitialized = false;

function waitForGis(timeoutMs = 10_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const gis = window.google?.accounts?.id;
      if (gis) return resolve(gis);
      if (Date.now() - started > timeoutMs) {
        return reject(new Error('Google sign-in could not load. Check your connection and reload.'));
      }
      setTimeout(check, 100);
    };
    check();
  });
}

/**
 * Renders Google's "Continue with Google" button into `el`. `onIdToken` is
 * called with the ID token (credential) after the user picks an account.
 */
export async function renderWebGoogleButton(el: HTMLElement, onIdToken: (idToken: string) => void): Promise<void> {
  const gis = await waitForGis();
  webCallback = onIdToken;
  if (!webInitialized) {
    gis.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response: { credential?: string }) => {
        if (response?.credential && webCallback) webCallback(response.credential);
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: true,
    });
    webInitialized = true;
  }
  gis.renderButton(el, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    text: 'continue_with',
    logo_alignment: 'left',
    width: Math.min(320, el.clientWidth || 320),
  });
}

export function webGoogleSignOut(): void {
  try {
    window.google?.accounts?.id?.disableAutoSelect?.();
  } catch {
    // ignore
  }
}
