import React from 'react';
import { createBrowserRouter } from 'react-router';
import { AppLayout }      from './components/layout/AppLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import Login              from './pages/Login';
import Signup             from './pages/Signup';
import Dashboard          from './pages/Dashboard';
import QueryInterface     from './pages/QueryInterface';
import History            from './pages/History';
import SchemaBrowser      from './pages/SchemaBrowser';
import AdminPanel         from './pages/AdminPanel';
import Settings           from './pages/Settings';
import Reports            from './pages/Reports';

const NotFound = () => (
  <div className="p-8 text-center text-gray-500">Page Not Found</div>
);

export const ComingSoon = () => (
  <div className="p-8 text-2xl font-bold text-gray-900 text-center">Coming Soon</div>
);

// ── Conditionally include signup route based on build mode ──────────────────
const signupRoute = import.meta.env.VITE_ALLOW_SIGNUP !== 'false'
  ? [{ path: '/signup', element: <Signup /> }]
  : [];

export const routes = [
  // ── Public ─────────────────────────────────────────────────────────────────
  { path: '/login', element: <Login /> },
  ...signupRoute,

  // ── Protected — valid session required for everything under "/" ────────────
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true,        element: <Dashboard /> },
      { path: 'query',      element: <QueryInterface /> },
      { path: 'history',    element: <History /> },
      { path: 'schema',     element: <SchemaBrowser /> },
      { path: 'settings',   element: <Settings /> },
      { path: 'reports',    element: <Reports /> },
      { path: 'comingsoon', element: <ComingSoon /> },
      {
        path: 'admin',
        element: (
          <ProtectedRoute requiredRole="db_manager">
            <AdminPanel />
          </ProtectedRoute>
        ),
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];
