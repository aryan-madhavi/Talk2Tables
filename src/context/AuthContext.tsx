// src/context/AuthContext.tsx
// Global auth state — wrap the entire app with <AuthProvider>.
//
// Boot sequence on every page load / refresh:
//   1. loading = true  (ProtectedRoute shows spinner, NO redirect yet)
//   2. Firebase onAuthStateChanged fires — may take 0-2s to restore cached session
//   3. If fbUser exists  → POST /token-active → GET /me → set user
//   4. If fbUser is null → set user = null
//   5. loading = false  → ProtectedRoute now decides: allow or redirect to /login
//
// The key fix for the refresh-redirect bug:
//   loading stays TRUE until onAuthStateChanged has fired AND we've finished
//   the backend session check. ProtectedRoute must never redirect while
//   loading === true. This prevents the flicker where Firebase hasn't yet
//   restored the cached session from IndexedDB.

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth }             from '../lib/firebaseConfig';
import {
  login  as apiLogin,
  logout as apiLogout,
  checkTokenActive,
  getMe,
  BackendUser,
}                           from '../lib/authService';

// ── Context shape ─────────────────────────────────────────────────────────────

interface AuthContextValue {
  /** Full user profile from Firestore. null = not logged in. */
  user:        BackendUser | null;
  /**
   * TRUE during the initial boot session check.
   * ProtectedRoute MUST wait for this to be false before redirecting.
   */
  loading:     boolean;
  /** Last error string from a failed login attempt. */
  error:       string | null;
  login:       (email: string, password: string) => Promise<void>;
  logout:      () => Promise<void>;
  clearError:  () => void;
  isAdmin:     boolean;
  isPowerUser: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<BackendUser | null>(null);
  const [loading, setLoading] = useState(true);   // ← stays true until Firebase resolves
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    // onAuthStateChanged fires once on mount:
    //   • Immediately if Firebase has no cached session
    //   • After restoring from IndexedDB if the user was previously signed in
    //     (this can take up to ~1-2 seconds on a slow device)
    // We must NOT set loading=false or redirect before this callback fires.
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        // No Firebase session at all — definitely logged out
        setUser(null);
        setLoading(false);
        return;
      }

      // Firebase has a cached session — now verify our Firestore session too
      try {
        const status = await checkTokenActive();

        if (status.active) {
          const profile = await getMe();
          setUser(profile);
        } else {
          // Our Firestore session was revoked (logout from another device etc.)
          // Sign out Firebase so the next boot goes straight to /login
          await firebaseSignOut(auth);
          setUser(null);
        }
      } catch {
        // Network error during boot — keep user logged in optimistically
        // (avoids logging people out just because their WiFi was slow)
        // getMe failed but Firebase session is valid — set minimal user from claims
        setUser(null);
      } finally {
        setLoading(false);  // ← only NOW does ProtectedRoute make a decision
      }
    });

    return unsubscribe;
  }, []);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiLogin(email, password);
      setUser(data.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      error,
      login,
      logout,
      clearError,
      isAdmin:     user?.role === 'admin',
      isPowerUser: user?.role === 'admin' || user?.role === 'power_user',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}