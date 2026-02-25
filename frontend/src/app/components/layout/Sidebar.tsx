import React from 'react';
import { Link, useLocation } from 'react-router';
import { Home, MessageSquare, History, Database, Shield, Settings, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { currentUser } from '../../data/mockData';

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export function Sidebar({ collapsed, setCollapsed }: SidebarProps) {
  const location = useLocation();
  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: MessageSquare, label: 'Query', path: '/query' },
    { icon: History, label: 'History', path: '/history' },
    { icon: Database, label: 'Schema', path: '/schema' },
    { icon: Shield, label: 'Admin', path: '/admin' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  return (
    <aside 
      className={cn(
        "hidden md:flex flex-col bg-white border-r border-gray-200 h-screen transition-all duration-300 ease-in-out fixed left-0 top-0 z-20",
        collapsed ? "w-20" : "w-64"
      )}
    >
      <div className="p-4 flex items-center justify-between border-b border-gray-100 h-16">
        <div className={cn("flex items-center gap-3 overflow-hidden", collapsed && "justify-center w-full")}>
          <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center shrink-0">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <span className="font-bold text-lg text-gray-900 truncate">Talk2Tables</span>
          )}
        </div>
      </div>

      <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group",
                isActive 
                  ? "bg-blue-50 text-blue-700 font-medium" 
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                collapsed && "justify-center px-0"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className={cn("w-5 h-5 shrink-0", collapsed ? "mx-auto" : "")} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-100">
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg mb-2"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>

        <div className={cn("flex items-center gap-3 p-2 rounded-lg bg-gray-50", collapsed && "justify-center p-0 bg-transparent")}>
          <img 
            src={currentUser.avatarUrl} 
            alt={currentUser.name} 
            className="w-8 h-8 rounded-full bg-gray-200 object-cover shrink-0"
          />
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-gray-900 truncate">{currentUser.name}</p>
              <p className="text-xs text-gray-500 truncate">{currentUser.role === 'admin' ? 'Administrator' : 'User'}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
