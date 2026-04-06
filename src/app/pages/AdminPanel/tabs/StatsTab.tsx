// src/app/pages/AdminPanel/tabs/StatsTab.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { Database, ChevronDown, Loader2, AlertCircle, TrendingUp, CheckCircle2, XCircle, Rows3, Timer } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { listConnections, ConnectionOut } from '../../../../lib/connectionService';
import { getConnectionStats, ConnectionStats } from '../../../../lib/auditService';

const DAYS_OPTIONS = [
  { value: 7,  label: 'Last 7 days'  },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 0,  label: 'All time'     },
];

const QT_COLORS: Record<string, string> = {
  SELECT: '#3b82f6',
  INSERT: '#10b981',
  UPDATE: '#f59e0b',
  DELETE: '#ef4444',
};

function StatCard({
  label, value, sub, icon: Icon, color,
}: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-start gap-4">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-gray-400 font-medium mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export function StatsTab() {
  const [connections,    setConnections]    = useState<ConnectionOut[]>([]);
  const [connLoading,    setConnLoading]    = useState(true);
  const [selectedConnId, setSelectedConnId] = useState('');
  const [days,           setDays]           = useState(30);

  const [stats,   setStats]   = useState<ConnectionStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Load connections once
  useEffect(() => {
    listConnections(true)
      .then(res => {
        setConnections(res.connections);
        if (res.connections.length > 0) setSelectedConnId(res.connections[0].connection_id);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load connections'))
      .finally(() => setConnLoading(false));
  }, []);

  const fetchStats = useCallback((connId: string, d: number) => {
    if (!connId) return;
    setLoading(true);
    setError(null);
    getConnectionStats(connId, d)
      .then(setStats)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load stats'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedConnId) fetchStats(selectedConnId, days);
  }, [selectedConnId, days, fetchStats]);

  const queryTypeData = stats
    ? Object.entries(stats.query_type_breakdown).map(([type, count]) => ({ type, count }))
    : [];

  const dailyData = stats?.daily_activity.map(d => ({
    date:  d.date.slice(5), // "MM-DD"
    count: d.count,
  })) ?? [];

  return (
    <div className="p-6 animate-in fade-in">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Usage Statistics</h3>
          {stats && (
            <p className="text-xs text-gray-400 mt-0.5">
              {DAYS_OPTIONS.find(o => o.value === days)?.label} · {stats.total_queries} total queries
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
                : connections.length === 0
                  ? <option value="">No databases</option>
                  : connections.map(c => (
                      <option key={c.connection_id} value={c.connection_id}>{c.name}</option>
                    ))
              }
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>

          {/* Days filter */}
          <div className="relative">
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none
                         appearance-none cursor-pointer"
            >
              {DAYS_OPTIONS.map(o => (
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

      {/* Loading */}
      {loading && selectedConnId && (
        <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading stats…</span>
        </div>
      )}

      {/* Empty state (no connections) */}
      {!connLoading && connections.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center">
            <Database className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-600">No databases connected</p>
          <p className="text-xs text-gray-400">Please add a database connection in the Databases tab to view usage statistics.</p>
        </div>
      )}

      {/* Content */}
      {!loading && stats && (
        <div className="space-y-6">

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Total Queries"
              value={stats.total_queries.toLocaleString()}
              icon={TrendingUp}
              color="bg-blue-50 text-blue-600"
            />
            <StatCard
              label="Success Rate"
              value={`${stats.success_rate.toFixed(1)}%`}
              sub={`${stats.successful_queries} succeeded · ${stats.failed_queries} failed`}
              icon={stats.success_rate >= 90 ? CheckCircle2 : XCircle}
              color={stats.success_rate >= 90 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}
            />
            <StatCard
              label="Total Rows Fetched"
              value={stats.total_rows_fetched.toLocaleString()}
              sub={`avg ${stats.avg_rows_per_query.toFixed(0)} rows/query`}
              icon={Rows3}
              color="bg-violet-50 text-violet-600"
            />
            <StatCard
              label="Avg Execution Time"
              value={`${stats.avg_execution_time_ms.toFixed(0)} ms`}
              icon={Timer}
              color="bg-amber-50 text-amber-600"
            />
          </div>

          {/* Daily activity chart */}
          {dailyData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h4 className="text-sm font-semibold text-gray-700 mb-4">Daily Query Activity</h4>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      labelFormatter={l => `Date: ${l}`}
                    />
                    <Bar dataKey="count" name="Queries" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">

            {/* Query type breakdown */}
            {queryTypeData.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h4 className="text-sm font-semibold text-gray-700 mb-4">Query Type Breakdown</h4>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={queryTypeData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="type" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={50} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                      <Bar dataKey="count" name="Queries" radius={[0, 4, 4, 0]}>
                        {queryTypeData.map(entry => (
                          <Cell key={entry.type} fill={QT_COLORS[entry.type] ?? '#94a3b8'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Top users */}
            {stats.top_users.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h4 className="text-sm font-semibold text-gray-700 mb-4">Top Users</h4>
                <div className="space-y-3">
                  {stats.top_users.map((u, i) => {
                    const pct = stats.total_queries > 0
                      ? Math.round((u.query_count / stats.total_queries) * 100)
                      : 0;
                    return (
                      <div key={u.firebase_uid}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-mono text-gray-500 truncate max-w-[70%]">
                            {i + 1}. {u.firebase_uid}
                          </span>
                          <span className="font-semibold text-gray-700">{u.query_count} queries</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
