import React from 'react';
import { Bell } from 'lucide-react';

const NOTIFICATION_ITEMS = [
  {
    label: 'Query execution completed',
    desc:  'Get notified when long-running queries finish',
  },
  {
    label: 'Security alerts',
    desc:  'Receive alerts for suspicious activities',
  },
  {
    label: 'System updates',
    desc:  'News about Talk2Tables features',
  },
];

export function NotificationsSection() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 bg-gray-50/50">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-700" />
          Notifications
        </h2>
        <p className="text-sm text-gray-500 mt-1">Manage how you receive alerts</p>
      </div>

      <div className="p-6 space-y-4">
        {NOTIFICATION_ITEMS.map(item => (
          <div key={item.label} className="flex items-start gap-3">
            <div className="flex items-center h-5">
              <input
                type="checkbox"
                defaultChecked
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-900 block">{item.label}</label>
              <p className="text-xs text-gray-500">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}