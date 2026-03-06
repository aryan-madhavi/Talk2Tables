import React from 'react';
import { Download, Copy, RefreshCw } from 'lucide-react';
import { QueryResult } from '../types';

interface ResultActionBarProps {
  result: QueryResult;
  onDownload: () => void;
  onCopy: (text: string) => void;
}

export function ResultActionBar({ result, onDownload, onCopy }: ResultActionBarProps) {
  const handleCopyJSON = () => {
    const dataString = JSON.stringify(result.data, null, 2);
    onCopy(dataString);
  };

  return (
    <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
      <div className="flex gap-2">
        <button 
          onClick={onDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600 transition-all active:scale-95 shadow-sm"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
        <button 
          onClick={handleCopyJSON}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600 transition-all active:scale-95 shadow-sm"
        >
          <Copy className="w-3.5 h-3.5" /> Copy JSON
        </button>
      </div>
      <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors">
        <RefreshCw className="w-3.5 h-3.5" /> Refine
      </button>
    </div>
  );
}