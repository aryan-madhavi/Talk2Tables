// src/app/components/layout/AppLayout.tsx

import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { Sidebar }   from './Sidebar';
import { MobileNav } from './MobileNav';
import { cn }        from '../../../lib/utils';
import { useAuth }   from '../../../context/AuthContext';
import { LogOut } from 'lucide-react';
import { Logo } from '../../components/shared/Logo';

export function AppLayout() {
  const [collapsed, setCollapsed]   = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  if (location.pathname === '/login') return <Outlet />;

  const displayName  = user?.display_name || user?.email?.split('@')[0] || 'User';
  const avatarLetter = displayName.charAt(0).toUpperCase();
  const photoUrl     = user?.photo_url || null;

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">

      {/* ── Desktop Sidebar ─────────────────────────────────────────────── */}
      <div
        className="hidden md:block fixed left-0 top-0 bottom-0 z-40 transition-all duration-300"
        style={{ width: collapsed ? '5rem' : '16rem' }}
      >
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      </div>

      {/* ── Mobile Header ───────────────────────────────────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-30 h-14 flex items-center px-4 justify-between">

        {/* Logo */}
        <div className="flex items-center gap-2">
          <Logo size={32} />
          <span className="font-bold text-base text-gray-900">Talk2Tables</span>
        </div>

        {/* Right: avatar + logout */}
        <div className="flex items-center gap-2">

          {/* Avatar */}
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={displayName}
              className="w-8 h-8 rounded-full object-cover border-2 border-gray-100"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">{avatarLetter}</span>
            </div>
          )}

          {/* Logout icon button */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            title="Sign out"
            className="flex items-center justify-center w-8 h-8 rounded-lg
                       text-gray-500 hover:text-red-600 hover:bg-red-50
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <LogOut className={cn('w-4 h-4', loggingOut && 'animate-spin')} />
          </button>

        </div>
      </header>

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <main
        className={cn(
          'flex-1 flex flex-col h-full overflow-hidden transition-all duration-300 pt-14 md:pt-0 pb-16 md:pb-0',
          collapsed ? 'md:pl-20' : 'md:pl-64'
        )}
      >
        <div className="h-full overflow-auto p-4 md:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>

      {/* ── Mobile Bottom Nav ────────────────────────────────────────────── */}
      <MobileNav />

    </div>
  );
}