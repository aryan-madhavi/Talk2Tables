import React from 'react';
import { ArrowRight } from 'lucide-react';

interface LoginFormProps {
  onSubmit: (e: React.FormEvent) => void;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email Address
        </label>
        <input
          type="email"
          id="email"
          required
          placeholder="sarah@talk2tables.gov.in"
          className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm
                     focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                     transition-colors outline-none"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          type="password"
          id="password"
          required
          placeholder="••••••••"
          className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm
                     focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                     transition-colors outline-none"
        />
      </div>

      <button
        type="submit"
        className="w-full flex items-center justify-center py-3 px-4 rounded-lg shadow-sm
                   text-sm font-medium text-white bg-blue-700 hover:bg-blue-800
                   focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                   transition-colors"
      >
        Sign In <ArrowRight className="ml-2 w-4 h-4" />
      </button>
    </form>
  );
}