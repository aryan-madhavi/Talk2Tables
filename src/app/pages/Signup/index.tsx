// src/app/pages/Signup/index.tsx

import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router';
import { MessageSquare } from 'lucide-react';
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
  deleteUser,
} from 'firebase/auth';

import { SignupForm } from './components/SignupForm';
import { useAuth }    from '../../../context/AuthContext';
import { signup }     from '../../../lib/authService';

export default function Signup() {
  const { user }     = useAuth();
  const navigate     = useNavigate();
  const location     = useLocation();

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, from, navigate]);

  async function handleSignup(email: string, password: string, displayName: string) {
    setError(null);
    setLoading(true);
    const auth = getAuth();

    // Keep a ref to the newly created Firebase user so we can delete it
    // if the backend call fails — must be captured before any await that
    // could change auth.currentUser.
    let freshFirebaseUser: any = null;

    try {
      // ── Step 1: Create Firebase Auth account ───────────────────────────
      const { user: fbUser } = await createUserWithEmailAndPassword(auth, email, password);
      freshFirebaseUser = fbUser;   // capture ref immediately for cleanup

      // ── Step 2: Set displayName on Firebase Auth profile ───────────────
      await updateProfile(fbUser, { displayName });

      // ── Step 3: POST to backend — creates/updates Firestore doc with role="admin" ──
      const idToken = await fbUser.getIdToken();
      await signup(idToken, displayName);
      
      freshFirebaseUser = null; // success path — no cleanup needed

      // Redirect to login page as requested by user
      navigate('/login', { 
        state: { 
          message: 'Account created successfully! Please sign in.',
          email: email // optional: pre-fill email if LoginForm supports it
        }, 
        replace: true 
      });

    } catch (err: any) {
      // Safety net: if we still have the ref and cleanup didn't run above
      if (freshFirebaseUser) {
        await deleteUser(freshFirebaseUser).catch(() => {});
      }

      const code = err?.code ?? '';
      const friendly: Record<string, string> = {
        'auth/email-already-in-use':   'An account with this email already exists.',
        'auth/invalid-email':          'Please enter a valid email address.',
        'auth/weak-password':          'Password must be at least 6 characters.',
        'auth/network-request-failed': 'Network error. Please check your connection.',
        'auth/too-many-requests':      'Too many attempts. Please try again later.',
      };
      setError(friendly[code] ?? err?.message ?? 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="p-8">

          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-700 rounded-2xl flex items-center justify-center shadow-md">
              <MessageSquare className="w-8 h-8 text-white" />
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Create your account</h1>
            <p className="text-gray-500 text-sm">Ask your database in plain language</p>
          </div>

          <SignupForm onSubmit={handleSignup} loading={loading} error={error} />

        </div>

        <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-sm">
          <span className="text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-700 hover:text-blue-800 font-medium">
              Sign in
            </Link>
          </span>
          <span className="text-gray-400">v0.0.1</span>
        </div>
      </div>
    </div>
  );
}
