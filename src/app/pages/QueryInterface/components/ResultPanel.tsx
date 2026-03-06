import React, { useState } from 'react';
import { Table } from 'lucide-react';
import { QueryResult, ResultTab } from '../types';
import { ResultTabs }     from './ResultTabs';
import { ResultTable }    from './ResultTable';
import { ResultSQL }      from './ResultSQL';
import { ResultChart }    from './ResultChart';
import { ResultActionBar } from './ResultActionBar';

interface ResultPanelProps {
  result: QueryResult | null;
  chartType: 'bar' | 'pie';                      // New
  setChartType: (type: 'bar' | 'pie') => void;   // New
  onCopy: (text: string) => void;                // New
  onDownload: () => void;
}

// ResultPanel.tsx

export function ResultPanel({ 
  result, 
  chartType, 
  setChartType, 
  onCopy, 
  onDownload,
}: ResultPanelProps) { // <--- Added destructuring here
  const [activeTab, setActiveTab] = useState<ResultTab>('table');

  // ── Empty state ───────────────────────────────────────────────────────────────
  if (!result) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
          <Table className="w-8 h-8 opacity-40" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">No results yet</h3>
        <p className="text-sm max-w-xs">
          Run a query in the chat panel to see data, SQL, and visualizations here.
        </p>
      </div>
    );
  }

  // ── Result state ──────────────────────────────────────────────────────────────
  return (
    <>
      <ResultTabs active={activeTab} onChange={setActiveTab} />

      <div className="flex-1 overflow-auto p-4 bg-white relative">
        {activeTab === 'table' && <ResultTable result={result} />}
        
        {/* SQL view now behaves like a Terminal */}
        {activeTab === 'sql'   && <ResultSQL result={result} onCopy={onCopy} />}
        
        {/* Chart view now has the Bar/Pie toggle */}
        {activeTab === 'chart' && (
          <ResultChart 
            result={result} 
            chartType={chartType} 
            setChartType={setChartType} 
          />
        )}
      </div>

      {/* Action bar handles the CSV and JSON downloads */}
      <ResultActionBar onDownload={onDownload} result={result} onCopy={onCopy} />
    </>
  );
}