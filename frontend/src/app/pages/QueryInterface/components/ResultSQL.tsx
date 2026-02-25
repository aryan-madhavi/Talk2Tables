import React from 'react';
import { Copy, AlertTriangle } from 'lucide-react';
import { QueryResult } from '../types';

interface ResultSQLProps {
  result: QueryResult;
}

export function ResultSQL({ result }: ResultSQLProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(result.sql);
  };

  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col">
      {/* Code block */}
      <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-400
                      overflow-auto flex-1 relative group">
        <pre>{result.sql}</pre>
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 p-2 bg-gray-800 rounded opacity-0
                     group-hover:opacity-100 transition-opacity text-white hover:bg-gray-700"
          title="Copy SQL"
        >
          <Copy className="w-4 h-4" />
        </button>
      </div>

      {/* Warning */}
      <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 text-amber-800
                      rounded-lg text-sm border border-amber-200">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        Generated SQL may need review before production use.
      </div>
    </div>
  );
}