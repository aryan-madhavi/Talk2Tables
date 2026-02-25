import React from 'react';
import { Link } from 'react-router';
import { Search, Folder, BarChart2 } from 'lucide-react';

// ─── Config ───────────────────────────────────────────────────────────────────

const ACTIONS = [
  {
    to:          '/query',
    icon:        Search,
    label:       'Ask a Question',
    description: 'Query your database using plain language',
    iconBg:      'bg-blue-50 text-blue-700 group-hover:bg-blue-100',
    labelHover:  'group-hover:text-blue-700',
  },
  {
    to:          '/history',
    icon:        Folder,
    label:       'Saved Queries',
    description: 'Access your frequently used reports',
    iconBg:      'bg-amber-50 text-amber-600 group-hover:bg-amber-100',
    labelHover:  'group-hover:text-amber-600',
  },
  {
    to:          '/reports',
    icon:        BarChart2,
    label:       'View Reports',
    description: 'Visualize trends and analytics',
    iconBg:      'bg-green-50 text-green-600 group-hover:bg-green-100',
    labelHover:  'group-hover:text-green-600',
  },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function QuickActions() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {ACTIONS.map(action => (
        <Link
          key={action.to}
          to={action.to}
          className="group p-6 bg-white rounded-xl shadow-sm border border-gray-100
                     hover:shadow-md transition-all flex items-start gap-4"
        >
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${action.iconBg}`}>
            <action.icon className="w-6 h-6" />
          </div>
          <div>
            <h3 className={`font-semibold text-lg text-gray-900 mb-1 transition-colors ${action.labelHover}`}>
              {action.label}
            </h3>
            <p className="text-gray-500 text-sm">{action.description}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}