import React, { useState } from 'react';
import { Target, TrendingUp, FlaskConical, ChevronDown, ChevronUp, Hash, Tag, AlertCircle, Sparkles, Loader2 } from 'lucide-react';
import { QueryResult, NumericColumnStats, CategoricalColumnStats } from '../types';
import { cn } from '../../../../lib/utils';
import { generateInsights } from '../../../../lib/queryService';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  if (Number.isInteger(n))      return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// ── Narrative cards (business user view) ─────────────────────────────────────

const NARRATIVE_CARDS = [
  {
    key:     'key_finding'      as const,
    label:   'Key Finding',
    icon:    Target,
    color:   'blue',
    bg:      'bg-blue-50',
    border:  'border-blue-100',
    iconBg:  'bg-blue-100',
    iconCol: 'text-blue-600',
    textCol: 'text-blue-900',
  },
  {
    key:     'business_insight' as const,
    label:   'Business Insight',
    icon:    TrendingUp,
    color:   'emerald',
    bg:      'bg-emerald-50',
    border:  'border-emerald-100',
    iconBg:  'bg-emerald-100',
    iconCol: 'text-emerald-600',
    textCol: 'text-emerald-900',
  },
  {
    key:     'analyst_note'     as const,
    label:   'Analyst Note',
    icon:    FlaskConical,
    color:   'violet',
    bg:      'bg-violet-50',
    border:  'border-violet-100',
    iconBg:  'bg-violet-100',
    iconCol: 'text-violet-600',
    textCol: 'text-violet-900',
  },
];

// ── Detailed stats (analyst view — collapsible) ───────────────────────────────

function NumericStat({ col, stats }: { col: string; stats: NumericColumnStats }) {
  const range = stats.max - stats.min;
  const avgPct = range > 0 ? ((stats.avg - stats.min) / range) * 100 : 50;
  return (
    <div className="py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
          <Hash className="w-3 h-3 text-blue-400" />
          {col.replace(/_/g, ' ')}
        </span>
        <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded font-medium">numeric</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 mb-2">
        {[['Min', fmt(stats.min)], ['Max', fmt(stats.max)], ['Avg', fmt(stats.avg)], ['Sum', fmt(stats.sum)]].map(([l, v]) => (
          <div key={l} className="bg-gray-50 rounded px-2 py-1 text-center">
            <p className="text-[9px] text-gray-400 uppercase tracking-wide">{l}</p>
            <p className="text-xs font-bold text-gray-800 truncate">{v}</p>
          </div>
        ))}
      </div>
      {/* avg position bar */}
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-400 rounded-full"
          style={{ width: `${Math.max(2, Math.min(98, avgPct))}%` }}
        />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px] text-gray-400">{fmt(stats.min)}</span>
        <span className="text-[9px] text-gray-400">avg {fmt(stats.avg)}</span>
        <span className="text-[9px] text-gray-400">{fmt(stats.max)}</span>
      </div>
      {stats.null_count > 0 && (
        <p className="mt-1 text-[10px] text-amber-500 flex items-center gap-1">
          <AlertCircle className="w-2.5 h-2.5" /> {stats.null_count} nulls
        </p>
      )}
    </div>
  );
}

function CategoricalStat({ col, stats }: { col: string; stats: CategoricalColumnStats }) {
  const total = stats.most_common.reduce((s, e) => s + e.count, 0);
  return (
    <div className="py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
          <Tag className="w-3 h-3 text-violet-400" />
          {col.replace(/_/g, ' ')}
        </span>
        <span className="text-[10px] text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded font-medium">
          {stats.unique_count} unique
        </span>
      </div>
      <div className="space-y-1.5">
        {stats.most_common.map(({ value, count }) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={value}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] text-gray-600 truncate max-w-[60%]" title={value}>
                  {value || '(empty)'}
                </span>
                <span className="text-[10px] text-gray-400">{count} · {pct}%</span>
              </div>
              <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-violet-300 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {stats.null_count > 0 && (
        <p className="mt-1.5 text-[10px] text-amber-500 flex items-center gap-1">
          <AlertCircle className="w-2.5 h-2.5" /> {stats.null_count} nulls
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ResultInsightsProps {
  result:              QueryResult;
  onInsightsGenerated: (insights: QueryResult['insights'], narrativeInsights: QueryResult['narrativeInsights']) => void;
}

export function ResultInsights({ result, onInsightsGenerated }: ResultInsightsProps) {
  const [statsOpen,  setStatsOpen]  = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError,   setGenError]   = useState<string | null>(null);

  const narrative = result.narrativeInsights;
  const insights  = result.insights;
  const hasStats  = insights && Object.keys(insights.aggregations).length > 0;

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await generateInsights(result.data, result.question ?? result.summary ?? '');
      onInsightsGenerated(
        res.numerical_insights as QueryResult['insights'],
        res.narrative_insights as QueryResult['narrativeInsights'],
      );
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate insights.');
    } finally {
      setGenerating(false);
    }
  };

  // Show spinner while Phase 2 parallel insights are being generated
  if (result.insightsLoading && !narrative && !hasStats) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        <p className="text-sm text-gray-500">Generating insights…</p>
      </div>
    );
  }

  if (!narrative && !hasStats) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-gray-400">
        <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center">
          <Sparkles className="w-5 h-5 opacity-40" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-600 mb-1">No insights available</p>
          <p className="text-xs text-gray-400 max-w-xs">AI-powered insights could not be generated for this query.</p>
        </div>
        {genError && <p className="text-xs text-red-500 text-center max-w-xs">{genError}</p>}
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {generating
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
            : <><Sparkles className="w-3.5 h-3.5" /> Retry</>
          }
        </button>
      </div>
    );
  }

  const entries         = hasStats ? Object.entries(insights!.aggregations) : [];
  const numericCols     = entries.filter(([, s]) => s.type === 'numeric');
  const categoricalCols = entries.filter(([, s]) => s.type === 'categorical');

  return (
    <div className="space-y-4">

      {/* ── Overview pill row ── */}
      {hasStats && (
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Records',  value: insights!.total_records.toLocaleString() },
            { label: 'Columns',  value: entries.length.toString() },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <span className="text-xs text-gray-400">{label}</span>
              <span className="text-sm font-bold text-gray-800">{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Loading spinner while Phase 2 narrative is in flight ── */}
      {!narrative && hasStats && (
        <div className="flex flex-col items-center gap-2 py-2">
          {result.insightsLoading || generating
            ? (
              <div className="flex items-center gap-2 text-sm text-blue-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating AI insights…
              </div>
            ) : (
              <>
                {genError && <p className="text-xs text-red-500">{genError}</p>}
                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Retry
                </button>
              </>
            )
          }
        </div>
      )}

      {/* ── Narrative cards (business user) ── */}
      {narrative && (
        <div className="space-y-3">
          {NARRATIVE_CARDS.map(({ key, label, icon: Icon, bg, border, iconBg, iconCol, textCol }) => {
            const text = narrative[key];
            if (!text) return null;
            return (
              <div key={key} className={cn('rounded-xl border p-4', bg, border)}>
                <div className="flex items-start gap-3">
                  <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5', iconBg)}>
                    <Icon className={cn('w-3.5 h-3.5', iconCol)} />
                  </div>
                  <div>
                    <p className={cn('text-[10px] font-semibold uppercase tracking-wide mb-1', iconCol)}>{label}</p>
                    <p className={cn('text-sm leading-relaxed', textCol)}>{text}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Detailed stats (analyst — collapsible) ── */}
      {hasStats && (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <button
            onClick={() => setStatsOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
          >
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Detailed Statistics
            </span>
            {statsOpen
              ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
              : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            }
          </button>

          {statsOpen && (
            <div className="px-4 bg-white">
              {numericCols.map(([col, stats]) => (
                <NumericStat key={col} col={col} stats={stats as NumericColumnStats} />
              ))}
              {categoricalCols.map(([col, stats]) => (
                <CategoricalStat key={col} col={col} stats={stats as CategoricalColumnStats} />
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
