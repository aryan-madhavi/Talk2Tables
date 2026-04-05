import React from 'react';
import { Database, Menu } from 'lucide-react';
import { ConnectionOption } from '../index';
import { QueryResult } from '../types';

interface ChatHeaderProps {
  connections:   ConnectionOption[];
  selectedDb:    string;
  onSelectDb:    (id: string) => void;
  currentResult: QueryResult | null;
  onMobileMenuClick?: () => void;
}

export function ChatHeader({ connections, selectedDb, onSelectDb, currentResult, onMobileMenuClick }: ChatHeaderProps) {
  return (
    <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
      <div className="flex items-center gap-2">
        {onMobileMenuClick && (
          <button 
            onClick={onMobileMenuClick}
            className="md:hidden p-1.5 hover:bg-gray-200 rounded-md text-gray-500 mr-1"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <Database className="w-4 h-4 text-gray-500 hidden sm:block" />
        <select
          value={selectedDb}
          onChange={e => onSelectDb(e.target.value)}
          className="bg-transparent font-medium text-gray-700 text-sm border-none
                     focus:ring-0 cursor-pointer hover:text-blue-700 w-32 sm:w-auto overflow-hidden text-ellipsis"
        >
          {connections.length === 0 && (
            <option value="">No connections available</option>
          )}
          {connections.map(conn => (
            <option key={conn.connection_id} value={conn.connection_id}>
              {conn.name}
            </option>
          ))}
        </select>
      </div>

      <div className="text-xs text-gray-400">
        {currentResult && `Last run: ${currentResult.executionTime}ms`}
      </div>
    </div>
  );
}
