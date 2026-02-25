import React from 'react';
import { Search, Table, ArrowRight, Database } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { TableSchema } from '../types';

interface SchemaTableListProps {
  tables:        TableSchema[];
  selectedTable: TableSchema;
  searchTerm:    string;
  onSearch:      (value: string) => void;
  onSelect:      (table: TableSchema) => void;
}

export function SchemaTableList({
  tables,
  selectedTable,
  searchTerm,
  onSearch,
  onSelect,
}: SchemaTableListProps) {
  return (
    <div className="w-full md:w-64 border-r border-gray-100 flex flex-col bg-gray-50/50">

      {/* Search */}
      <div className="p-4 border-b border-gray-100 bg-white">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search tables..."
            value={searchTerm}
            onChange={e => onSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg
                       text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                       transition-all outline-none"
          />
        </div>
      </div>

      {/* Table list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {tables.map(table => {
          const isActive = selectedTable.name === table.name;
          return (
            <button
              key={table.name}
              onClick={() => onSelect(table)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group',
                isActive
                  ? 'bg-blue-50 text-blue-700 shadow-sm'
                  : 'text-gray-600 hover:bg-white hover:text-gray-900 hover:shadow-sm',
              )}
            >
              <Table className={cn(
                'w-4 h-4 transition-colors',
                isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500',
              )} />
              <span className="truncate">{table.name}</span>
              {isActive && <ArrowRight className="ml-auto w-3 h-3 opacity-50" />}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-100 bg-white text-xs text-gray-500 flex items-center gap-2">
        <Database className="w-3 h-3" />
        <span>Connected to: <strong>Plant Instrumentation</strong></span>
      </div>

    </div>
  );
}