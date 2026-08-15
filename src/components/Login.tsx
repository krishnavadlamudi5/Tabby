/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { DEMO_USERS } from '../data/demoData';
import { 
  signInWithGoogle, 
  signInWithEmail, 
  registerWithEmail, 
  sendOtpApi, 
  resetPasswordApi 
} from '../lib/api';
import { 
  Sparkles, 
  ArrowRight, 
  ArrowLeft,
  Phone, 
  Mail, 
  Lock, 
  ShieldCheck, 
  RefreshCw, 
  User as UserIcon, 
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  AlertCircle,
  Check
} from 'lucide-react';
import AppLogo from './AppLogo';

interface LoginProps {
  onLogin: (user: User) => void;
}

const COUNTRY_CODES = [
  { code: '+91', name: 'India', iso: 'IN' },
  { code: '+1', name: 'USA & Canada', iso: 'US/CA' },
  { code: '+44', name: 'United Kingdom', iso: 'UK' },
  { code: '+971', name: 'United Arab Emirates', iso: 'UAE' },
  { code: '+61', name: 'Australia', iso: 'AU' },
  { code: '+65', name: 'Singapore', iso: 'SG' },
  { code: '+49', name: 'Germany', iso: 'DE' },
  { code: '+33', name: 'France', iso: 'FR' },
  { code: '+81', name: 'Japan', iso: 'JP' },
  { code: '+55', name: 'Brazil', iso: 'BR' },
  { code: '+86', name: 'China', iso: 'CN' },
];

export default function Login({ onLogin }: LoginProps) {
  // Modes: 'signin' | 'register' | 'forgot'
  const [activeTab, setActiveTab] = useState<'signin' | 'register' | 'forgot'>('signin');

  // Input states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpMethod, setOtpMethod] = useState<'sms' | 'email'>('sms');

  // OTP flow states
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [generatedOtp, setGeneratedOtp] = useState<string>('');
  const [enteredOtp, setEnteredOtp] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [otpNotice, setOtpNotice] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  // Google Modal states
  const [showGoogleModal, setShowGoogleModal] = useState<boolean>(false);
  const [googleEmail, setGoogleEmail] = useState<string>('');
  const [googleName, setGoogleName] = useState<string>('');

  const fullPhone = `${countryCode}${phoneNumber.trim()}`;

  // Cooldown countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Initialize Google Identity Services (GIS) One-Tap / ID Token listener if available
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '888676247797-cn7buordb6vqmd7qm6a35u8n6smievcr.apps.googleusercontent.com';
    if (typeof window !== 'undefined' && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: any) => {
            if (response?.credential) {
              const payload = parseGoogleJwt(response.credential);
              if (payload && payload.email) {
                setIsLoading(true);
                setErrorMsg('');
                try {
                  const user = await signInWithGoogle({
                    email: payload.email,
                    name: payload.name || payload.email.split('@')[0],
                    avatar: payload.picture || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80`,
                    googleId: payload.sub,
                  });
                  onLogin(user);
                } catch (backendErr: any) {
                  setErrorMsg(backendErr.message || 'Failed to authenticate with Google account.');
                } finally {
                  setIsLoading(false);
                }
              }
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
      } catch (err) {
        console.warn('Google One-Tap initialization error:', err);
      }
    }
  }, [onLogin]);

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, text: '', color: '' };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass) || /[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 1) return { score: 1, text: 'Weak', color: 'bg-red-400' };
    if (score <= 2) return { score: 2, text: 'Fair', color: 'bg-amber-400' };
    if (score <= 3) return { score: 3, text: 'Good', color: 'bg-blue-400' };
    return { score: 4, text: 'Strong', color: 'bg-emerald-500' };
  };

  // Helper to safely parse Google ID Token (JWT) without external network calls
  const parseGoogleJwt = (token: string): any => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  };

  // Real Google OAuth 2.0 Identity Services Trigger
  const handleGoogleSignIn = () => {
    setErrorMsg('');
    setIsLoading(true);

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '888676247797-cn7buordb6vqmd7qm6a35u8n6smievcr.apps.googleusercontent.com';

    // 1. If official Google GIS SDK is loaded on page, open real Google account picker popup
    if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
      try {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'email profile openid',
          callback: async (tokenResponse: any) => {
            if (tokenResponse.error) {
              console.warn('Google OAuth origin mismatch or error:', tokenResponse);
              setIsLoading(false);
              setShowGoogleModal(true);
              return;
            }

            if (tokenResponse.access_token) {
              let googleProfile: any = null;

              // Try fetching real profile from Google userinfo endpoints
              try {
                const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                });
                if (res.ok) {
                  googleProfile = await res.json();
                } else {
                  // Secondary fallback endpoint
                  const fallbackRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
                    headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                  });
                  if (fallbackRes.ok) {
                    googleProfile = await fallbackRes.json();
                  }
                }
              } catch (fetchErr: any) {
                console.warn('Direct userinfo fetch failed (possibly blocked by ad-blocker):', fetchErr);
              }

              // If userinfo endpoint could not be reached, open fallback selection modal
              if (!googleProfile || !googleProfile.email) {
                setIsLoading(false);
                setShowGoogleModal(true);
                return;
              }

              // Authenticate with Tabby backend
              try {
                const user = await signInWithGoogle({
                  email: googleProfile.email,
                  name: googleProfile.name || googleProfile.email.split('@')[0],
                  avatar: googleProfile.picture || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80`,
                  googleId: googleProfile.sub,
                });
                onLogin(user);
              } catch (backendErr: any) {
                console.error('Backend Google Sign-In error:', backendErr);
                setErrorMsg(backendErr.message || 'Failed to sign in with Google. Please check your backend connection.');
              } finally {
                setIsLoading(false);
              }
              return;
            }

            setIsLoading(false);
            setShowGoogleModal(true);
          },
        });

        tokenClient.requestAccessToken({ prompt: 'select_account' });
        return;
      } catch (gisError) {
        console.warn('Google GIS popup failed, falling back to selection modal:', gisError);
      }
    }

    // 2. Fallback if GIS is blocked by extensions or offline:
    setIsLoading(false);
    setShowGoogleModal(true);
  };

  const handleGoogleSubmit = async (customEmail?: string, customName?: string) => {
    setErrorMsg('');
    const emailToUse = customEmail || googleEmail.trim();
    if (!emailToUse) {
      setErrorMsg('Please enter your Google email address.');
      return;
    }

    setIsLoading(true);
    try {
      const nameToUse = customName || googleName.trim() || emailToUse.split('@')[0];
      const avatarToUse = `https://images.unsplash.com/photo-${1535713875002 + Math.floor(Math.random() * 1000)}?auto=format&fit=crop&w=150&h=150&q=80`;

      const user = await signInWithGoogle({
        email: emailToUse,
        name: nameToUse,
        avatar: avatarToUse,
      });

      setShowGoogleModal(false);
      onLogin(user);
    } catch (err: any) {
      console.error('Google Sign In Error:', err);
      setErrorMsg(err.message || 'Failed to sign in with Google.');
    } finally {
      setIsLoading(false);
    }
  };

  // 1. Direct Password Sign In (Email or Mobile + Password)
  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const loginIdentifier = email.trim() || phoneNumber.trim();
    if (!loginIdentifier || !password) {
      setErrorMsg('Please enter your email/phone number and password');
      return;
    }

    setIsLoading(true);
    try {
      const user = await signInWithEmail(loginIdentifier, password);
      onLogin(user);
    } catch (err: any) {
      console.error('Email Sign In failed:', err);
      setErrorMsg(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Start Registration & Send OTP
  const handleStartRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!name.trim()) {
      setErrorMsg('Please enter your full name');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address');
      return;
    }
    if (phoneNumber.replace(/\D/g, '').length < 7) {
      setErrorMsg('Please enter a valid mobile number (at least 7 digits)');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long for secure account creation');
      return;
    }

    setIsLoading(true);
    try {
      const destination = email.trim();
      await sendOtpApi(destination, 'register');
      
      setStep('otp');
      setResendCooldown(60);
      setOtpNotice(`We sent a 6-digit verification code to ${destination}. Please check your email inbox to verify and complete registration.`);
    } catch (err: any) {
      console.error('Send OTP error:', err);
      setErrorMsg(err.message || 'Failed to generate verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Verify OTP & Complete Registration
  const handleVerifyRegisterOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (enteredOtp.trim().length !== 6) {
      setErrorMsg('Please enter the complete 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    try {
      const user = await registerWithEmail(name.trim(), email.trim(), fullPhone, password, enteredOtp.trim());
      onLogin(user);
    } catch (err: any) {
      console.error('Registration error:', err);
      setErrorMsg(err.message || 'Failed to verify and create account.');
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Start Password Reset Flow
  const handleStartForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const target = email.trim() || phoneNumber.trim();
    if (!target) {
      setErrorMsg('Please enter your registered email address or mobile number');
      return;
    }

    setIsLoading(true);
    try {
      const destination = target.includes('@')
        ? target
        : (target.startsWith('+') ? target : `${countryCode}${target.replace(/\D/g, '')}`);
      await sendOtpApi(destination, 'reset');
      
      setStep('otp');
      setResendCooldown(60);
      setOtpNotice(`We sent a 6-digit password reset code to ${destination}. Please check your messages and enter it below.`);
    } catch (err: any) {
      console.error('Forgot password error:', err);
      setErrorMsg(err.message || 'Failed to find account or send code.');
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Complete Password Reset
  const handleVerifyResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (enteredOtp.trim().length !== 6) {
      setErrorMsg('Please enter the 6-digit verification code.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('New password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);
    try {
      const target = email.trim() || phoneNumber.trim();
      const destination = target.includes('@')
        ? target
        : (target.startsWith('+') ? target : `${countryCode}${target.replace(/\D/g, '')}`);
      const res = await resetPasswordApi(destination, enteredOtp.trim(), newPassword);
      
      onLogin(res.user);
    } catch (err: any) {
      console.error('Reset password verification error:', err);
      setErrorMsg(err.message || 'Failed to reset password. Please check your code.');
    } finally {
      setIsLoading(false);
    }
  };

  const strength = getPasswordStrength(password);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F5F2] p-4 md:p-6" id="login-container">
      <div className="w-full max-w-md bg-white border border-[#E6E1DA] rounded-3xl shadow-xl p-6 md:p-8 flex flex-col gap-6 relative overflow-hidden" id="login-card">
        
        {/* Brand Logo Header */}
        <div className="flex flex-col items-center text-center gap-1.5" id="brand-header">
          <AppLogo size="lg" showText={true} />
          <p className="text-xs text-[#736F6A] max-w-xs mt-1" id="brand-tagline">
            Split bills, track shared expenses & settle up seamlessly with MongoDB.
          </p>
        </div>

        {/* 1-Tap Google Sign In */}
        {activeTab !== 'forgot' && step === 'form' && (
          <div className="flex flex-col gap-3" id="social-auth-section">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full py-3 px-4 bg-white border border-[#E6E1DA] hover:border-[#3C5A48] hover:bg-[#FAF8F5] active:scale-[0.99] text-[#2C2B29] font-bold text-sm rounded-2xl transition-all shadow-xs flex items-center justify-center gap-3 cursor-pointer group"
              id="google-signin-btn"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.39 7.34 24 12 24z" />
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.16 0 9.98 0 12s.45 3.84 1.24 5.42l4.04-3.15z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.61 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
              </svg>
              <span>Continue with Google</span>
              <ChevronRight className="w-4 h-4 text-[#736F6A] group-hover:translate-x-0.5 transition-transform ml-auto" />
            </button>

            {/* Divider */}
            <div className="relative flex py-1 items-center" id="auth-divider">
              <div className="flex-grow border-t border-[#E6E1DA]"></div>
              <span className="flex-shrink mx-3 text-[10px] font-extrabold text-[#736F6A] uppercase tracking-wider">
                Or Use Account Credentials
              </span>
              <div className="flex-grow border-t border-[#E6E1DA]"></div>
            </div>
          </div>
        )}

        {/* Auth Mode Tabs: Log In vs Create Account */}
        {activeTab !== 'forgot' && step === 'form' && (
          <div className="grid grid-cols-2 p-1 bg-[#FAF8F5] rounded-2xl border border-[#E6E1DA]" id="auth-tabs">
            <button
              type="button"
              onClick={() => {
                setActiveTab('signin');
                setStep('form');
                setErrorMsg('');
              }}
              className={`py-2.5 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'signin'
                  ? 'bg-white text-[#3C5A48] shadow-xs border border-[#E6E1DA]'
                  : 'text-[#736F6A] hover:text-[#2C2B29]'
              }`}
              id="tab-signin-btn"
            >
              <Lock className="w-3.5 h-3.5" /> Log In
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('register');
                setStep('form');
                setErrorMsg('');
              }}
              className={`py-2.5 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'register'
                  ? 'bg-white text-[#3C5A48] shadow-xs border border-[#E6E1DA]'
                  : 'text-[#736F6A] hover:text-[#2C2B29]'
              }`}
              id="tab-register-btn"
            >
              <UserIcon className="w-3.5 h-3.5" /> Create Account
            </button>
          </div>
        )}

        {/* Error Alert Box */}
        {errorMsg && (
          <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-xl font-semibold flex items-start gap-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success Alert Box */}
        {successMsg && (
          <div className="p-3 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-semibold flex items-start gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW 1: SIGN IN (Direct Password Login, NO OTP required)   */}
        {/* ========================================================= */}
        {activeTab === 'signin' && step === 'form' && (
          <form onSubmit={handleSignInSubmit} className="flex flex-col gap-4 animate-fadeIn" id="signin-form">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[#2C2B29]">Email or Mobile Number</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="alex.morgan@gmail.com or 555-0199"
                  value={email || phoneNumber}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.includes('@') || /[a-zA-Z]/.test(val)) {
                      setEmail(val);
                      setPhoneNumber('');
                    } else {
                      setPhoneNumber(val);
                      setEmail('');
                    }
                  }}
                  required
                  className="w-full px-3.5 py-2.5 border border-[#E6E1DA] rounded-xl text-sm focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-[#FAF8F5]/40 text-[#2C2B29]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#2C2B29]">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('forgot');
                    setStep('form');
                    setErrorMsg('');
                  }}
                  className="text-[11px] font-bold text-[#3C5A48] hover:underline cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 pr-10 border border-[#E6E1DA] rounded-xl text-sm focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-[#FAF8F5]/40 text-[#2C2B29]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-[#736F6A] hover:text-[#2C2B29] cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-1 py-3 px-4 bg-[#3C5A48] hover:bg-[#2E4738] active:scale-[0.99] text-white font-bold text-sm rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              id="submit-signin-btn"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Signing In...</span>
                </div>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* ========================================================= */}
        {/* VIEW 2: CREATE ACCOUNT (User Details + Send Verification) */}
        {/* ========================================================= */}
        {activeTab === 'register' && step === 'form' && (
          <form onSubmit={handleStartRegistration} className="flex flex-col gap-3.5 animate-fadeIn" id="register-form">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[#2C2B29]">Full Name</label>
              <input
                type="text"
                placeholder="Alex Morgan"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="px-3.5 py-2 border border-[#E6E1DA] rounded-xl text-sm focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-[#FAF8F5]/40 text-[#2C2B29]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[#2C2B29]">Email Address</label>
              <input
                type="email"
                placeholder="alex.morgan@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="px-3.5 py-2 border border-[#E6E1DA] rounded-xl text-sm focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-[#FAF8F5]/40 text-[#2C2B29]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[#2C2B29]">Mobile Number</label>
              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="px-2.5 py-2 border border-[#E6E1DA] rounded-xl text-xs font-bold bg-white text-[#2C2B29] focus:outline-none focus:border-[#3C5A48] shadow-2xs shrink-0 max-w-[130px]"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={`${c.code}-${c.iso}`} value={c.code}>
                      {c.code} ({c.iso})
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  placeholder="555-0199"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                  className="flex-1 px-3.5 py-2 border border-[#E6E1DA] rounded-xl text-sm focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-[#FAF8F5]/40 text-[#2C2B29]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#2C2B29]">Create Password</label>
                {password && (
                  <span className="text-[10px] font-bold text-[#736F6A]">
                    Strength: <span className="text-[#3C5A48]">{strength.text}</span>
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 pr-10 border border-[#E6E1DA] rounded-xl text-sm focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-[#FAF8F5]/40 text-[#2C2B29]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-[#736F6A] hover:text-[#2C2B29] cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {password && (
                <div className="w-full bg-[#E6E1DA]/50 h-1 rounded-full overflow-hidden mt-1">
                  <div 
                    className={`h-full transition-all duration-300 ${strength.color}`} 
                    style={{ width: `${(strength.score / 4) * 100}%` }}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 p-3 bg-[#EBF1ED] border border-[#3C5A48]/20 rounded-xl text-xs text-[#3C5A48] font-medium">
              <Mail className="w-4 h-4 shrink-0 text-[#3C5A48]" />
              <span>A 6-digit verification code will be sent to your email address.</span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-1 py-3 px-4 bg-[#3C5A48] hover:bg-[#2E4738] active:scale-[0.99] text-white font-bold text-sm rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              id="submit-register-btn"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Sending Verification Code...</span>
                </div>
              ) : (
                <>
                  <span>Create Account & Verify</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* ========================================================= */}
        {/* VIEW 3: FORGOT PASSWORD (Enter Destination)               */}
        {/* ========================================================= */}
        {activeTab === 'forgot' && step === 'form' && (
          <form onSubmit={handleStartForgot} className="flex flex-col gap-4 animate-fadeIn" id="forgot-form">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('signin');
                  setErrorMsg('');
                }}
                className="p-1.5 rounded-lg text-[#736F6A] hover:text-[#2C2B29] hover:bg-[#FAF8F5] transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h3 className="text-sm font-bold text-[#2C2B29]">Reset Your Password</h3>
                <p className="text-xs text-[#736F6A]">Enter your email or phone to receive a reset code.</p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[#2C2B29]">Email or Phone Number</label>
              <input
                type="text"
                placeholder="alex.morgan@gmail.com or 555-0199"
                value={email || phoneNumber}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.includes('@') || /[a-zA-Z]/.test(val)) {
                    setEmail(val);
                    setPhoneNumber('');
                  } else {
                    setPhoneNumber(val);
                    setEmail('');
                  }
                }}
                required
                className="px-3.5 py-2.5 border border-[#E6E1DA] rounded-xl text-sm focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-[#FAF8F5]/40 text-[#2C2B29]"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-[#3C5A48] hover:bg-[#2E4738] active:scale-[0.99] text-white font-bold text-sm rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Sending Code...</span>
                </div>
              ) : (
                <>
                  <span>Send Reset Code</span>
                  <KeyRound className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* ========================================================= */}
        {/* VIEW 4: OTP VERIFICATION SCREEN (For Register or Reset)   */}
        {/* ========================================================= */}
        {step === 'otp' && (
          <form 
            onSubmit={activeTab === 'forgot' ? handleVerifyResetOtp : handleVerifyRegisterOtp} 
            className="flex flex-col gap-4 animate-fadeIn" 
            id="otp-form"
          >
            <div className="p-3.5 bg-[#EBF1ED] border border-[#3C5A48]/30 rounded-2xl flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-[#3C5A48] flex-shrink-0 mt-0.5" />
              <div className="text-xs min-w-0">
                <p className="font-bold text-[#2C2B29]">Enter Verification Code</p>
                <p className="text-[#3C5A48] font-semibold mt-0.5 leading-relaxed">{otpNotice}</p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[#2C2B29]">6-Digit Security Code</label>
              <input
                type="text"
                maxLength={6}
                placeholder="••••••"
                value={enteredOtp}
                onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
                className="px-3.5 py-3 border border-[#E6E1DA] rounded-xl text-center tracking-[0.4em] text-2xl font-mono font-extrabold focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-white text-[#2C2B29]"
              />
            </div>

            {/* If resetting password, provide new password input */}
            {activeTab === 'forgot' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#2C2B29]">Create New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 pr-10 border border-[#E6E1DA] rounded-xl text-sm focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-[#FAF8F5]/40 text-[#2C2B29]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-[#736F6A] hover:text-[#2C2B29] cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-[#3C5A48] hover:bg-[#2E4738] active:scale-[0.99] text-white font-bold text-sm rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Verifying...</span>
                </div>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{activeTab === 'forgot' ? 'Reset Password & Sign In' : 'Verify & Complete Registration'}</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-between text-xs text-[#736F6A] pt-1">
              <button
                type="button"
                onClick={() => {
                  setStep('form');
                  setErrorMsg('');
                }}
                className="hover:text-[#2C2B29] underline cursor-pointer"
              >
                Back to Edit
              </button>
              
              <button
                type="button"
                disabled={resendCooldown > 0}
                onClick={async () => {
                  const target = email.trim() || phoneNumber.trim();
                  const destination = target.includes('@') ? target : `${countryCode}${target}`;
                  try {
                    const res = await sendOtpApi(destination, activeTab === 'forgot' ? 'reset' : 'register');
                    setGeneratedOtp(res.code || '123456');
                    setResendCooldown(60);
                    setOtpNotice(`Resent code to ${destination}. Code: ${res.code}`);
                  } catch (e: any) {
                    setErrorMsg(e.message || 'Failed to resend code');
                  }
                }}
                className={`font-bold flex items-center gap-1 cursor-pointer ${
                  resendCooldown > 0 ? 'text-[#736F6A]/50 cursor-not-allowed' : 'text-[#3C5A48] hover:underline'
                }`}
              >
                <RefreshCw className={`w-3 h-3 ${resendCooldown > 0 ? 'opacity-50' : ''}`} /> 
                <span>{resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}</span>
              </button>
            </div>
          </form>
        )}

        {/* BOTTOM SECTION: 1-Click Instant Demo Users */}
        <div className="pt-4 border-t border-[#E6E1DA] flex flex-col gap-2.5" id="demo-accounts-bottom">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-[#736F6A] uppercase tracking-wider">
              1-Click Demo Accounts (Instant Test)
            </span>
            <span className="text-[10px] text-[#3C5A48] font-bold flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Ready
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {DEMO_USERS.slice(0, 2).map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => onLogin(user)}
                className="flex items-center gap-2.5 p-2.5 border border-[#E6E1DA] rounded-xl hover:border-[#3C5A48] hover:bg-[#EBF1ED]/40 transition-all text-left group cursor-pointer bg-[#FAF8F5]/30"
                id={`demo-user-btn-${user.id}`}
              >
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-7 h-7 rounded-full object-cover border border-[#E6E1DA]"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-[#2C2B29] truncate">{user.name}</h4>
                  <p className="text-[10px] text-[#736F6A] truncate">Demo User</p>
                </div>
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* ========================================================= */}
      {/* GOOGLE SIGN IN MODAL DIALOG                                */}
      {/* ========================================================= */}
      {showGoogleModal && (
        <div className="fixed inset-0 z-50 bg-[#2C2B29]/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm border border-[#E6E1DA] shadow-2xl flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.39 7.34 24 12 24z" />
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.16 0 9.98 0 12s.45 3.84 1.24 5.42l4.04-3.15z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.61 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                </svg>
                <span className="font-extrabold text-sm text-[#2C2B29]">Sign in with Google</span>
              </div>
              <button 
                onClick={() => setShowGoogleModal(false)}
                className="text-[#736F6A] hover:text-[#2C2B29] text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#736F6A] leading-relaxed">
              Choose an active Google profile or enter your Google email to sign in directly to MongoDB.
            </p>

            {/* Quick 1-tap profiles */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleGoogleSubmit('alex.split@gmail.com', 'Alex Morgan')}
                className="flex items-center gap-3 p-2.5 rounded-2xl border border-[#E6E1DA] hover:border-[#3C5A48] hover:bg-[#FAF8F5] transition-all text-left cursor-pointer"
              >
                <img 
                  src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80" 
                  alt="Alex" 
                  className="w-9 h-9 rounded-full object-cover border border-[#E6E1DA]"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#2C2B29]">Alex Morgan (Demo)</p>
                  <p className="text-[10px] text-[#736F6A] truncate">alex.split@gmail.com</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleGoogleSubmit('sarah.c@gmail.com', 'Sarah Chen')}
                className="flex items-center gap-3 p-2.5 rounded-2xl border border-[#E6E1DA] hover:border-[#3C5A48] hover:bg-[#FAF8F5] transition-all text-left cursor-pointer"
              >
                <img 
                  src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80" 
                  alt="Sarah" 
                  className="w-9 h-9 rounded-full object-cover border border-[#E6E1DA]"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#2C2B29]">Sarah Chen (Demo)</p>
                  <p className="text-[10px] text-[#736F6A] truncate">sarah.c@gmail.com</p>
                </div>
              </button>
            </div>

            <div className="relative flex py-0.5 items-center">
              <div className="flex-grow border-t border-[#E6E1DA]"></div>
              <span className="flex-shrink mx-2 text-[10px] font-bold text-[#736F6A] uppercase">or enter custom email</span>
              <div className="flex-grow border-t border-[#E6E1DA]"></div>
            </div>

            <div className="flex flex-col gap-2">
              <input
                type="email"
                placeholder="your.email@gmail.com"
                value={googleEmail}
                onChange={(e) => setGoogleEmail(e.target.value)}
                className="px-3.5 py-2 border border-[#E6E1DA] rounded-xl text-xs focus:outline-none focus:border-[#3C5A48] bg-[#FAF8F5]/40"
              />
              <input
                type="text"
                placeholder="Your Full Name (Optional)"
                value={googleName}
                onChange={(e) => setGoogleName(e.target.value)}
                className="px-3.5 py-2 border border-[#E6E1DA] rounded-xl text-xs focus:outline-none focus:border-[#3C5A48] bg-[#FAF8F5]/40"
              />
              <button
                type="button"
                onClick={() => handleGoogleSubmit()}
                className="w-full mt-1 py-2.5 bg-[#3C5A48] hover:bg-[#2E4738] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
              >
                Sign In with this Google Account
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
