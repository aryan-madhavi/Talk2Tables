import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  Database, MessageSquare, Heart, Loader2, Play,
  BarChart2, TrendingUp, CheckCircle2, XCircle,
} from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';
import { getQueryHistory, QueryHistoryItem } from '../../../lib/queryService';
import { listWorkspaces }                    from '../../../lib/chatService';
import { cn }                                from '../../../lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDailyChart(items: QueryHistoryItem[]) {
  return Array.from({ length: 7 }, (_, i) => {
    const day = startOfDay(subDays(new Date(), 6 - i));
    return {
      label: format(day, 'MMM d'),
      ts:    day.getTime(),
      count: 0,
    };
  }).map(slot => {
    slot.count = items.filter(
      item => startOfDay(new Date(item.created_at)).getTime() === slot.ts,
    ).length;
    return slot;
  });
}

const TYPE_COLOR: Record<string, string> = {
  SELECT: 'bg-green-100 text-green-700',
  INSERT: 'bg-blue-100 text-blue-700',
  UPDATE: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Reports() {
  const navigate = useNavigate();

  const [allHistory,     setAllHistory]     = useState<QueryHistoryItem[]>([]);
  const [savedItems,     setSavedItems]     = useState<QueryHistoryItem[]>([]);
  const [workspaceCount, setWorkspaceCount] = useState(0);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    Promise.all([
      getQueryHistory({ limit: 200 }),
      getQueryHistory({ limit: 100, favouritesOnly: true }),
      listWorkspaces(),
    ])
      .then(([hist, saved, ws]) => {
        setAllHistory(hist.history ?? []);
        setSavedItems(saved.history ?? []);
        setWorkspaceCount(ws.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const chartData   = buildDailyChart(allHistory);
  const successRate = allHistory.length
    ? Math.round((allHistory.filter(h => h.status === 'success').length / allHistory.length) * 100)
    : 0;

  const stats = [
    {
      label: 'Databases Connected',
      value: workspaceCount,
      icon:  Database,
      color: 'text-blue-600',
      bg:    'bg-blue-50',
    },
    {
      label: 'Total Queries Run',
      value: allHistory.length,
      icon:  MessageSquare,
      color: 'text-green-600',
      bg:    'bg-green-50',
    },
    {
      label: 'Saved Reports',
      value: savedItems.length,
      icon:  Heart,
      color: 'text-rose-500',
      bg:    'bg-rose-50',
    },
    {
      label: 'Success Rate',
      value: `${successRate}%`,
      icon:  TrendingUp,
      color: 'text-violet-600',
      bg:    'bg-violet-50',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span>Loading reports…</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart2 className="w-6 h-6 text-blue-600" />
          Reports
        </h1>
        <p className="text-gray-500 text-sm mt-1">Query activity and saved reports overview</p>
      </div>

      {/* ── Stats strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className={cn('w-11 h-11 rounded-lg flex items-center justify-center shrink-0', s.bg)}>
              <s.icon className={cn('w-5 h-5', s.color)} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Activity chart ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Query Activity</h2>
        <p className="text-sm text-gray-500 mb-6">Queries run over the last 7 days</p>

        {chartData.every(d => d.count === 0) ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
            No query activity in the last 7 days
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: '#eff6ff' }}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}
                formatter={(v: number) => [v, 'Queries']}
              />
              <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Saved reports ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Heart className="w-5 h-5 text-rose-500" />
          Saved Reports
        </h2>
        <p className="text-sm text-gray-500 mb-6">Queries you have marked as favourites</p>

        {savedItems.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <Heart className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No saved reports yet — favourite a query result to save it here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {savedItems.map(item => (
              <div
                key={item.msg_id}
                className="flex items-start justify-between gap-4 p-4 bg-gray-50 rounded-lg
                           hover:bg-gray-100 transition-colors group"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {item.status === 'success'
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    : <XCircle     className="w-4 h-4 text-red-400   shrink-0 mt-0.5" />
                  }
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{item.title}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <span className={cn(
                        'text-[11px] font-semibold px-2 py-0.5 rounded-full',
                        TYPE_COLOR[item.query_type] ?? 'bg-gray-100 text-gray-600',
                      )}>
                        {item.query_type}
                      </span>
                      <span className="text-xs text-gray-500">{item.connection_name}</span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-gray-500">
                        {format(new Date(item.created_at), 'MMM d, yyyy')}
                      </span>
                      {item.total_records != null && (
                        <>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-500">{item.total_records.toLocaleString()} rows</span>
                        </>
                      )}
                    </div>
                    {item.sql_query && (
                      <p className="text-xs text-gray-400 font-mono mt-2 truncate">
                        {item.sql_query}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => navigate('/query', {
                    state: { query: item.title, connectionId: item.connection_id },
                  })}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                             text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg
                             opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  title="Run Again"
                >
                  <Play className="w-3 h-3 fill-current" />
                  Run
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
