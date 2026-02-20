import React from 'react';
import { Search, UserPlus, MoreVertical } from 'lucide-react';
import { cn } from '../../../../lib/utils';

// Mock user data — replace with real data / props when wiring up
const MOCK_USERS = [
  { id: 1, initials: 'SS', name: 'Sarah Sharma', email: 'user1@talk2tables.gov.in', role: 'Admin',  lastActive: '2 mins ago' },
  { id: 2, initials: 'JD', name: 'John Doe',     email: 'user2@talk2tables.gov.in', role: 'User',   lastActive: '2 mins ago' },
  { id: 3, initials: 'MK', name: 'Mukesh Kumar', email: 'user3@talk2tables.gov.in', role: 'User',   lastActive: '2 mins ago' },
];

export function UsersTab() {
  return (
    <div className="p-6 animate-in fade-in">
      {/* Toolbar */}
      <div className="flex justify-between items-center mb-6">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search users..."
            className="pl-9 pr-4 py-2 w-full border border-gray-200 rounded-lg text-sm
                       focus:ring-2 focus:ring-blue-500 transition-all outline-none"
          />
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg
                           text-sm font-medium flex items-center gap-2 transition-colors">
          <UserPlus className="w-4 h-4" /> Add User
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-6 py-3 font-medium rounded-tl-lg">User</th>
              <th className="px-6 py-3 font-medium">Role</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium">Last Active</th>
              <th className="px-6 py-3 font-medium rounded-tr-lg" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {MOCK_USERS.map(user => (
              <tr key={user.id} className="hover:bg-gray-50 transition-colors">

                {/* Name + Email */}
                <td className="px-6 py-4 font-medium text-gray-900">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center
                                    text-blue-700 font-bold text-xs shrink-0">
                      {user.initials}
                    </div>
                    <div>
                      <div className="font-bold">{user.name}</div>
                      <div className="text-xs text-gray-500 font-normal">{user.email}</div>
                    </div>
                  </div>
                </td>

                {/* Role badge */}
                <td className="px-6 py-4">
                  <span className={cn(
                    'px-2 py-1 rounded-full text-xs font-medium border',
                    user.role === 'Admin'
                      ? 'bg-blue-50 text-blue-700 border-blue-100'
                      : 'bg-gray-50 text-gray-700 border-gray-100',
                  )}>
                    {user.role}
                  </span>
                </td>

                {/* Status */}
                <td className="px-6 py-4">
                  <span className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Active
                  </span>
                </td>

                {/* Last Active */}
                <td className="px-6 py-4 text-gray-500 text-xs">{user.lastActive}</td>

                {/* Actions */}
                <td className="px-6 py-4 text-right">
                  <button className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}