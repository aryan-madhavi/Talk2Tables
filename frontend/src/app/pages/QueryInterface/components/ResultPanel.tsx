import React, { useState } from 'react';
import { Table } from 'lucide-react';
import { QueryResult, ResultTab } from '../types';
import { ResultTabs }     from './ResultTabs';
import { ResultTable }    from './ResultTable';
import { ResultSQL }      from './ResultSQL';
import { ResultChart }    from './ResultChart';
import { ResultInsights } from './ResultInsights';
import { ResultActionBar } from './ResultActionBar';

interface ResultPanelProps {
  result:       QueryResult | null;
  chartType:    'bar' | 'pie';
  setChartType: (type: 'bar' | 'pie') => void;
  onCopy:       (text: string) => void;
  onDownload:   () => void;
  onSave:       () => Promise<void>;
  isFavourited: boolean;
  onInsightsGenerated: (insights: QueryResult['insights'], narrativeInsights: QueryResult['narrativeInsights']) => void;
}

export const ResultPanel = React.memo(function ResultPanel({
  result, chartType, setChartType, onCopy, onDownload, onSave, isFavourited, onInsightsGenerated,
}: ResultPanelProps) {
  const [activeTab, setActiveTab] = useState<ResultTab>('table');

  if (!result) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
          <Table className="w-8 h-8 opacity-40" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">No results yet</h3>
        <p className="text-sm max-w-xs">Run a query in the chat panel to see data, SQL, and visualizations here.</p>
      </div>
    );
  }

  const hasInsights = result.data.length > 0;

  return (
    <>
      <ResultTabs active={activeTab} onChange={setActiveTab} hasInsights={hasInsights} />
      <div className="flex-1 overflow-auto p-4 bg-white relative">
        {activeTab === 'table'    && <ResultTable    result={result} />}
        {activeTab === 'sql'      && <ResultSQL      result={result} onCopy={onCopy} />}
        {activeTab === 'chart'    && <ResultChart    result={result} chartType={chartType} setChartType={setChartType} />}
        {activeTab === 'insights' && <ResultInsights result={result} onInsightsGenerated={onInsightsGenerated} />}
      </div>
      <ResultActionBar
        result={result}
        onDownload={onDownload}
        onCopy={onCopy}
        onSave={onSave}
        isFavourited={isFavourited}
      />
    </>
  );
});
