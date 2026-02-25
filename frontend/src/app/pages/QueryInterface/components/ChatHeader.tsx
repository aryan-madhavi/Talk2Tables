import React from 'react';
import { Database, ChevronDown } from 'lucide-react';
import { databases } from '../../../data/mockData';
import { QueryResult } from '../types';

interface ChatHeaderProps {
  selectedDb:    string;
  onSelectDb:    (id: string) => void;
  currentResult: QueryResult | null;
}

export function ChatHeader({ selectedDb, onSelectDb, currentResult }: ChatHeaderProps) {
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
          {databases.map(db => (
            <option key={db.id} value={db.id}>{db.name}</option>
          ))}
        </select>
        <ChevronDown className="w-3 h-3 text-gray-400 pointer-events-none -ml-1" />
      </div>

      <div className="text-xs text-gray-400">
        {currentResult && `Last run: ${currentResult.executionTime}ms`}
      </div>
    </div>
  );
}