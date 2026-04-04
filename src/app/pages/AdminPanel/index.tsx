import React, { useState } from 'react';
import { Users, Activity, Database, BarChart2, Shield } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { AdminTab } from './types';
import { UsersTab }     from './tabs/UsersTab';
import { DatabasesTab } from './tabs/DatabasesTab';
import { AuditTab }     from './tabs/AuditTab';
import { StatsTab }     from './tabs/StatsTab';

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS: { id: AdminTab; label: string; icon: React.ElementType }[] = [
  { id: 'users',     label: 'Users',       icon: Users    },
  { id: 'audit',     label: 'Audit Logs',  icon: Activity },
  { id: 'databases', label: 'Connections', icon: Database },
  { id: 'stats',     label: 'Usage Stats', icon: BarChart2 },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-700" />
            Admin Panel
          </h1>
          <p className="text-gray-500">Manage users, connections, and system health</p>
        </div>

        {/* Tab Bar */}
        <div className="grid grid-cols-2 lg:flex gap-1.5 lg:gap-2 bg-white p-1 sm:p-1.5 rounded-lg border border-gray-200 shadow-sm w-full md:w-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-2 py-2 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium rounded-md flex items-center justify-center lg:justify-start gap-1.5 sm:gap-2 transition-all',
                activeTab === tab.id
                  ? 'bg-blue-50 text-blue-700 shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              )}
            >
              <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 min-h-[500px] overflow-hidden">
        {activeTab === 'users'     && <UsersTab     />}
        {activeTab === 'audit'     && <AuditTab     />}
        {activeTab === 'databases' && <DatabasesTab />}
        {activeTab === 'stats'     && <StatsTab     />}
      </div>

    </div>
  );
}