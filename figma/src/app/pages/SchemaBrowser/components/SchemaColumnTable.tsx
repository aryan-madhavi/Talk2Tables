import React from 'react';
import { Key, Link2 } from 'lucide-react';
import { TableSchema } from '../types';

interface SchemaColumnTableProps {
  table: TableSchema;
}

export function SchemaColumnTable({ table }: SchemaColumnTableProps) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="px-6 py-3 font-medium">Column Name</th>
            <th className="px-6 py-3 font-medium">Data Type</th>
            <th className="px-6 py-3 font-medium">Key Type</th>
            <th className="px-6 py-3 font-medium">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {table.columns.map(col => (
            <tr key={col.name} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 font-medium text-gray-900">{col.name}</td>
              <td className="px-6 py-4 text-gray-600 font-mono text-xs">{col.type}</td>
              <td className="px-6 py-4">
                {col.isKey && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full
                                   bg-amber-50 text-amber-700 text-xs font-medium border border-amber-100">
                    <Key className="w-3 h-3" /> PK
                  </span>
                )}
                {col.isForeignKey && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full
                                   bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100 ml-2">
                    <Link2 className="w-3 h-3" /> FK
                  </span>
                )}
              </td>
              <td className="px-6 py-4 text-gray-400 italic text-xs">
                No description available
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}