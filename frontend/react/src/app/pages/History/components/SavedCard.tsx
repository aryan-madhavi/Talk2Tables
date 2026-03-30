import React from 'react';
import { Database, Trash2, Clock } from 'lucide-react';
import { SavedQuery } from '../../../../lib/savedService';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface SavedCardProps {
  item:     SavedQuery;
  onDelete: (id: string) => void;
}

export function SavedCard({ item, onDelete }: SavedCardProps) {
  return (
    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
      <div className="flex items-start justify-between gap-4">

        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 mb-1 text-sm leading-snug">{item.summary}</p>

          <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap mb-3">
            <span className="flex items-center gap-1">
              <Database className="w-3 h-3" />
              {item.connection_name}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo(item.saved_at)}
            </span>
            <span className="text-gray-300">{item.row_count} rows</span>
          </div>

          <code className="text-xs font-mono text-gray-500 block truncate bg-gray-50 p-2 rounded border border-gray-100">
            {item.sql}
          </code>
        </div>

        <button
          onClick={() => onDelete(item.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-gray-400
                     hover:text-red-500 hover:bg-red-50 rounded-lg shrink-0"
          title="Remove from saved"
        >
          <Trash2 className="w-4 h-4" />
        </button>

      </div>
    </div>
  );
}
