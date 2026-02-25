import React from 'react';
import { Play, Bookmark, Trash2, Clock, Database } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../../../lib/utils';
import { QueryEntry } from '../../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<QueryEntry['type'], string> = {
  SELECT: 'bg-green-100 text-green-700',
  UPDATE: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
  INSERT: 'bg-blue-100 text-blue-700',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface HistoryCardProps {
  item:      QueryEntry;
  onRun?:    (item: QueryEntry) => void;
  onSave?:   (item: QueryEntry) => void;
  onDelete?: (item: QueryEntry) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HistoryCard({ item, onRun, onSave, onDelete }: HistoryCardProps) {
  return (
    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
      <div className="flex items-start justify-between gap-4">

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn(
              'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide',
              TYPE_BADGE[item.type],
            )}>
              {item.type}
            </span>
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(new Date(item.timestamp), 'MMM d, yyyy • h:mm a')}
            </span>
          </div>

          <h3 className="font-medium text-gray-900 truncate mb-1">{item.query}</h3>

          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Database className="w-3.5 h-3.5" />
            <span>{item.database}</span>
          </div>
        </div>

        {/* Action buttons — visible on hover */}
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => onRun?.(item)}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Run Again"
          >
            <Play className="w-4 h-4" />
          </button>
          <button
            onClick={() => onSave?.(item)}
            className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
            title="Bookmark"
          >
            <Bookmark className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete?.(item)}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* SQL preview */}
      <div className="mt-4 pt-3 border-t border-gray-50">
        <code className="text-xs font-mono text-gray-500 block truncate bg-gray-50 p-2 rounded">
          {item.sql}
        </code>
      </div>
    </div>
  );
}