// src/app/pages/Login/components/LoginForm.tsx

import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';

interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  loading:  boolean;
  error:    string | null;
}

export function LoginForm({ onSubmit, loading, error }: LoginFormProps) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(email, password);
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
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
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
            {showPass
              ? <EyeOff className="w-4 h-4" />
              : <Eye    className="w-4 h-4" />
            }
          </button>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !email || !password}
        className="w-full flex items-center justify-center py-3 px-4 rounded-lg shadow-sm
                   text-sm font-medium text-white bg-blue-700 hover:bg-blue-800
                   focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors"
      >
        {loading ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
              fill="none" viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25" cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="4"
              />
              <path
                className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Signing in…
          </>
        ) : (
          <>
            Sign In <ArrowRight className="ml-2 w-4 h-4" />
          </>
        )}
      </button>

    </form>
  );
}