// src/app/pages/Signup/components/SignupForm.tsx

import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Check, X } from 'lucide-react';

interface SignupFormProps {
  onSubmit: (email: string, password: string, displayName: string, organizationName: string) => Promise<void>;
  loading:  boolean;
  error:    string | null;
}

interface PasswordRule {
  label: string;
  test:  (pw: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: 'At least 8 characters',         test: pw => pw.length >= 8 },
  { label: 'One uppercase letter',           test: pw => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter',           test: pw => /[a-z]/.test(pw) },
  { label: 'One number',                     test: pw => /\d/.test(pw) },
];

export function SignupForm({ onSubmit, loading, error }: SignupFormProps) {
  const [organizationName, setOrganizationName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [touched,     setTouched]     = useState({ password: false, confirm: false });

  const rules        = PASSWORD_RULES.map(r => ({ ...r, ok: r.test(password) }));
  const passwordOk   = rules.every(r => r.ok);
  const confirmOk    = password === confirm && confirm.length > 0;
  const canSubmit    = organizationName.trim() && displayName.trim() && email && passwordOk && confirmOk && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    await onSubmit(email, password, displayName.trim(), organizationName.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <span className="mt-0.5 shrink-0">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* Organization Name */}
      <div>
        <label htmlFor="organizationName" className="block text-sm font-medium text-gray-700 mb-1">
          Organization Name
        </label>
        <input
          type="text"
          id="organizationName"
          required
          autoComplete="organization"
          placeholder="Acme Corp"
          value={organizationName}
          onChange={e => setOrganizationName(e.target.value)}
          disabled={loading}
          className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm
                     focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                     disabled:bg-gray-50 disabled:text-gray-400
                     transition-colors outline-none"
        />
      </div>

      {/* Display Name */}
      <div>
        <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
          Full Name
        </label>
        <input
          type="text"
          id="displayName"
          required
          autoComplete="name"
          placeholder="Jane Smith"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          disabled={loading}
          className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm
                     focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                     disabled:bg-gray-50 disabled:text-gray-400
                     transition-colors outline-none"
        />
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email Address
        </label>
        <input
          type="email"
          id="email"
          required
          autoComplete="email"
          placeholder="user@company.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          disabled={loading}
          className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm
                     focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                     disabled:bg-gray-50 disabled:text-gray-400
                     transition-colors outline-none"
        />
      </div>

      {/* Password */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <div className="relative">
          <input
            type={showPass ? 'text' : 'password'}
            id="password"
            required
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onBlur={() => setTouched(t => ({ ...t, password: true }))}
            disabled={loading}
            className="w-full px-4 py-3 pr-11 rounded-lg border border-gray-300 text-sm
                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                       disabled:bg-gray-50 disabled:text-gray-400
                       transition-colors outline-none"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPass(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {/* Password strength rules — shown once user starts typing */}
        {(touched.password || password.length > 0) && (
          <ul className="mt-2 space-y-1">
            {rules.map(r => (
              <li key={r.label} className="flex items-center gap-1.5 text-xs">
                {r.ok
                  ? <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  : <X     className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                }
                <span className={r.ok ? 'text-green-600' : 'text-gray-400'}>{r.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Confirm Password */}
      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
          Confirm Password
        </label>
        <div className="relative">
          <input
            type={showConfirm ? 'text' : 'password'}
            id="confirm"
            required
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            onBlur={() => setTouched(t => ({ ...t, confirm: true }))}
            disabled={loading}
            className={`w-full px-4 py-3 pr-11 rounded-lg border text-sm
                        focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                        disabled:bg-gray-50 disabled:text-gray-400
                        transition-colors outline-none
                        ${touched.confirm && confirm && !confirmOk
                          ? 'border-red-400 bg-red-50'
                          : 'border-gray-300'
                        }`}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowConfirm(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {touched.confirm && confirm && !confirmOk && (
          <p className="mt-1 text-xs text-red-500">Passwords do not match.</p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full flex items-center justify-center py-3 px-4 rounded-lg shadow-sm
                   text-sm font-medium text-white bg-blue-700 hover:bg-blue-800
                   focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors"
      >
        {loading ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path   className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Creating account…
          </>
        ) : (
          <>
            Create Account <ArrowRight className="ml-2 w-4 h-4" />
          </>
        )}
      </button>

    </form>
  );
}
