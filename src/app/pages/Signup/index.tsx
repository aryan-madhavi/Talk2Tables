// src/app/pages/Signup/index.tsx
// Signup page — allow new users to register for an on-prem account.

import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router';
import { MessageSquare } from 'lucide-react';
import { SignupForm } from './components/SignupForm';
import { useAuth }    from '../../../context/AuthContext';
import { signup as apiSignup } from '../../../lib/authService';
import { toast } from 'sonner';

export default function Signup() {
  const { user, login, clearError } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect if already signed in
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';
  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, from, navigate]);

  async function handleSignup(email: string, password: string, displayName: string) {
    setError(null);
    setLoading(true);
    try {
      await apiSignup(email, password, displayName);
      toast.success('Account created! Logging you in...');
      // Auto-login after successful signup
      await login(email, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Signup failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg overflow-hidden">

        <div className="p-8">

          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-700 rounded-2xl flex items-center justify-center shadow-md">
              <MessageSquare className="w-8 h-8 text-white" />
            </div>
          </div>

          {/* Heading */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Create Account</h1>
            <p className="text-gray-500 text-sm">Join Talk2Tables for local data insights</p>
          </div>

          {/* Form */}
          <SignupForm
            onSubmit={handleSignup}
            loading={loading}
            error={error}
          />

          <div className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-700 hover:text-blue-800 font-medium">
              Sign In
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex justify-center items-center text-sm">
          <span className="text-gray-400">v1.0.4</span>
        </div>

      </div>
    </div>
  );
}
