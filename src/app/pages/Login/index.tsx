// src/app/pages/Login/index.tsx
// Login page — reads from AuthContext, redirects if already authenticated.

import React, { useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router';
import { MessageSquare } from 'lucide-react';
import { LoginForm }  from './components/LoginForm';
// import { SSOButtons } from './components/SSOButtons';
import { useAuth }    from '../../../context/AuthContext';

export default function Login() {
  const { user, login, loading, error, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // After login, go back to the page they originally tried to visit
  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  // Already signed in — redirect immediately
  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, from, navigate]);

  async function handleLogin(email: string, password: string) {
    clearError();
    await login(email, password);
    // Navigation triggered by the useEffect above once user state is set
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
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Talk2Tables</h1>
            <p className="text-gray-500 text-sm">Ask your database in plain language</p>
          </div>

          {/* Form — owns email/password state + shows error + spinner */}
          <LoginForm
            onSubmit={handleLogin}
            loading={loading}
            error={error}
          />

          {/* SSO */}
          {/* <SSOButtons /> */}

          <div className="mt-6 text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <Link to="/signup" className="text-blue-700 hover:text-blue-800 font-medium">
              Sign Up
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-sm">
          {/* <a
            href="#"
            onClick={e => e.preventDefault()}  // TODO: forgot password flow
            className="text-blue-700 hover:text-blue-800 font-medium"
          >
            Forgot password?
          </a> */}
          <span className="text-gray-400">v0.0.1</span>
        </div>

      </div>
    </div>
  );
}
