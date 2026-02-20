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
}

export function ResultPanel({ result }: ResultPanelProps) {
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
        {activeTab === 'sql'   && <ResultSQL   result={result} />}
        {activeTab === 'chart' && <ResultChart result={result} />}
      </div>

      <ResultActionBar />
    </>
  );
}