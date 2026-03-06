// src/app/App.tsx
// Root — AuthProvider must wrap RouterProvider so every route has auth state.

import React from 'react';
import { RouterProvider } from 'react-router';
import { router }         from './routes';
import { AuthProvider }   from '../context/AuthContext';
import '../styles/fonts.css';
import '../styles/theme.css';

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}