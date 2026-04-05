// src/app/App.tsx
// Root — AuthProvider must wrap RouterProvider so every route has auth state.

import React from 'react';
import { RouterProvider } from 'react-router';
import { Toaster }        from 'sonner';
import { router }         from './routes';
import { AuthProvider }   from '../context/AuthContext';
import { useDevToolsBlockedToast } from './components/shared/blocked-devtools';
import '../styles/fonts.css';
import '../styles/theme.css';

export default function App() {
  useDevToolsBlockedToast();

  return (
    <>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          duration: 4000,
          classNames: {
            toast:       'font-sans text-sm',
            title:       'font-semibold',
            description: 'text-xs',
          },
        }}
      />
    </>
  );
}