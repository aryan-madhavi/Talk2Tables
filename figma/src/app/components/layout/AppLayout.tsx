import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { cn } from '../../../lib/utils';
import { Menu, X } from 'lucide-react';
import { currentUser } from '../../data/mockData';

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  // If we are on the login page, we don't render the layout
  if (location.pathname === '/login') {
    return <Outlet />;
  }

  const toggleCollapsed = (newState: boolean) => {
    setCollapsed(newState);
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:block fixed left-0 top-0 bottom-0 z-40 transition-all duration-300" style={{ width: collapsed ? '5rem' : '16rem' }}>
        <Sidebar collapsed={collapsed} setCollapsed={toggleCollapsed} />
      </div>

      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-30 h-14 flex items-center px-4 justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-lg">T2</span>
          </div>
          <span className="font-bold text-lg text-gray-900">Talk2Tables</span>
        </div>
        <img 
            src={currentUser.avatarUrl} 
            alt={currentUser.name} 
            className="w-8 h-8 rounded-full bg-gray-200 object-cover shrink-0"
        />
      </header>

      {/* Main Content Area */}
      <main 
        className={cn(
          "flex-1 flex flex-col h-full overflow-hidden transition-all duration-300 pt-14 md:pt-0 pb-16 md:pb-0",
          collapsed ? "md:pl-20" : "md:pl-64"
        )}
      >
        <div className="h-full overflow-auto p-4 md:p-6 lg:p-8">
           <Outlet />
        </div>
      </main>

      {/* Mobile Navigation */}
      <MobileNav />
    </div>
  );
}
