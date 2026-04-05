// src/context/AuthContext.tsx
// Global auth state — wrap the entire app with <AuthProvider>.
// Boot sequence on every page load / refresh:
//   1. loading = true
//   2. Check for access_token in cookies
//   3. If token exists → GET /me → set user
//   4. loading = false

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import {
  login  as apiLogin,
  logout as apiLogout,
  getMe,
  getAccessToken,
  clearTokens,
  BackendUser,
}                           from '../lib/authService';

// ── Context shape ─────────────────────────────────────────────────────────────

interface AuthContextValue {
  /** Full user profile. null = not logged in. */
  user:        BackendUser | null;
  /**
   * TRUE during the initial boot session check.
   * ProtectedRoute MUST wait for this to be false before redirecting.
   */
  loading:     boolean;
  /**
   * TRUE once onAuthStateChanged has fired AND /me check is done.
   * Gate API calls behind this — never fires during the auth race window.
   */
  authReady:   boolean;
  /** Last error string from a failed login attempt. */
  error:       string | null;
  login:       (email: string, password: string) => Promise<void>;
  logout:      () => Promise<void>;
  clearError:  () => void;
  isAdmin:     boolean;   // role === 'admin'
  isDbManager: boolean;   // role === 'admin' | 'db_manager'
  isPowerUser: boolean;   // role === 'admin' | 'db_manager' | 'power_user'
  isAnalyst:   boolean;   // any authenticated user
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<BackendUser | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      const token = await getAccessToken();
      if (!token) {
        setUser(null);
        setLoading(false);
        setAuthReady(true);
        return;
      }

      try {
        const profile = await getMe();
        setUser(profile);
      } catch (err: unknown) {
        console.error('Auth initialization failed:', err);
        clearTokens();
        setUser(null);
      } finally {
        setLoading(false);
        setAuthReady(true);
      }
    };

    initAuth();
  }, []);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);
    setAuthReady(false);
    
    try {
      const data = await apiLogin(email, password);
      setUser(data.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(msg);
      setAuthReady(true);
      throw err;
    } finally {
      setLoading(false);
      setAuthReady(true);
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

  // ── Auto-Lock (30 mins inactivity) ─────────────────────────────────────────
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      if (user) {
        timeoutId = setTimeout(() => {
          console.log('Session locked due to inactivity.');
          logout();
        }, 30 * 60 * 1000); // 30 mins
      }
    };

    if (user) {
      window.addEventListener('mousemove', resetTimer);
      window.addEventListener('keydown', resetTimer);
      window.addEventListener('click', resetTimer);
      window.addEventListener('scroll', resetTimer);
      resetTimer();
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
      window.removeEventListener('scroll', resetTimer);
    };
  }, [user, logout]);

  const value = useMemo(() => ({
    user,
    loading,
    authReady,
    error,
    login,
    logout,
    clearError,
    isAdmin:     user?.role === 'admin',
    isDbManager: user?.role === 'admin' || user?.role === 'db_manager',
    isPowerUser: user?.role === 'admin' || user?.role === 'db_manager' || user?.role === 'power_user',
    isAnalyst:   !!user,
  }), [user, loading, authReady, error, login, logout, clearError]);

  return (
    <AuthContext.Provider value={value}>
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
