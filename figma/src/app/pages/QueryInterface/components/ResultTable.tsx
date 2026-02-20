import React from 'react';
import { QueryResult } from '../types';

interface ResultTableProps {
  result: QueryResult;
}

export function ResultTable({ result }: ResultTableProps) {
  return (
    <div className="animate-in fade-in duration-300">
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50">
            <tr>
              {result.columns.map(col => (
                <th key={col} className="px-6 py-3 font-medium whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.data.map((row, i) => (
              <tr key={i} className="bg-white border-b hover:bg-gray-50">
                {result.columns.map(col => (
                  <td key={`${i}-${col}`} className="px-6 py-4 whitespace-nowrap text-gray-900">
                    {String(row[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 text-xs text-gray-500 text-right">
        Showing 1–{result.rowCount} of {result.rowCount} results
      </div>
    </div>
  );
}