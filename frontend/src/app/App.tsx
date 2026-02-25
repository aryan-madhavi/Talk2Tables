import React from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import '../styles/fonts.css';
import '../styles/theme.css';

export default function App() {
  return <RouterProvider router={router} />;
}
