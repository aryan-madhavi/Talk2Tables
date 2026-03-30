import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { getMyConnections } from '../../../../lib/accessService';
import { listConnections } from '../../../../lib/connectionService';
import { getSuggestions } from '../../../../lib/queryService';

export function SuggestedQueries() {
  const navigate = useNavigate();
  const { isAdmin, isDbManager } = useAuth();

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState(false);

  // Load the user's first connection, then fetch suggestions for it
  useEffect(() => {
    const loadConn = isAdmin || isDbManager
      ? listConnections(true).then(res => res.connections[0]?.connection_id ?? null)
      : getMyConnections().then(list => list[0]?.connection_id ?? null);

    setLoading(true);
    setError(false);

    loadConn
      .then(connId => {
        setConnectionId(connId);
        if (!connId) { setLoading(false); return; }
        return getSuggestions(connId).then(res => setSuggestions(res.suggestions));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [isAdmin, isDbManager]);

  const handleRefresh = async () => {
    if (!connectionId || refreshing) return;
    setRefreshing(true);
    setError(false);
    try {
      const res = await getSuggestions(connectionId);
      setSuggestions(res.suggestions);
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          Suggested Queries
        </h2>
        {!loading && connectionId && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh suggestions"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-5">Click any to pre-fill the query box</p>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Generating suggestions…</span>
        </div>
      ) : error ? (
        <p className="text-sm text-gray-400 py-2">Could not load suggestions. Try refreshing.</p>
      ) : suggestions.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">
          {connectionId
            ? 'No suggestions yet — run a query first to warm the schema cache.'
            : 'No database connected yet.'}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((q, i) => (
            <button
              key={i}
              onClick={() => navigate('/query', { state: { prefill: q } })}
              className="text-left bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-700
                         px-4 py-2 rounded-full text-sm transition-colors
                         border border-gray-200 hover:border-blue-200"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
