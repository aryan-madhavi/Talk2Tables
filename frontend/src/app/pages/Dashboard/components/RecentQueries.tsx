import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Clock, ArrowRight, Play, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../../../lib/utils';
import { getQueryHistory, QueryHistoryItem } from '../../../../lib/queryService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_DOT: Record<string, string> = {
  SELECT: 'bg-green-500',
  UPDATE: 'bg-amber-500',
  DELETE: 'bg-red-500',
  INSERT: 'bg-blue-500',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function RecentQueries() {
  const navigate = useNavigate();
  const [items,   setItems]   = useState<QueryHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getQueryHistory({ limit: 5 })
      .then(res => setItems(res.history ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No queries yet — ask your first question!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div
              key={item.msg_id}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg
                         hover:bg-gray-100 transition-colors group"
            >
              <button
                onClick={() => navigate('/query', {
                  state: { chatId: item.chat_id, connectionId: item.connection_id },
                })}
                className="flex items-start gap-3 overflow-hidden flex-1 text-left"
              >
                <div className={cn(
                  'mt-1.5 w-2 h-2 rounded-full shrink-0',
                  TYPE_DOT[item.query_type] ?? 'bg-gray-400',
                )} />
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate pr-4 hover:text-blue-600 transition-colors">{item.title}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                    <span>{item.connection_name}</span>
                    <span>•</span>
                    <span>{format(new Date(item.created_at), 'MMM d, h:mm a')}</span>
                  </div>
                </div>
              </button>

              <button
                onClick={() => navigate('/query', {
                  state: { query: item.title, connectionId: item.connection_id },
                })}
                className="p-2 text-blue-700 hover:bg-blue-100 rounded-full
                           opacity-0 group-hover:opacity-100 transition-all shrink-0"
                title="Run Again"
              >
                <Play className="w-4 h-4 fill-current" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
