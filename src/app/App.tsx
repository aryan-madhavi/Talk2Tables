// src/app/App.tsx
// Root — AuthProvider must wrap RouterProvider so every route has auth state.

import React from 'react';
import { RouterProvider, createHashRouter } from 'react-router';
import { Toaster }        from 'sonner';
import { routes }         from './routes';
import { AuthProvider }   from '../context/AuthContext';
import '../styles/fonts.css';
import '../styles/theme.css';

// Using HashRouter for Electron production stability
const hashRouter = createHashRouter(routes);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={hashRouter} />
      {/* Global toast container — position matches UX4G top-right convention */}
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
    </AuthProvider>
  );
}