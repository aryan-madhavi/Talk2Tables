import React from 'react';
import { QueryResult } from '../types';

export function ResultTable({ result }: { result: QueryResult }) {
  if (!result.data || result.data.length === 0) return <div>No data found.</div>;

  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="min-w-full divide-y divide-gray-200 text-sm text-left">
        <thead className="bg-gray-50">
          <tr>
            {result.columns.map((col) => (
              <th key={col} className="px-4 py-3 font-semibold text-gray-900 uppercase tracking-wider">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {result.data.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50 transition-colors">
              {result.columns.map((col) => (
                <td key={col} className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  {String(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}