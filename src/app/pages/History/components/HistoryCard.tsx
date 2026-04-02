import React, { useState } from 'react';
import { Play, Heart, Clock, Database, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../../../lib/utils';
import { QueryHistoryItem } from '../../../../lib/queryService';
import { favouriteMessage, unfavouriteMessage } from '../../../../lib/chatService';

const TYPE_BADGE: Record<string, string> = {
  SELECT: 'bg-green-100 text-green-700',
  INSERT: 'bg-blue-100 text-blue-700',
  UPDATE: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
};

interface HistoryCardProps {
  item:    QueryHistoryItem;
  onOpen:  (item: QueryHistoryItem) => void;  // open existing chat
  onRun:   (item: QueryHistoryItem) => void;  // re-run query
  onToggleFavourite: (item: QueryHistoryItem, nowFavourited: boolean) => void;
}

export function HistoryCard({ item, onOpen, onRun, onToggleFavourite }: HistoryCardProps) {
  const [fav,     setFav]     = useState(item.favourited);
  const [loading, setLoading] = useState(false);

  const handleFavToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      if (fav) {
        await unfavouriteMessage(item.connection_id, item.chat_id, item.msg_id);
      } else {
        await favouriteMessage(item.connection_id, item.chat_id, item.msg_id);
      }
      setFav(!fav);
      onToggleFavourite(item, !fav);
    } catch {/* ignore */} finally {
      setLoading(false);
    }
  };

  const badgeClass = TYPE_BADGE[item.query_type?.toUpperCase()] ?? 'bg-gray-100 text-gray-600';

  return (
    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
      <div className="flex items-start justify-between gap-4">

        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpen(item)}>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide', badgeClass)}>
              {item.query_type || 'QUERY'}
            </span>
            <span className={cn(
              'px-2 py-0.5 rounded-full text-[10px] font-medium',
              item.status === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500',
            )}>
              {item.status}
            </span>
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(new Date(item.created_at), 'MMM d, yyyy · h:mm a')}
            </span>
          </div>

          <h3 className="font-medium text-gray-900 truncate mb-1">{item.title}</h3>

          <div className="flex items-center gap-4 text-xs text-gray-500 mb-3 flex-wrap">
            <span className="flex items-center gap-1">
              <Database className="w-3 h-3" />
              {item.connection_name}
            </span>
            {item.total_records != null && (
              <span className="text-gray-400">{item.total_records} rows</span>
            )}
            {item.execution_time_ms != null && (
              <span className="text-gray-400">{item.execution_time_ms.toFixed(0)}ms</span>
            )}
          </div>

          <code className="text-xs font-mono text-gray-500 block whitespace-pre-wrap break-words bg-gray-50 p-2 rounded border border-gray-100">
            {item.sql_query}
          </code>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => onRun(item)}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Run again"
          >
            <Play className="w-4 h-4" />
          </button>
          <button
            onClick={handleFavToggle}
            disabled={loading}
            className={cn(
              'p-2 rounded-lg transition-colors',
              fav
                ? 'text-pink-500 bg-pink-50 hover:bg-pink-100'
                : 'text-gray-400 hover:text-pink-500 hover:bg-pink-50',
            )}
            title={fav ? 'Remove from saved' : 'Save'}
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Heart className={cn('w-4 h-4', fav && 'fill-pink-500')} />
            }
          </button>
        </div>

      </div>
    </div>
  );
}
