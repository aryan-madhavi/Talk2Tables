import React, { useMemo, useState, useEffect } from 'react';
import {
  BarChart2, PieChart as PieIcon, TrendingUp,
  Activity, CircleDot, Layers, Info, Sparkles,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
  LineChart, Line,
  AreaChart, Area,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { QueryResult } from '../types';
import { cn } from '../../../../lib/utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_BAR_VERTICAL = 12;
const MAX_BAR_TOTAL    = 25;
const MAX_PIE_SLICES   = 7;

const COLORS = [
  '#4F8EF7','#FF6B6B','#10B981','#F59E0B','#8B5CF6',
  '#06B6D4','#F97316','#EC4899','#14B8A6','#6366F1',
  '#84CC16','#EF4444','#0EA5E9','#A855F7',
];

export type ChartKind = 'bar' | 'pie' | 'line' | 'area' | 'scatter' | 'grouped';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtVal(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  if (Number.isInteger(n))      return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function truncLabel(s: string, max = 16): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

const _DATE_HINTS = ['date','time','month','year','week','day','quarter','period','created','updated','at'];
function looksLikeDate(col: string, sample: unknown): boolean {
  const c = col.toLowerCase();
  if (_DATE_HINTS.some(h => c.includes(h))) return true;
  if (typeof sample === 'string')
    return /^\d{4}-\d{2}(-\d{2})?/.test(sample) || /^\d{4}$/.test(sample);
  return false;
}

const _PERCENT_HINTS = ['percent','pct','ratio','share','rate','proportion','fraction'];
function looksLikePercent(col: string, values: number[]): boolean {
  const c = col.toLowerCase();
  if (_PERCENT_HINTS.some(h => c.includes(h))) return true;
  const total = values.reduce((s, v) => s + v, 0);
  return total >= 98 && total <= 102;
}

// ── Auto-detect best chart kind ───────────────────────────────────────────────

function detectChartKind(
  data: Record<string, unknown>[],
  columns: string[],
): { kind: ChartKind; reason: string } {
  if (!data.length || !columns.length) return { kind: 'bar', reason: '' };

  // Classify each column
  const numericCols = columns.filter(col =>
    data.filter(r => r[col] != null && r[col] !== '').every(r => !isNaN(Number(r[col])))
    && data.some(r => r[col] != null)
  );
  const textCols  = columns.filter(c => !numericCols.includes(c));
  const labelCol  = textCols[0];
  const dateCol   = textCols.find(c => looksLikeDate(c, data[0]?.[c]));

  const uniqueLabels = labelCol ? new Set(data.map(r => String(r[labelCol]))).size : 0;

  // 1. Two numeric columns → scatter (correlation analysis)
  if (numericCols.length >= 2 && textCols.length === 0) {
    return { kind: 'scatter', reason: 'Two numeric columns detected — great for correlation analysis' };
  }

  // 2. Date/time label → line or area
  if (dateCol && numericCols.length >= 1) {
    if (data.length > 20)
      return { kind: 'area', reason: 'Time series with many points — area chart shows volume clearly' };
    return { kind: 'line', reason: 'Date column detected — line chart shows trend over time' };
  }

  // 3. Multiple numeric columns per category → grouped bar
  if (numericCols.length >= 2 && labelCol && uniqueLabels <= 15) {
    return { kind: 'grouped', reason: 'Multiple metrics per category — grouped bars for easy comparison' };
  }

  // 4. Percentage/proportion data with few slices → pie
  if (numericCols.length === 1 && labelCol) {
    const values = data.map(r => Number(r[numericCols[0]]) || 0);
    if (uniqueLabels <= MAX_PIE_SLICES && looksLikePercent(numericCols[0], values))
      return { kind: 'pie', reason: 'Percentage data with few categories — pie chart shows proportions' };
    if (uniqueLabels <= 5 && data.length <= 5)
      return { kind: 'pie', reason: 'Few categories — pie chart shows share at a glance' };
  }

  // 5. Many categories → horizontal bar
  if (uniqueLabels > MAX_BAR_VERTICAL)
    return { kind: 'bar', reason: 'Many categories — horizontal bar chart for readability' };

  // 6. Default: vertical bar
  return { kind: 'bar', reason: 'Categorical comparison — bar chart is clearest' };
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(15,15,25,0.92)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    }}>
      <p style={{ color: '#aaa', fontSize: 11, marginBottom: 4 }}>{label ?? payload[0]?.name}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || '#fff', fontWeight: 700, fontSize: 14, margin: '2px 0' }}>
          {p.name !== 'value' ? <span style={{ opacity: 0.7, fontWeight: 400, marginRight: 6 }}>{p.name}</span> : null}
          {typeof p.value === 'number' ? fmtVal(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

const PieLegend = ({ payload }: any) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '5px 10px', marginTop: 8 }}>
    {payload?.map((e: any, i: number) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: e.color }} />
        <span style={{ color: '#64748b', fontSize: 10, fontWeight: 500 }}>{truncLabel(e.value, 22)}</span>
      </div>
    ))}
  </div>
);

// ── Tab config ────────────────────────────────────────────────────────────────

const ALL_KINDS: { id: ChartKind; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'bar',     label: 'Bar',     icon: BarChart2,   desc: 'Compare categories'         },
  { id: 'line',    label: 'Line',    icon: TrendingUp,  desc: 'Trends over time'            },
  { id: 'area',    label: 'Area',    icon: Activity,    desc: 'Volume over time'             },
  { id: 'pie',     label: 'Pie',     icon: PieIcon,     desc: 'Part-to-whole proportions'   },
  { id: 'scatter', label: 'Scatter', icon: CircleDot,   desc: 'Correlation between metrics' },
  { id: 'grouped', label: 'Grouped', icon: Layers,      desc: 'Multiple metrics per group'  },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface ResultChartProps {
  result:       QueryResult;
  chartType:    'bar' | 'pie';
  setChartType: (type: 'bar' | 'pie') => void;
}

export function ResultChart({ result, chartType, setChartType }: ResultChartProps) {
  // ── Column analysis ──────────────────────────────────────────────────────────
  const colMeta = useMemo(() => {
    const data = result?.data    || [];
    const cols = result?.columns || [];
    if (!data.length || !cols.length)
      return { numericCols: [], textCols: [], labelCol: '', dateCol: '', data: [] };

    const numericCols = cols.filter(col =>
      data.filter(r => r[col] != null && r[col] !== '').every(r => !isNaN(Number(r[col])))
      && data.some(r => r[col] != null)
    );
    const textCols = cols.filter(c => !numericCols.includes(c));
    const labelCol = textCols.find(c => new Set(data.map(r => String(r[c]))).size > 1) ?? textCols[0] ?? '';
    const dateCol  = textCols.find(c => looksLikeDate(c, data[0]?.[c])) ?? '';

    return { numericCols, textCols, labelCol, dateCol, data };
  }, [result]);

  // ── Auto-detect ──────────────────────────────────────────────────────────────
  const { kind: autoKind, reason: autoReason } = useMemo(
    () => detectChartKind(result?.data || [], result?.columns || []),
    [result?.id],
  );

  const [activeKind, setActiveKind] = useState<ChartKind>(autoKind);
  const [userOverride, setUserOverride] = useState(false);

  // Reset to auto-detected type when result changes
  useEffect(() => {
    setActiveKind(autoKind);
    setUserOverride(false);
  }, [result?.id, autoKind]);

  const handleKind = (k: ChartKind) => {
    setActiveKind(k);
    setUserOverride(k !== autoKind);
    if (k === 'bar' || k === 'pie') setChartType(k);
  };

  // ── Which tabs to show ───────────────────────────────────────────────────────
  const { numericCols, labelCol, dateCol, data } = colMeta;
  const visibleKinds = ALL_KINDS.filter(({ id }) => {
    if (id === 'scatter') return numericCols.length >= 2;
    if (id === 'grouped') return numericCols.length >= 2 && !!labelCol;
    return true; // bar, line, area, pie always shown
  });

  // ── Data for active chart ────────────────────────────────────────────────────
  const { chartData, truncated, totalCount } = useMemo(() => {
    if (!data.length) return { chartData: [], truncated: false, totalCount: 0 };
    const total = data.length;

    if (activeKind === 'scatter') {
      // raw rows with x/y
      return { chartData: data, truncated: false, totalCount: total };
    }

    if (activeKind === 'grouped') {
      // keep original order, use label + all numeric cols
      return { chartData: data, truncated: total > MAX_BAR_TOTAL, totalCount: total };
    }

    // For single-value charts — build name/value pairs sorted desc
    const valueCol = numericCols[0] ?? '';
    const xCol     = dateCol || labelCol;
    if (!xCol || !valueCol) return { chartData: [], truncated: false, totalCount: total };

    const pairs = data.map(r => ({
      name:  String(r[xCol]   ?? ''),
      value: Number(r[valueCol]) || 0,
    }));

    // For time series: keep original order
    if (activeKind === 'line' || activeKind === 'area') {
      return { chartData: pairs, truncated: false, totalCount: total };
    }

    const sorted = [...pairs].sort((a, b) => b.value - a.value);

    if (activeKind === 'pie') {
      if (total <= MAX_PIE_SLICES) return { chartData: sorted, truncated: false, totalCount: total };
      const top    = sorted.slice(0, MAX_PIE_SLICES);
      const others = sorted.slice(MAX_PIE_SLICES).reduce((s, d) => s + d.value, 0);
      return { chartData: [...top, { name: `Others (${total - MAX_PIE_SLICES})`, value: others }], truncated: true, totalCount: total };
    }

    // bar
    if (total <= MAX_BAR_TOTAL) return { chartData: sorted, truncated: false, totalCount: total };
    const top    = sorted.slice(0, MAX_BAR_TOTAL);
    const others = sorted.slice(MAX_BAR_TOTAL).reduce((s, d) => s + d.value, 0);
    return { chartData: [...top, { name: `Others (${total - MAX_BAR_TOTAL})`, value: others }], truncated: true, totalCount: total };
  }, [data, activeKind, numericCols, labelCol, dateCol]);

  const isHorizontal = activeKind === 'bar' && chartData.length > MAX_BAR_VERTICAL;
  const barSize      = isHorizontal
    ? Math.max(10, Math.min(26, Math.floor(240 / Math.max(chartData.length, 1))))
    : Math.max(8,  Math.min(36, Math.floor(480 / Math.max(chartData.length, 1))));
  const chartHeight  = isHorizontal ? Math.max(300, chartData.length * 26 + 50) : 310;

  if (!chartData.length && activeKind !== 'scatter') {
    return (
      <div className="h-[300px] flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-100 rounded-xl">
        <BarChart2 className="w-10 h-10 mb-2 opacity-20" />
        <p className="text-sm">No chartable data for this view</p>
      </div>
    );
  }

  const xCol = dateCol || labelCol;
  const valueCol = numericCols[0] ?? '';

  return (
    <div className="flex flex-col gap-3">

      {/* ── Auto-detect banner ── */}
      {!userOverride && autoReason && (
        <div className="flex items-center gap-2 text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5">
          <Sparkles className="w-3 h-3 shrink-0" />
          <span><strong>Auto-selected:</strong> {autoReason}</span>
        </div>
      )}

      {/* ── Truncation notice ── */}
      {truncated && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
          <Info className="w-3 h-3 shrink-0" />
          Showing top {activeKind === 'pie' ? MAX_PIE_SLICES : MAX_BAR_TOTAL} of {totalCount} records
        </div>
      )}

      {/* ── Chart type selector ── */}
      <div className="flex flex-wrap gap-1.5">
        {visibleKinds.map(({ id, label, icon: Icon }) => {
          const isAuto   = id === autoKind;
          const isActive = id === activeKind;
          return (
            <button
              key={id}
              onClick={() => handleKind(id)}
              title={ALL_KINDS.find(k => k.id === id)?.desc}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all font-medium',
                isActive
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600',
              )}
            >
              <Icon className="w-3 h-3" />
              {label}
              {isAuto && !isActive && (
                <span className="text-[9px] bg-amber-100 text-amber-600 px-1 rounded font-semibold">AUTO</span>
              )}
              {isAuto && isActive && (
                <Sparkles className="w-2.5 h-2.5 opacity-80" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Chart ── */}
      <div className="w-full overflow-x-auto">
        <div style={{ height: chartHeight, minWidth: isHorizontal ? 280 : undefined }}>
          <ResponsiveContainer width="100%" height="100%">

            {/* VERTICAL BAR */}
            {activeKind === 'bar' && !isHorizontal ? (
              <BarChart data={chartData} margin={{ top: 6, right: 8, left: -16, bottom: chartData.length > 6 ? 52 : 16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={10} tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false} angle={chartData.length > 6 ? -35 : 0}
                  textAnchor={chartData.length > 6 ? 'end' : 'middle'} interval={0}
                  tickFormatter={s => truncLabel(s, chartData.length > 10 ? 10 : 14)} />
                <YAxis fontSize={10} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtVal} width={46} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[5, 5, 0, 0]} barSize={barSize}>
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>

            /* HORIZONTAL BAR */
            ) : activeKind === 'bar' && isHorizontal ? (
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 44, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" fontSize={10} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtVal} />
                <YAxis type="category" dataKey="name" fontSize={10} tick={{ fill: '#64748b' }} axisLine={false}
                  tickLine={false} width={114} tickFormatter={s => truncLabel(s, 18)} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[0, 5, 5, 0]} barSize={barSize}>
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>

            /* LINE */
            ) : activeKind === 'line' ? (
              <LineChart data={chartData} margin={{ top: 6, right: 16, left: -16, bottom: chartData.length > 10 ? 44 : 16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={10} tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false} angle={chartData.length > 10 ? -30 : 0} textAnchor={chartData.length > 10 ? 'end' : 'middle'}
                  tickFormatter={s => truncLabel(s, 12)} interval={chartData.length > 20 ? Math.floor(chartData.length / 8) : 0} />
                <YAxis fontSize={10} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtVal} width={46} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="value" stroke={COLORS[0]} strokeWidth={2.5}
                  dot={chartData.length <= 30 ? { fill: COLORS[0], r: 3, strokeWidth: 0 } : false}
                  activeDot={{ r: 5, strokeWidth: 0 }} />
              </LineChart>

            /* AREA */
            ) : activeKind === 'area' ? (
              <AreaChart data={chartData} margin={{ top: 6, right: 16, left: -16, bottom: chartData.length > 10 ? 44 : 16 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={COLORS[0]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={10} tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false} angle={chartData.length > 10 ? -30 : 0} textAnchor={chartData.length > 10 ? 'end' : 'middle'}
                  tickFormatter={s => truncLabel(s, 12)} interval={chartData.length > 20 ? Math.floor(chartData.length / 8) : 0} />
                <YAxis fontSize={10} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtVal} width={46} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="value" stroke={COLORS[0]} strokeWidth={2.5}
                  fill="url(#areaGrad)" dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: COLORS[0] }} />
              </AreaChart>

            /* SCATTER */
            ) : activeKind === 'scatter' ? (
              <ScatterChart margin={{ top: 6, right: 16, left: -10, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" dataKey={numericCols[0]} name={numericCols[0]}
                  fontSize={10} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false}
                  tickFormatter={fmtVal} label={{ value: numericCols[0], position: 'insideBottom', offset: -2, fontSize: 10, fill: '#94a3b8' }} />
                <YAxis type="number" dataKey={numericCols[1]} name={numericCols[1]}
                  fontSize={10} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false}
                  tickFormatter={fmtVal} width={48}
                  label={{ value: numericCols[1], angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }} />
                <ZAxis range={[40, 40]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                <Scatter data={data} fill={COLORS[0]} fillOpacity={0.7} />
              </ScatterChart>

            /* GROUPED BAR */
            ) : activeKind === 'grouped' ? (
              <BarChart data={chartData.slice(0, MAX_BAR_TOTAL)} margin={{ top: 6, right: 8, left: -16, bottom: chartData.length > 6 ? 52 : 16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey={labelCol} fontSize={10} tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false} angle={chartData.length > 5 ? -30 : 0}
                  textAnchor={chartData.length > 5 ? 'end' : 'middle'} interval={0}
                  tickFormatter={s => truncLabel(s, 10)} />
                <YAxis fontSize={10} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtVal} width={46} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                {numericCols.slice(0, 5).map((col, i) => (
                  <Bar key={col} dataKey={col} fill={COLORS[i]} radius={[3, 3, 0, 0]}
                    barSize={Math.max(6, Math.floor(36 / numericCols.slice(0, 5).length))} />
                ))}
              </BarChart>

            /* PIE */
            ) : (
              <PieChart>
                <Pie data={chartData} cx="50%" cy="42%"
                  innerRadius={chartData.length > 4 ? 50 : 0}
                  outerRadius={chartData.length > 4 ? 100 : 110}
                  paddingAngle={chartData.length > 1 ? 2 : 0}
                  dataKey="value" nameKey="name" animationDuration={500}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="rgba(255,255,255,0.5)" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend content={<PieLegend />} />
              </PieChart>
            )}

          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
