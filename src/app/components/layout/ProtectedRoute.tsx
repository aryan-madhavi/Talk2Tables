// src/app/components/layout/ProtectedRoute.tsx
// Guards every authenticated route.
//
// CRITICAL: Never redirect while loading === true.
// Firebase needs up to ~1-2s on refresh to restore its cached session from
// IndexedDB. If we redirect to /login before that finishes, the user gets
// kicked out on every page refresh even though they're logged in.
//
// Flow:
//   loading=true  → show spinner (Firebase is restoring session)
//   loading=false, no user  → redirect to /login
//   loading=false, user ok  → render children (+ optional role check)

import React from 'react';
import { Navigate, useLocation } from 'react-router';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

const ROLE_LEVEL: Record<string, number> = {
  viewer:     0,
  power_user: 1,
  admin:      2,
};

interface ProtectedRouteProps {
  children:      React.ReactNode;
  requiredRole?: 'admin' | 'power_user' | 'viewer';
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location          = useLocation();

  // ── MUST wait for Firebase to restore session before deciding ─────────────
  // Without this guard, every page refresh redirects to /login because
  // onAuthStateChanged hasn't fired yet when the component first mounts.
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-3">
        <div className="w-14 h-14 bg-blue-700 rounded-2xl flex items-center justify-center shadow-md animate-pulse">
          <MessageSquare className="w-7 h-7 text-white" />
        </div>
        <p className="text-sm text-gray-400 animate-pulse">Loading…</p>
      </div>
    );
  }

  // ── Not authenticated ──────────────────────────────────────────────────────
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // ── Role check ─────────────────────────────────────────────────────────────
  if (requiredRole) {
    const userLevel   = ROLE_LEVEL[user.role]    ?? 0;
    const neededLevel = ROLE_LEVEL[requiredRole] ?? 0;

    if (userLevel < neededLevel) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
          <div className="text-center max-w-sm">
            <div className="text-4xl mb-4">🔒</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-sm text-gray-500">
              This page requires{' '}
              <span className="font-medium text-gray-700">{requiredRole}</span> access.
              Your role is{' '}
              <span className="font-medium text-gray-700">{user.role}</span>.
            </p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}