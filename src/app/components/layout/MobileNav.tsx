import React from 'react';
import { NavLink } from 'react-router';
import { Home, MessageSquare, History, Database, Settings, Shield } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useAuth } from '../../../context/AuthContext';

export function MobileNav() {
  const { isDbManager, isAdmin } = useAuth();
  
  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: MessageSquare, label: 'Query', path: '/query' },
    { icon: History, label: 'History', path: '/history' },
    { icon: Database, label: 'Schema', path: '/schema' },
    ...((isDbManager || isAdmin) ? [{ icon: Shield, label: 'Admin', path: '/admin' }] : []),
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 md:hidden pb-safe">
      <div className="flex justify-around items-center h-16 px-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => cn(
              "flex flex-col items-center justify-center w-full h-full py-1 text-[10px] xs:text-xs",
              isActive 
                ? "text-blue-700 font-medium" 
                : "text-gray-500 hover:text-gray-900"
            )}
          >
            <item.icon className="w-5 h-5 xs:w-6 xs:h-6 mb-1" />
            <span className="truncate w-full text-center">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
