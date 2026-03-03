import React from 'react';
import { Link } from 'react-router';
import { Clock, ArrowRight, Play } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../../../lib/utils';
import { queryHistory } from '../../../data/mockData';
import { QueryEntry } from '../../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_DOT: Record<QueryEntry['type'], string> = {
  SELECT: 'bg-green-500',
  UPDATE: 'bg-amber-500',
  DELETE: 'bg-red-500',
  INSERT: 'bg-blue-500',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function RecentQueries() {
  const recentQueries = queryHistory.slice(0, 5);

  return (
    <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-500" />
          Recent Queries
        </h2>
        <Link
          to="/history"
          className="text-sm font-medium text-blue-700 hover:text-blue-800 flex items-center gap-1"
        >
          View All <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* List */}
      <div className="space-y-4">
        {recentQueries.map(query => (
          <div
            key={query.id}
            className="flex items-center justify-between p-4 bg-gray-50 rounded-lg
                       hover:bg-gray-100 transition-colors group"
          >
            <div className="flex items-start gap-3 overflow-hidden">
              <div className={cn('mt-1.5 w-2 h-2 rounded-full shrink-0', TYPE_DOT[query.type])} />
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate pr-4">{query.query}</p>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                  <span>{query.database}</span>
                  <span>•</span>
                  <span>{format(new Date(query.timestamp), 'MMM d, h:mm a')}</span>
                </div>
              </div>
            </div>

            <button
              className="p-2 text-blue-700 hover:bg-blue-100 rounded-full
                         opacity-0 group-hover:opacity-100 transition-all shrink-0"
              title="Run Again"
            >
              <Play className="w-4 h-4 fill-current" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}