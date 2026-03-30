// src/app/pages/AdminPanel/tabs/AuditTab.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Database, Loader2, AlertCircle, CheckCircle2, XCircle, ChevronDown, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../../../lib/utils';
import { listConnections, ConnectionOut } from '../../../../lib/connectionService';
import { getConnectionAudits, AuditLogEntry } from '../../../../lib/auditService';

const PAGE_SIZE = 50;

const STATUS_FILTER_OPTIONS = [
  { value: '',        label: 'All statuses' },
  { value: 'success', label: 'Success only' },
  { value: 'error',   label: 'Errors only'  },
];

const QUERY_TYPE_BADGE: Record<string, string> = {
  SELECT: 'bg-green-100 text-green-700',
  INSERT: 'bg-blue-100  text-blue-700',
  UPDATE: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100   text-red-700',
};

export function AuditTab() {
  const [connections,    setConnections]    = useState<ConnectionOut[]>([]);
  const [connLoading,    setConnLoading]    = useState(true);
  const [selectedConnId, setSelectedConnId] = useState('');
  const [statusFilter,   setStatusFilter]   = useState('');

  const [logs,        setLogs]        = useState<AuditLogEntry[]>([]);
  const [total,       setTotal]       = useState(0);
  const [offset,      setOffset]      = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // Load connection list once
  useEffect(() => {
    listConnections(true)
      .then(res => {
        setConnections(res.connections);
        if (res.connections.length > 0) setSelectedConnId(res.connections[0].connection_id);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load connections'))
      .finally(() => setConnLoading(false));
  }, []);

  // Fetch audit logs
  const fetchLogs = useCallback((connId: string, status: string, pageOffset: number, append = false) => {
    if (!connId) return;
    setLoading(true);
    setError(null);
    getConnectionAudits(connId, {
      limit:  PAGE_SIZE,
      offset: pageOffset,
      status: status || undefined,
    })
      .then(res => {
        setTotal(res.total);
        setLogs(prev => append ? [...prev, ...(res.audits ?? [])] : (res.audits ?? []));
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load audit logs'))
      .finally(() => setLoading(false));
  }, []);

  // Refetch when connection or filter changes
  useEffect(() => {
    if (!selectedConnId) return;
    setOffset(0);
    setLogs([]);
    fetchLogs(selectedConnId, statusFilter, 0);
  }, [selectedConnId, statusFilter, fetchLogs]);

  const handleLoadMore = () => {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    fetchLogs(selectedConnId, statusFilter, next, true);
  };

  const selectedConn = connections.find(c => c.connection_id === selectedConnId);

  return (
    <div className="p-6 animate-in fade-in">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Audit Logs</h3>
          {!loading && selectedConn && (
            <p className="text-xs text-gray-400 mt-0.5">
              {total} record{total !== 1 ? 's' : ''} for <span className="font-medium text-gray-500">{selectedConn.name}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* DB selector */}
          <div className="relative">
            <Database className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <select
              value={selectedConnId}
              onChange={e => setSelectedConnId(e.target.value)}
              disabled={connLoading}
              className="pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none
                         appearance-none cursor-pointer disabled:opacity-50 min-w-[180px]"
            >
              {connLoading
                ? <option>Loading…</option>
                : connections.map(c => (
                    <option key={c.connection_id} value={c.connection_id}>{c.name}</option>
                  ))
              }
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none
                         appearance-none cursor-pointer"
            >
              {STATUS_FILTER_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton (first load) */}
      {loading && logs.length === 0 && (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-[72px] rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && logs.length === 0 && selectedConnId && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center">
            <Activity className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-600">No audit logs found</p>
          <p className="text-xs text-gray-400">Try adjusting the status filter or selecting a different connection.</p>
        </div>
      )}

      {/* Log list */}
      {logs.length > 0 && (
        <div className="space-y-2">
          {logs.map((log, i) => {
            const isSuccess = log.status === 'success' || log.status === 'results';
            const badgeClass = QUERY_TYPE_BADGE[log.query_type?.toUpperCase() ?? ''] ?? 'bg-gray-100 text-gray-600';
            return (
              <div
                key={log.audit_id ?? i}
                className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-3">
                  {/* Status icon */}
                  <div className={cn(
                    'mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0',
                    isSuccess ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500',
                  )}>
                    {isSuccess
                      ? <CheckCircle2 className="w-4 h-4" />
                      : <XCircle      className="w-4 h-4" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Top row: badges + timestamp */}
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      {log.query_type && (
                        <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide', badgeClass)}>
                          {log.query_type}
                        </span>
                      )}
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-medium',
                        isSuccess ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500',
                      )}>
                        {log.status}
                      </span>
                      <span className="text-xs text-gray-400 flex items-center gap-1 ml-auto">
                        <Clock className="w-3 h-3" />
                        {format(new Date(log.created_at), 'MMM d, yyyy · h:mm a')}
                      </span>
                    </div>

                    {/* SQL */}
                    <code className="text-xs font-mono text-gray-600 block whitespace-pre-wrap break-words
                                     bg-gray-50 px-3 py-2 rounded-lg border border-gray-100 mb-2">
                      {log.sql_query}
                    </code>

                    {/* Meta row */}
                    <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                      {log.user_email && (
                        <span className="text-gray-500 font-medium">{log.user_email}</span>
                      )}
                      {log.row_count != null && (
                        <span>{log.row_count} rows</span>
                      )}
                      {log.execution_time_ms != null && (
                        <span>{log.execution_time_ms.toFixed(0)} ms</span>
                      )}
                      {!isSuccess && log.error_message && (
                        <span className="text-red-400 truncate max-w-xs">{log.error_message}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {logs.length > 0 && logs.length < total && (
        <div className="flex justify-center mt-6">
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 rounded-lg border border-gray-200
                       text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>
              : `Load more (${total - logs.length} remaining)`
            }
          </button>
        </div>
      )}

      {/* Inline loading indicator for load-more */}
      {loading && logs.length > 0 && (
        <div className="flex justify-center mt-4">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      )}

    </div>
  );
}
