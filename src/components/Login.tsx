import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, PlayCircle, ShieldCheck } from 'lucide-react';
import AppLogo from './AppLogo';
import { useAppStore } from '../store/useAppStore';
import { signInWithGoogleApi } from '../lib/api';
import { isCancelError, isNative, nativeGoogleIdToken, renderWebGoogleButton } from '../lib/googleAuth';

export default function Login() {
  const signIn = useAppStore((s) => s.signIn);
  const startDemo = useAppStore((s) => s.startDemo);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const webButtonRef = useRef<HTMLDivElement>(null);
  const native = isNative();

  const finishSignIn = async (idToken: string) => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const { token, user } = await signInWithGoogleApi(idToken);
      signIn(user, token);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Sign-in failed. Please try again.');
      setIsLoading(false);
    }
  };

  // Web: Google renders its own button into this div.
  useEffect(() => {
    if (native || !webButtonRef.current) return;
    renderWebGoogleButton(webButtonRef.current, finishSignIn).catch((err) => {
      setErrorMsg(err?.message || 'Google sign-in could not load.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native]);

  const handleNativeSignIn = async () => {
    setErrorMsg('');
    setIsLoading(true);
    try {
      const idToken = await nativeGoogleIdToken();
      await finishSignIn(idToken);
    } catch (err: any) {
      setIsLoading(false);
      if (!isCancelError(err)) {
        setErrorMsg(err?.message || 'Google sign-in failed. Please try again.');
      }
    }
  };

  return (
    <div
      className="min-h-screen bg-[#F8F5F2] flex items-center justify-center px-4 py-10 font-sans text-[#2C2B29] antialiased"
      style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 2.5rem)' }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <AppLogo size="lg" />
          <p className="text-sm text-[#736F6A] max-w-xs">
            Split shared expenses with friends and keep track of your own money in one place.
          </p>
        </div>

        <div className="w-full bg-white border border-[#E6E1DA] rounded-3xl p-6 shadow-sm flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-extrabold">Sign in</h1>
            <p className="text-xs text-[#736F6A]">Use your Google account. Your data is private to you.</p>
          </div>

          {native ? (
            <button
              type="button"
              onClick={handleNativeSignIn}
              disabled={isLoading}
              className="w-full h-11 rounded-full border border-[#DADCE0] bg-white hover:bg-[#F8F9FA] active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-3 font-semibold text-sm text-[#3C4043] transition-all cursor-pointer"
              id="google-signin-native-btn"
            >
              <GoogleMark />
              Continue with Google
            </button>
          ) : (
            <div className="w-full flex justify-center min-h-11" ref={webButtonRef} id="google-signin-web-btn" />
          )}

          {isLoading && (
            <div className="flex items-center justify-center gap-2 text-xs text-[#736F6A]">
              <RefreshCw className="w-4 h-4 animate-spin text-[#3C5A48]" />
              Signing you in… the server may take up to a minute to wake up.
            </div>
          )}

          {errorMsg && (
            <div className="text-xs text-[#A64B32] bg-[#FDF3F0] border border-[#C86D51]/30 rounded-xl px-3 py-2" role="alert">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center gap-3 text-[11px] text-[#A39E98]">
            <div className="flex-1 h-px bg-[#E6E1DA]" />
            or
            <div className="flex-1 h-px bg-[#E6E1DA]" />
          </div>

          <button
            type="button"
            onClick={startDemo}
            disabled={isLoading}
            className="w-full h-11 rounded-full bg-[#EBF1ED] hover:bg-[#DCE8E0] text-[#3C5A48] font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
            id="try-demo-btn"
          >
            <PlayCircle className="w-4 h-4" />
            Try the demo
          </button>
          <p className="text-[11px] text-[#A39E98] text-center -mt-2">
            Sample data on this device only. Nothing is sent to the server.
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-[#A39E98]">
          <ShieldCheck className="w-3.5 h-3.5" />
          We only read your name and email from Google.
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
