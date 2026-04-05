import React from 'react';
import { Search, Table, ArrowRight, Database, Loader2 } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { SchemaTableMeta } from '../../../../lib/schemaService';

interface SchemaTableListProps {
  tables:        SchemaTableMeta[];
  selectedTable: SchemaTableMeta | null;
  searchTerm:    string;
  loading:       boolean;
  connName:      string;
  onSearch:      (value: string) => void;
  onSelect:      (table: SchemaTableMeta) => void;
}

export function SchemaTableList({
  tables, selectedTable, searchTerm, loading, connName, onSearch, onSelect,
}: SchemaTableListProps) {
  return (
    <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-gray-100 flex flex-col bg-gray-50/50 shrink-0 h-[40vh] md:h-full">

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
        {loading && (
          <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading tables…</span>
          </div>
        )}

        {!loading && tables.length === 0 && (
          <div className="text-center py-10 text-sm text-gray-400">
            {searchTerm ? 'No tables match your search' : 'No tables found'}
          </div>
        )}

        {!loading && tables.map(t => {
          const isActive = selectedTable?.table === t.table && selectedTable?.schema === t.schema;
          return (
            <button
              key={`${t.schema}.${t.table}`}
              onClick={() => onSelect(t)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group',
                isActive
                  ? 'bg-blue-50 text-blue-700 shadow-sm'
                  : 'text-gray-600 hover:bg-white hover:text-gray-900 hover:shadow-sm',
              )}
            >
              <Table className={cn(
                'w-4 h-4 shrink-0 transition-colors',
                isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500',
              )} />
              <div className="flex-1 min-w-0 text-left">
                <div className="truncate">{t.table}</div>
                {t.schema && <div className="text-[10px] text-gray-400 font-normal truncate">{t.schema}</div>}
              </div>
              <span className={cn(
                'text-[10px] shrink-0',
                isActive ? 'text-blue-400' : 'text-gray-400',
              )}>
                {t.columns}c
              </span>
              {isActive && <ArrowRight className="w-3 h-3 opacity-50 shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-100 bg-white text-xs text-gray-500 flex items-center gap-2">
        <Database className="w-3 h-3 shrink-0" />
        <span className="truncate">Connected to: <strong>{connName || '—'}</strong></span>
      </div>

    </div>
  );
}
