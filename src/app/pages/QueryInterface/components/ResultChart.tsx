import React, { useMemo } from 'react';
import { BarChart2, PieChart as PieIcon } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend
} from 'recharts';
import { QueryResult } from '../types';

interface ResultChartProps {
  result: QueryResult;
  chartType: 'bar' | 'pie';
  setChartType: (type: 'bar' | 'pie') => void;
}

// ── Vibrant, visually distinct color palette ──────────────────────────────────
const COLORS = [
  '#FF6B6B', // coral red
  '#4ECDC4', // teal
  '#FFE66D', // golden yellow
  '#A29BFE', // soft purple
  '#55EFC4', // mint green
  '#FD79A8', // pink
  '#FDCB6E', // warm orange
  '#6C5CE7', // deep violet
  '#00CEC9', // cyan
  '#E17055', // burnt orange
  '#74B9FF', // sky blue
  '#00B894', // emerald
];

// ── Custom tooltip ────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(15, 15, 25, 0.92)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '10px',
      padding: '10px 16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      backdropFilter: 'blur(10px)',
    }}>
      <p style={{ color: '#aaa', fontSize: 11, marginBottom: 4 }}>{label || payload[0]?.name}</p>
      <p style={{ color: payload[0]?.color || '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>
        {payload[0]?.value?.toLocaleString()}
      </p>
    </div>
  );
};

// ── Custom legend for pie ────────────────────────────────────────────────────
const CustomLegend = ({ payload }: any) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 16px', marginTop: 12 }}>
    {payload?.map((entry: any, i: number) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: entry.color,
          boxShadow: `0 0 6px ${entry.color}88`,
        }} />
        <span style={{ color: '#64748b', fontSize: 11, fontWeight: 500 }}>{entry.value}</span>
      </div>
    ))}
  </div>
);

export function ResultChart({ result, chartType, setChartType }: ResultChartProps) {
  const safeData = useMemo(() => {
    const rows = result?.data    || [];
    const cols = result?.columns || [];

    if (rows.length === 0 || cols.length === 0) return [];

    // Find all numeric columns
    const numericCols = cols.filter(col =>
      rows.every(r => r[col] !== null && r[col] !== undefined && !isNaN(Number(r[col])))
    );

    // Find best label column: non-numeric AND values vary across rows
    const labelCol =
      cols.find(col => {
        if (numericCols.includes(col)) return false;
        const values = rows.map(r => String(r[col]));
        return new Set(values).size > 1;
      }) ?? cols.find(col => !numericCols.includes(col));

    const valueCol = numericCols[0];

    if (!labelCol || !valueCol) return [];

    return rows.map(row => ({
      name:  String(row[labelCol]  ?? ''),
      value: Number(row[valueCol]) || 0,
    }));
  }, [result]);

  const hasData = safeData.length > 0;

  if (!hasData) {
    return (
      <div className="h-[350px] flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-100 rounded-xl">
        <BarChart2 className="w-12 h-12 mb-2 opacity-20" />
        <p className="text-sm">No numeric data available for visualization</p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 h-full w-full flex flex-col">

      {/* ── TOGGLE ── */}
      <div className="flex justify-end mb-6">
        <div className="inline-flex bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setChartType('bar')}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs rounded-md transition-all ${
              chartType === 'bar'
                ? 'bg-white text-blue-700 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <BarChart2 size={14} /> BAR
          </button>
          <button
            onClick={() => setChartType('pie')}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs rounded-md transition-all ${
              chartType === 'pie'
                ? 'bg-white text-blue-700 shadow-sm font-bold'
                : 'text-slate-500 hover:text-gray-700'
            }`}
          >
            <PieIcon size={14} /> PIE
          </button>
        </div>
      </div>

      {/* ── CHART ── */}
      <div className="w-full h-[350px] min-h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart
              data={safeData}
              margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
              key={`bar-${result.id}`}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="name"
                fontSize={10}
                tick={{ fill: '#94a3b8' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
              />
              <YAxis
                fontSize={10}
                tick={{ fill: '#94a3b8' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={36}>
                {safeData.map((_, index) => (
                  <Cell
                    key={`bar-cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                    style={{ filter: `drop-shadow(0 4px 8px ${COLORS[index % COLORS.length]}55)` }}
                  />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <PieChart key={`pie-${result.id}`}>
              <Pie
                data={safeData}
                cx="50%"
                cy="45%"
                innerRadius={0}        // ✅ 0 = full pie, not donut
                outerRadius={120}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
                animationDuration={800}
                animationBegin={0}
              >
                {safeData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                    stroke="rgba(255,255,255,0.6)"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend content={<CustomLegend />} />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}