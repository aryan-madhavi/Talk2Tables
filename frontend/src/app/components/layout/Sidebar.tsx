// src/app/components/layout/Sidebar.tsx

import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  Home, MessageSquare, History, Database,
  Shield, Settings, LogOut, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Logo } from '../../components/shared/Logo';
import { cn }      from '../../../lib/utils';
import { useAuth } from '../../../context/AuthContext';

interface SidebarProps {
  collapsed:    boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export function Sidebar({ collapsed, setCollapsed }: SidebarProps) {
  const location          = useLocation();
  const navigate          = useNavigate();
  const { user, logout, isAdmin, isDbManager } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  // Build nav — Admin tab only visible to admins
  const navItems = [
    { icon: Home,         label: 'Home',     path: '/'        },
    { icon: MessageSquare,label: 'Query',    path: '/query'   },
    { icon: History,      label: 'History',  path: '/history' },
    { icon: Database,     label: 'Schema',   path: '/schema'  },
    ...(isDbManager ? [{ icon: Shield, label: 'Admin', path: '/admin' }] : []),
    { icon: Settings,     label: 'Settings', path: '/settings'},
  ];

  // Derive display values from real user
  const displayName  = user?.display_name || user?.email?.split('@')[0] || 'User';
  const displayRole  =
    user?.role === 'admin'      ? 'Administrator' :
    user?.role === 'db_manager' ? 'DB Manager'    :
    user?.role === 'power_user' ? 'Power User'    :
                                  'Analyst';
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
    <aside
      className={cn(
        'hidden md:flex flex-col bg-white border-r border-gray-200 h-screen transition-all duration-300 ease-in-out fixed left-0 top-0 z-20',
        collapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* ── Logo ──────────────────────────────────────────────────────────── */}
      <div className="p-4 flex items-center justify-between border-b border-gray-100 h-16">
        <div className={cn('flex items-center gap-3 overflow-hidden', collapsed && 'justify-center w-full')}>
          <Logo size={32} />
          {!collapsed && (
            <span className="font-bold text-lg text-gray-900 truncate">Talk2Tables</span>
          )}
        </div>
      </div>

      {/* ── Nav items ─────────────────────────────────────────────────────── */}
      <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group',
                isActive
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className={cn('w-5 h-5 shrink-0', collapsed ? 'mx-auto' : '')} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* ── Bottom: collapse toggle + user info + logout ───────────────────── */}
      <div className="p-3 border-t border-gray-100 space-y-2">

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center p-2 text-gray-400
                     hover:text-gray-600 hover:bg-gray-50 rounded-lg"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>

        {/* User info */}
        <div className={cn(
          'flex items-center gap-3 p-2 rounded-lg bg-gray-50',
          collapsed && 'justify-center p-0 bg-transparent'
        )}>
          {/* Avatar — photo if available, else initial */}
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={displayName}
              className="w-8 h-8 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">{avatarLetter}</span>
            </div>
          )}

          {!collapsed && (
            <div className="overflow-hidden flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
              <p className="text-xs text-gray-500 truncate">{displayRole}</p>
            </div>
          )}
        </div>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          title="Sign out"
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
            'text-gray-600 hover:bg-red-50 hover:text-red-600',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            collapsed && 'justify-center px-0'
          )}
        >
          <LogOut className={cn('w-5 h-5 shrink-0', loggingOut && 'animate-spin')} />
          {!collapsed && (
            <span className="text-sm font-medium">
              {loggingOut ? 'Signing out…' : 'Sign Out'}
            </span>
          )}
        </button>

      </div>
    </aside>
  );
}