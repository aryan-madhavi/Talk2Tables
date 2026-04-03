import React from 'react';
import { Search, Filter } from 'lucide-react';

interface HistoryToolbarProps {
  searchTerm:    string;
  onSearchChange: (value: string) => void;
}

export function HistoryToolbar({ searchTerm, onSearchChange }: HistoryToolbarProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Query History</h1>
        <p className="text-gray-500">View and rerun your past database interactions</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search history..."
            value={searchTerm}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm
                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                       w-full md:w-64 transition-all outline-none"
          />
        </div>
        <button className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
          <Filter className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}