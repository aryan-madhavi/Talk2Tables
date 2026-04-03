import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { QueryResult } from '../types';

export function ResultTable({ result }: { result: QueryResult }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: result.data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
  });

  if (!result.data || result.data.length === 0) {
    return <div className="p-4 text-gray-400 text-sm">No data found.</div>;
  }

  const items       = rowVirtualizer.getVirtualItems();
  const paddingTop    = items.length > 0 ? (items[0]?.start ?? 0) : 0;
  const paddingBottom = items.length > 0
    ? rowVirtualizer.getTotalSize() - (items[items.length - 1]?.end ?? 0)
    : 0;

  return (
    <div className="overflow-hidden border rounded-lg flex flex-col h-full">
      <div className="px-3 py-1.5 bg-gray-50 border-b text-xs text-gray-400 shrink-0">
        {result.data.length.toLocaleString()} row{result.data.length !== 1 ? 's' : ''}
      </div>
      <div ref={parentRef} className="overflow-auto flex-1">
        <table className="min-w-full divide-y divide-gray-200 text-sm text-left">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {result.columns.map(col => (
                <th key={col} className="px-4 py-3 font-semibold text-gray-900 uppercase tracking-wider whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {paddingTop > 0 && (
              <tr><td colSpan={result.columns.length} style={{ height: paddingTop }} /></tr>
            )}
            {items.map(virtualRow => {
              const row = result.data[virtualRow.index];
              return (
                <tr key={virtualRow.index} className="hover:bg-gray-50 transition-colors">
                  {result.columns.map(col => (
                    <td key={col} className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {String(row[col] ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })}
            {paddingBottom > 0 && (
              <tr><td colSpan={result.columns.length} style={{ height: paddingBottom }} /></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
