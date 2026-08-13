/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User } from '../types';
import { DEMO_USERS } from '../data/demoData';
import { Sparkles, ArrowRight, Phone, Lock, ShieldCheck, RefreshCw, KeyRound, CheckCircle2 } from 'lucide-react';
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
  const [authMethod, setAuthMethod] = useState<'phone' | 'email'>('phone');
  const [isNewUser, setIsNewUser] = useState(false);

  // Phone registration / login state
  const [countryCode, setCountryCode] = useState('+1');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // OTP Verification state
  const [phoneStep, setPhoneStep] = useState<'input' | 'otp' | 'set_password'>('input');
  const [generatedOtp, setGeneratedOtp] = useState<string>('');
  const [enteredOtp, setEnteredOtp] = useState<string>('');
  const [otpError, setOtpError] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [otpNotice, setOtpNotice] = useState<string>('');

  const fullPhone = `${countryCode}${phoneNumber.trim()}`;

  // Step 1: Send OTP for Phone Sign-up or Phone OTP Login
  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setOtpError('');

    if (phoneNumber.replace(/\D/g, '').length < 7) {
      setLoginError('Please enter a valid mobile number (at least 7 digits)');
      return;
    }

    if (isNewUser && !name.trim()) {
      setLoginError('Please enter your full name');
      return;
    }

    // Generate random 6-digit OTP code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(code);
    setPhoneStep('otp');
    setOtpNotice(`SMS sent to ${fullPhone}. Use code: ${code}`);
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredOtp.trim() !== generatedOtp) {
      setOtpError('Invalid OTP code. Please check and try again.');
      return;
    }

    setOtpError('');
    if (isNewUser) {
      // Move to password setting for new user
      setPhoneStep('set_password');
    } else {
      // Complete OTP login for returning user
      const foundUser = DEMO_USERS.find(
        (u) => u.phone === fullPhone || u.phone?.replace(/\D/g, '') === fullPhone.replace(/\D/g, '')
      );

      const userToLogin: User = foundUser || {
        id: `user-phone-${Date.now()}`,
        name: name.trim() || `User ${phoneNumber.slice(-4)}`,
        email: `${phoneNumber.replace(/\D/g, '')}@splitwise.app`,
        phone: fullPhone,
        avatar: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80`,
      };

      onLogin(userToLogin);
    }
  };

  // Step 3: Complete Password creation & sign up
  const handleCompleteRegistration = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 4) {
      setOtpError('Password must be at least 4 characters long');
      return;
    }

    const newUser: User = {
      id: `user-${Date.now()}`,
      name: name.trim(),
      email: email.trim() || `${phoneNumber.replace(/\D/g, '')}@splitwise.app`,
      phone: fullPhone,
      password: password,
      avatar: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 1000000)}?auto=format&fit=crop&w=150&h=150&q=80`,
    };

    onLogin(newUser);
  };

  // Password-based returning user login
  const handlePasswordLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!phoneNumber.trim() || !password) {
      setLoginError('Please enter phone number and password');
      return;
    }

    const foundUser = DEMO_USERS.find(
      (u) => u.phone === fullPhone || u.phone?.replace(/\D/g, '') === fullPhone.replace(/\D/g, '')
    );

    const loggedUser: User = foundUser || {
      id: `user-phone-${phoneNumber.replace(/\D/g, '')}`,
      name: `User ${phoneNumber.slice(-4)}`,
      email: `${phoneNumber.replace(/\D/g, '')}@splitwise.app`,
      phone: fullPhone,
      password: password,
      avatar: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80`,
    };

    onLogin(loggedUser);
  };

  // Email login form submit
  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isNewUser) {
      if (!name.trim() || !email.trim()) return;
      const newUser: User = {
        id: `user-${Date.now()}`,
        name: name.trim(),
        email: email.trim(),
        avatar: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 1000000)}?auto=format&fit=crop&w=150&h=150&q=80`,
      };
      onLogin(newUser);
    } else {
      const matchedUser = DEMO_USERS.find(
        (u) => u.email.toLowerCase() === email.toLowerCase()
      ) || DEMO_USERS[0];
      onLogin(matchedUser);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F5F2] p-4 md:p-6" id="login-container">
      <div className="w-full max-w-md bg-white border border-[#E6E1DA] rounded-2xl shadow-sm p-6 md:p-8 flex flex-col gap-6" id="login-card">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center gap-2" id="brand-header">
          <AppLogo size="lg" showText={true} />
          <p className="text-sm text-[#736F6A] max-w-xs mt-1" id="brand-tagline">
            Split bills, track expenses, and settle debts with friends easily.
          </p>
        </div>

        {/* Demo Personas Grid */}
        <div className="flex flex-col gap-3" id="demo-personas-section">
          <div className="flex items-center justify-between" id="demo-personas-header">
            <span className="text-xs font-semibold text-[#736F6A] uppercase tracking-wider">Quick Demo Login</span>
            <span className="text-xs text-[#3C5A48] font-semibold flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Ready to test
            </span>
          </div>
          
          <div className="grid grid-cols-1 gap-2" id="demo-personas-grid">
            {DEMO_USERS.map((user) => (
              <button
                key={user.id}
                onClick={() => onLogin(user)}
                className="flex items-center justify-between p-3 border border-[#E6E1DA] rounded-xl hover:border-[#3C5A48] hover:bg-[#EBF1ED]/40 transition-all text-left group cursor-pointer"
                type="button"
                id={`demo-user-btn-${user.id}`}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-9 h-9 rounded-full object-cover border border-[#E6E1DA]"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <h3 className="text-sm font-semibold text-[#2C2B29]">{user.name}</h3>
                    <p className="text-xs text-[#736F6A]">{user.email}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-[#736F6A]/50 group-hover:text-[#3C5A48] transition-colors" />
              </button>
            ))}
          </div>
        </div>

        <div className="relative flex py-1 items-center" id="divider-section">
          <div className="flex-grow border-t border-[#E6E1DA]"></div>
          <span className="flex-shrink mx-4 text-xs font-semibold text-[#736F6A] uppercase tracking-wider">Or Mobile & Email Registration</span>
          <div className="flex-grow border-t border-[#E6E1DA]"></div>
        </div>

        {/* Auth Method Selector (Mobile vs Email) */}
        <div className="grid grid-cols-2 p-1 bg-[#FAF8F5] rounded-xl border border-[#E6E1DA]" id="auth-method-tabs">
          <button
            type="button"
            onClick={() => {
              setAuthMethod('phone');
              setPhoneStep('input');
              setLoginError('');
            }}
            className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              authMethod === 'phone'
                ? 'bg-white text-[#3C5A48] shadow-xs border border-[#E6E1DA]'
                : 'text-[#736F6A] hover:text-[#2C2B29]'
            }`}
          >
            <Phone className="w-3.5 h-3.5" /> Mobile Number
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMethod('email');
              setLoginError('');
            }}
            className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              authMethod === 'email'
                ? 'bg-white text-[#3C5A48] shadow-xs border border-[#E6E1DA]'
                : 'text-[#736F6A] hover:text-[#2C2B29]'
            }`}
          >
            Email Login
          </button>
        </div>

        {/* PHONE REGISTRATION / LOGIN FLOW */}
        {authMethod === 'phone' && (
          <div className="flex flex-col gap-4" id="phone-auth-container">
            {/* Step 1: Input Mobile Number & Name */}
            {phoneStep === 'input' && (
              <form onSubmit={isNewUser ? handleSendOtp : handlePasswordLogin} className="flex flex-col gap-3.5">
                {loginError && (
                  <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-xl font-medium">
                    {loginError}
                  </div>
                )}

                {isNewUser && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-[#2C2B29]">Full Name</label>
                    <input
                      type="text"
                      placeholder="Alex Morgan"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required={isNewUser}
                      className="px-3.5 py-2 border border-[#E6E1DA] rounded-xl text-sm focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-[#FAF8F5]/30 text-[#2C2B29]"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-[#2C2B29]">Mobile Number</label>
                  <div className="flex gap-2">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="px-3 py-2 border border-[#E6E1DA] rounded-xl text-xs font-bold bg-white text-[#2C2B29] focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] cursor-pointer shadow-2xs shrink-0 max-w-[150px]"
                      id="country-code-select"
                    >
                      {COUNTRY_CODES.map((c) => (
                        <option key={`${c.code}-${c.iso}`} value={c.code}>
                          {c.code} ({c.iso}) - {c.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      placeholder="555-0199"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      required
                      className="flex-1 px-3.5 py-2 border border-[#E6E1DA] rounded-xl text-sm focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-[#FAF8F5]/30 text-[#2C2B29]"
                    />
                  </div>
                </div>

                {!isNewUser && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-[#2C2B29]">Password</label>
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        className="text-[11px] font-bold text-[#3C5A48] hover:underline"
                      >
                        Sign in via OTP instead
                      </button>
                    </div>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required={!isNewUser}
                      className="px-3.5 py-2 border border-[#E6E1DA] rounded-xl text-sm focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-[#FAF8F5]/30 text-[#2C2B29]"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full mt-1 py-2.5 px-4 bg-[#3C5A48] hover:bg-[#2E4738] text-white font-semibold text-sm rounded-xl transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isNewUser ? 'Send Verification OTP' : 'Sign In with Mobile'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* Step 2: OTP Verification Prompt */}
            {phoneStep === 'otp' && (
              <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4 animate-fadeIn">
                <div className="p-3 bg-[#EBF1ED] border border-[#3C5A48]/30 rounded-xl flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-[#3C5A48] flex-shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-bold text-[#2C2B29]">OTP Verification Sent</p>
                    <p className="text-[#3C5A48] font-semibold mt-0.5">{otpNotice}</p>
                  </div>
                </div>

                {otpError && (
                  <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-xl font-medium">
                    {otpError}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-[#2C2B29]">Enter 6-Digit OTP Code</label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="123456"
                    value={enteredOtp}
                    onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, ''))}
                    required
                    className="px-3.5 py-2.5 border border-[#E6E1DA] rounded-xl text-center tracking-widest text-lg font-mono font-bold focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-white text-[#2C2B29]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-[#3C5A48] hover:bg-[#2E4738] text-white font-semibold text-sm rounded-xl transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  Verify OTP & Continue
                  <CheckCircle2 className="w-4 h-4" />
                </button>

                <div className="flex items-center justify-between text-xs text-[#736F6A]">
                  <button
                    type="button"
                    onClick={() => setPhoneStep('input')}
                    className="hover:text-[#2C2B29] underline"
                  >
                    Change Mobile Number
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const code = Math.floor(100000 + Math.random() * 900000).toString();
                      setGeneratedOtp(code);
                      setOtpNotice(`Resent SMS to ${fullPhone}. Use code: ${code}`);
                    }}
                    className="text-[#3C5A48] font-bold flex items-center gap-1 hover:underline"
                  >
                    <RefreshCw className="w-3 h-3" /> Resend OTP
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: Set Password / PIN for New User */}
            {phoneStep === 'set_password' && (
              <form onSubmit={handleCompleteRegistration} className="flex flex-col gap-4 animate-fadeIn">
                <div className="p-3 bg-[#EBF1ED] border border-[#3C5A48]/30 rounded-xl flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-[#3C5A48]" />
                  <div className="text-xs">
                    <p className="font-bold text-[#2C2B29]">Mobile Verified! Set Password</p>
                    <p className="text-[#736F6A]">Set a password to easily log in next time.</p>
                  </div>
                </div>

                {otpError && (
                  <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-xl font-medium">
                    {otpError}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-[#2C2B29]">Create Account Password</label>
                  <input
                    type="password"
                    placeholder="At least 4 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="px-3.5 py-2 border border-[#E6E1DA] rounded-xl text-sm focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-[#FAF8F5]/30 text-[#2C2B29]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-[#2C2B29]">Email Address (Optional)</label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="px-3.5 py-2 border border-[#E6E1DA] rounded-xl text-sm focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-[#FAF8F5]/30 text-[#2C2B29]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-[#3C5A48] hover:bg-[#2E4738] text-white font-semibold text-sm rounded-xl transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  Complete Registration
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        )}

        {/* EMAIL LOGIN FORM */}
        {authMethod === 'email' && (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3.5" id="email-login-form">
            {isNewUser && (
              <div className="flex flex-col gap-1.5" id="form-group-name">
                <label htmlFor="name-input" className="text-xs font-bold text-[#2C2B29]">Full Name</label>
                <input
                  id="name-input"
                  type="text"
                  placeholder="Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={isNewUser}
                  className="px-3.5 py-2 border border-[#E6E1DA] rounded-xl text-sm focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-[#FAF8F5]/30 text-[#2C2B29]"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5" id="form-group-email">
              <label htmlFor="email-input" className="text-xs font-bold text-[#2C2B29]">Email Address</label>
              <input
                id="email-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="px-3.5 py-2 border border-[#E6E1DA] rounded-xl text-sm focus:outline-none focus:border-[#3C5A48] focus:ring-1 focus:ring-[#3C5A48] bg-[#FAF8F5]/30 text-[#2C2B29]"
              />
            </div>

            <button
              type="submit"
              className="w-full mt-1 py-2.5 px-4 bg-[#3C5A48] hover:bg-[#2E4738] text-white font-semibold text-sm rounded-xl transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              id="login-submit-btn"
            >
              {isNewUser ? 'Create Account' : 'Sign In with Email'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Form Toggle (New User vs Log In) */}
        <div className="text-center pt-2 border-t border-[#E6E1DA]" id="form-toggle-section">
          <button
            type="button"
            onClick={() => {
              setIsNewUser(!isNewUser);
              setPhoneStep('input');
              setLoginError('');
              setOtpError('');
            }}
            className="text-xs font-semibold text-[#3C5A48] hover:text-[#2E4738] transition-colors focus:outline-none cursor-pointer"
            id="toggle-auth-btn"
          >
            {isNewUser ? 'Already registered? Log in here' : 'New user? Register with Mobile & OTP'}
          </button>
        </div>
      </div>
    </div>
  );
}
