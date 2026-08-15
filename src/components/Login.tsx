/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User } from '../types';
import { DEMO_USERS } from '../data/demoData';
import { signInWithGoogle, signInWithEmail, registerWithEmail } from '../lib/firebase';
import { 
  Sparkles, 
  ArrowRight, 
  Phone, 
  Mail, 
  Lock, 
  ShieldCheck, 
  RefreshCw, 
  User as UserIcon, 
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import AppLogo from './AppLogo';

interface LoginProps {
  onLogin: (user: User) => void;
}

const COUNTRY_CODES = [
  { code: '+1', name: 'USA & Canada', iso: 'US/CA' },
  { code: '+91', name: 'India', iso: 'IN' },
  { code: '+44', name: 'United Kingdom', iso: 'UK' },
  { code: '+61', name: 'Australia', iso: 'AU' },
  { code: '+971', name: 'United Arab Emirates', iso: 'UAE' },
  { code: '+49', name: 'Germany', iso: 'DE' },
  { code: '+33', name: 'France', iso: 'FR' },
  { code: '+81', name: 'Japan', iso: 'JP' },
  { code: '+65', name: 'Singapore', iso: 'SG' },
  { code: '+55', name: 'Brazil', iso: 'BR' },
  { code: '+86', name: 'China', iso: 'CN' },
];

export default function Login({ onLogin }: LoginProps) {
  // Main Tab: 'signin' or 'register'
  const [activeTab, setActiveTab] = useState<'signin' | 'register'>('signin');

  // Input states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [otpMethod, setOtpMethod] = useState<'sms' | 'email'>('sms');

  // Flow & error states
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [generatedOtp, setGeneratedOtp] = useState<string>('');
  const [enteredOtp, setEnteredOtp] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [otpNotice, setOtpNotice] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fullPhone = `${countryCode}${phoneNumber.trim()}`;

  // 1-Tap Google Sign-In Handler
  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setIsLoading(true);
    try {
      const user = await signInWithGoogle();
      onLogin(user);
    } catch (err: any) {
      console.error('Google Sign In Error:', err);
      setErrorMsg(err.message || 'Failed to sign in with Google.');
    } finally {
      setIsLoading(false);
    }
  };

  // Direct Sign In (Email or Phone + Password)
  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const loginIdentifier = email.trim() || phoneNumber.trim();
    if (!loginIdentifier || !password) {
      setErrorMsg('Please enter your email/phone number and password');
      return;
    }

    setIsLoading(true);
    try {
      const userEmailVal = loginIdentifier.includes('@')
        ? loginIdentifier
        : `${loginIdentifier.replace(/\D/g, '')}@tabby.app`;
      const user = await signInWithEmail(userEmailVal, password);
      onLogin(user);
    } catch (err: any) {
      console.error('Firebase Email Sign In failed:', err);
      setErrorMsg(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  // Start Registration & Generate OTP
  const handleStartRegistration = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

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

    // Generate 6-digit OTP code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(code);
    setStep('otp');

    const destination = otpMethod === 'sms' ? fullPhone : email.trim();
    setOtpNotice(`Verification code sent via ${otpMethod.toUpperCase()} to ${destination}. Demo code: ${code}`);
  };

  // Verify OTP & Complete Registration
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (enteredOtp.trim() !== generatedOtp) {
      setErrorMsg('Invalid OTP code. Please check and try again.');
      return;
    }

    setIsLoading(true);
    try {
      const user = await registerWithEmail(name.trim(), email.trim(), fullPhone, password);
      onLogin(user);
    } catch (err: any) {
      console.error('Firebase registration error:', err);
      setErrorMsg(err.message || 'Failed to register account.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F5F2] p-4 md:p-6" id="login-container">
      <div className="w-full max-w-md bg-white border border-[#E6E1DA] rounded-3xl shadow-md p-6 md:p-8 flex flex-col gap-6" id="login-card">
        
        {/* Brand Logo Header */}
        <div className="flex flex-col items-center text-center gap-2" id="brand-header">
          <AppLogo size="lg" showText={true} />
          <p className="text-xs text-[#736F6A] max-w-xs mt-1" id="brand-tagline">
            Split bills, track expenses, and settle debts with friends easily.
          </p>
        </div>

        {/* 1-Tap Google Sign In */}
        <div className="flex flex-col gap-3" id="social-auth-section">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full py-2.5 px-4 bg-white border border-[#E6E1DA] hover:border-[#3C5A48] hover:bg-[#FAF8F5] text-[#2C2B29] font-bold text-sm rounded-2xl transition-all shadow-2xs flex items-center justify-center gap-3 cursor-pointer group"
            id="google-signin-btn"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.39 7.34 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.16 0 9.98 0 12s.45 3.84 1.24 5.42l4.04-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.61 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>Continue with Google</span>
            <ChevronRight className="w-4 h-4 text-[#736F6A] group-hover:translate-x-0.5 transition-transform ml-auto" />
          </button>
        </div>

        {/* Divider */}
        <div className="relative flex py-1 items-center" id="auth-divider">
          <div className="flex-grow border-t border-[#E6E1DA]"></div>
          <span className="flex-shrink mx-3 text-[11px] font-bold text-[#736F6A] uppercase tracking-wider">
            Or Use Account Credentials
          </span>
          <div className="flex-grow border-t border-[#E6E1DA]"></div>
        </div>

        {/* Auth Mode Tabs: Sign In vs Create Account */}
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

        {/* Error Alert Box */}
        {errorMsg && (
          <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-xl font-semibold flex items-start gap-2">
            <span>{errorMsg}</span>
          </div>
        )}

        {/* STEP 1: FORM INPUTS */}
        {step === 'form' && (
          <>
            {/* SIGN IN FORM */}
            {activeTab === 'signin' && (
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
                  </div>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="px-3.5 py-2.5 border border-[#E6E1DA] rounded-xl text-sm focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-[#FAF8F5]/40 text-[#2C2B29]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full mt-1 py-3 px-4 bg-[#3C5A48] hover:bg-[#2E4738] text-white font-bold text-sm rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                  id="submit-signin-btn"
                >
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* CREATE ACCOUNT / REGISTRATION FORM */}
            {activeTab === 'register' && (
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
                  <label className="text-xs font-bold text-[#2C2B29]">Create Password</label>
                  <input
                    type="password"
                    placeholder="At least 4 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="px-3.5 py-2 border border-[#E6E1DA] rounded-xl text-sm focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-[#FAF8F5]/40 text-[#2C2B29]"
                  />
                </div>

                <div className="flex flex-col gap-1.5 pt-1">
                  <label className="text-xs font-bold text-[#2C2B29]">Send Verification OTP via</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOtpMethod('sms')}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        otpMethod === 'sms'
                          ? 'border-[#3C5A48] bg-[#EBF1ED] text-[#3C5A48]'
                          : 'border-[#E6E1DA] bg-white text-[#736F6A] hover:bg-[#FAF8F5]'
                      }`}
                    >
                      <Phone className="w-3.5 h-3.5" /> SMS Mobile OTP
                    </button>
                    <button
                      type="button"
                      onClick={() => setOtpMethod('email')}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        otpMethod === 'email'
                          ? 'border-[#3C5A48] bg-[#EBF1ED] text-[#3C5A48]'
                          : 'border-[#E6E1DA] bg-white text-[#736F6A] hover:bg-[#FAF8F5]'
                      }`}
                    >
                      <Mail className="w-3.5 h-3.5" /> Email OTP
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full mt-2 py-3 px-4 bg-[#3C5A48] hover:bg-[#2E4738] text-white font-bold text-sm rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                  id="submit-register-btn"
                >
                  <span>Send OTP & Register</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </>
        )}

        {/* STEP 2: OTP VERIFICATION MODAL / SCREEN */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4 animate-fadeIn" id="otp-form">
            <div className="p-3 bg-[#EBF1ED] border border-[#3C5A48]/30 rounded-2xl flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-[#3C5A48] flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-bold text-[#2C2B29]">Verify Your Account</p>
                <p className="text-[#3C5A48] font-semibold mt-0.5 leading-relaxed">{otpNotice}</p>
                <button
                  type="button"
                  onClick={() => setEnteredOtp(generatedOtp)}
                  className="mt-1 text-[11px] font-bold text-[#2E7D52] underline cursor-pointer hover:text-[#2E4738]"
                >
                  Click to Auto-Fill Test OTP ({generatedOtp})
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[#2C2B29]">Enter 6-Digit Verification Code</label>
              <input
                type="text"
                maxLength={6}
                placeholder="123456"
                value={enteredOtp}
                onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, ''))}
                required
                className="px-3.5 py-3 border border-[#E6E1DA] rounded-xl text-center tracking-widest text-xl font-mono font-extrabold focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-white text-[#2C2B29]"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 bg-[#3C5A48] hover:bg-[#2E4738] text-white font-bold text-sm rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Verify & Complete Registration</span>
            </button>

            <div className="flex items-center justify-between text-xs text-[#736F6A] pt-1">
              <button
                type="button"
                onClick={() => setStep('form')}
                className="hover:text-[#2C2B29] underline"
              >
                Back to Edit Info
              </button>
              <button
                type="button"
                onClick={() => {
                  const code = Math.floor(100000 + Math.random() * 900000).toString();
                  setGeneratedOtp(code);
                  setOtpNotice(`Resent new code. Demo OTP: ${code}`);
                }}
                className="text-[#3C5A48] font-bold flex items-center gap-1 hover:underline"
              >
                <RefreshCw className="w-3 h-3" /> Resend Code
              </button>
            </div>
          </form>
        )}

        {/* BOTTOM SECTION: Compact Demo Accounts for quick testing */}
        <div className="pt-4 border-t border-[#E6E1DA] flex flex-col gap-2.5" id="demo-accounts-bottom">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#736F6A] uppercase tracking-wider">
              Try Demo Account (Instant Test)
            </span>
            <span className="text-[10px] text-[#3C5A48] font-bold flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> 1-Click
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
    </div>
  );
}
