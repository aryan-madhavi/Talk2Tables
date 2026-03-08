import React from 'react';
import { Database } from 'lucide-react';
import { ConnectionOut } from '../../../../lib/connectionService';
import { QueryResult } from '../types';

interface ChatHeaderProps {
  connections:   ConnectionOut[];
  selectedDb:    string;
  onSelectDb:    (id: string) => void;
  currentResult: QueryResult | null;
}

export function ChatHeader({ connections, selectedDb, onSelectDb, currentResult }: ChatHeaderProps) {
  return (
    <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
      <div className="flex items-center gap-2">
        <Database className="w-4 h-4 text-gray-500" />
        <select
          value={selectedDb}
          onChange={e => onSelectDb(e.target.value)}
          className="bg-transparent font-medium text-gray-700 text-sm border-none
                     focus:ring-0 cursor-pointer hover:text-blue-700"
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
