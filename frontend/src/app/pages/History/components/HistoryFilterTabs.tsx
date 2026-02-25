import React from 'react';
import { cn } from '../../../../lib/utils';
import { HistoryFilter, HISTORY_FILTER_TABS } from '../types';

interface HistoryFilterTabsProps {
  active:   HistoryFilter;
  onChange: (filter: HistoryFilter) => void;
}

export function HistoryFilterTabs({ active, onChange }: HistoryFilterTabsProps) {
  return (
    <div className="flex items-center gap-2 border-b border-gray-200 pb-1 overflow-x-auto">
      {HISTORY_FILTER_TABS.map(tab => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap',
            active === tab.value
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-600 hover:bg-gray-50',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}