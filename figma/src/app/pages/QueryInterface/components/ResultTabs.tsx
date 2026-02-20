import React from 'react';
import { Table, Code, BarChart2 } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { ResultTab } from '../types';

interface ResultTabsProps {
  active:   ResultTab;
  onChange: (tab: ResultTab) => void;
}

const TABS: { id: ResultTab; label: string; icon: React.ElementType }[] = [
  { id: 'table', label: 'Results', icon: Table    },
  { id: 'sql',   label: 'SQL',     icon: Code     },
  { id: 'chart', label: 'Chart',   icon: BarChart2 },
];

export function ResultTabs({ active, onChange }: ResultTabsProps) {
  return (
    <div className="flex items-center border-b border-gray-100 bg-gray-50/50 px-2">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'px-4 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors',
            active === tab.id
              ? 'border-blue-600 text-blue-700 bg-white'
              : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          <tab.icon className="w-4 h-4" />
          {tab.label}
        </button>
      ))}
    </div>
  );
}