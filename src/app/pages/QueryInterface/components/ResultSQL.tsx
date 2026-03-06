import React from 'react';
import { Copy, AlertTriangle, Terminal } from 'lucide-react';
import { QueryResult } from '../types';

interface ResultSQLProps {
  result: QueryResult;
  onCopy: (text: string) => void; // Must match ResultPanel
}

export function ResultSQL({ result, onCopy }: ResultSQLProps) {
  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col">
      {/* Terminal Header */}
      <div className="bg-slate-800 border border-slate-700 rounded-t-lg px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-mono text-slate-300 uppercase tracking-widest">Commands</span>
        </div>
        <button
          onClick={() => onCopy(result.sql)}
          className="p-1.5 text-slate-400 hover:text-white transition-colors hover:bg-slate-700 rounded"
          title="Copy SQL"
        >
          <Copy className="w-4 h-4" />
        </button>
      </div>

      {/* Terminal Body with Word Wrap */}
      <div className="bg-slate-900 border-x border-b border-slate-700 rounded-b-lg p-5 font-mono text-sm text-emerald-400 flex-1 relative group">
        <span className="text-slate-500 mr-2 select-none">$</span>
        <pre className="inline whitespace-pre-wrap break-all leading-relaxed">
          {result.sql || "-- No commands executed"}
        </pre>
      </div>

      <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm border border-amber-200">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        Generated SQL may need review before production use.
      </div>
    </div>
  );
}