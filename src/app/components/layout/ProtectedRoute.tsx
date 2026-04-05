// src/app/components/layout/ProtectedRoute.tsx
// Guards every authenticated route.
//
// CRITICAL: Never redirect while loading === true.
// The app needs a moment on refresh to verify the access_token/cookie.
// If we redirect to /login before that finishes, the user gets
// kicked out on every page refresh even though they have a valid session.
//
// Flow:
//   loading=true  → show spinner (Verifying session)
//   loading=false, no user  → redirect to /login
//   loading=false, user ok  → render children (+ optional role check)

import React from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../../../context/AuthContext';

const ROLE_LEVEL: Record<string, number> = {
  analyst:    0,
  power_user: 1,
  db_manager: 2,
  admin:      3,
};

interface ProtectedRouteProps {
  children:      React.ReactNode;
  requiredRole?: 'admin' | 'db_manager' | 'power_user' | 'analyst';
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location          = useLocation();

  // ── MUST wait for Firebase to restore session before deciding ─────────────
  // Without this guard, every page refresh redirects to /login because
  // onAuthStateChanged hasn't fired yet when the component first mounts.
  // Show a content skeleton instead of a blank spinner so LCP fires early.
  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        {/* Sidebar skeleton */}
        <div className="hidden md:flex flex-col w-64 bg-white border-r border-gray-100 p-4 gap-3 shrink-0">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-blue-700 rounded-lg shrink-0" />
            <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-9 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
        {/* Content skeleton */}
        <div className="flex-1 p-6 md:p-8 flex flex-col gap-4 overflow-hidden">
          <div className="h-28 bg-white rounded-xl border border-gray-100 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-white rounded-xl border border-gray-100 animate-pulse" />
            ))}
          </div>
          <div className="h-48 bg-white rounded-xl border border-gray-100 animate-pulse" />
        </div>
      </div>
    );
  }

  // ── Not authenticated ──────────────────────────────────────────────────────
  if (!user) {
    const isDefaultAdmin = import.meta.env.MODE === 'admin';
    const target = isDefaultAdmin ? '/signup' : '/login';
    return <Navigate to={target} state={{ from: location }} replace />;
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