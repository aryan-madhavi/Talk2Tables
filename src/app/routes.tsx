// src/app/routes.tsx
// All routes under "/" require authentication via ProtectedRoute.
// AdminPanel additionally requires role = "admin".

import React from 'react';
import { createBrowserRouter } from 'react-router';
import { AppLayout }      from './components/layout/AppLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import Login              from './pages/Login';
import Dashboard          from './pages/Dashboard';
import QueryInterface     from './pages/QueryInterface';
import History            from './pages/History';
import SchemaBrowser      from './pages/SchemaBrowser';
import AdminPanel         from './pages/AdminPanel';
import Settings           from './pages/Settings';

const NotFound = () => (
  <div className="p-8 text-center text-gray-500">Page Not Found</div>
);

export const ComingSoon = () => (
  <div className="p-8 text-2xl font-bold text-gray-900 text-center">Coming Soon</div>
);

export const router = createBrowserRouter([

  // ── Public ─────────────────────────────────────────────────────────────────
  {
    path: '/login',
    element: <Login />,
  },

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
      { path: 'comingsoon', element: <ComingSoon /> },

      // Admin-only — ProtectedRoute checks role hierarchy
      {
        path: 'admin',
        element: (
          <ProtectedRoute requiredRole="admin">
            <AdminPanel />
          </ProtectedRoute>
        ),
      },

      { path: '*', element: <NotFound /> },
    ],
  },
]);