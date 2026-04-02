import React from 'react';
import { Key, Link2 } from 'lucide-react';
import { ColumnOut } from '../../../../lib/schemaService';

interface SchemaColumnTableProps {
  columns: ColumnOut[];
}

export function SchemaColumnTable({ columns }: SchemaColumnTableProps) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="px-5 py-3 font-medium">Column</th>
            <th className="px-5 py-3 font-medium">Type</th>
            <th className="px-5 py-3 font-medium">Nullable</th>
            <th className="px-5 py-3 font-medium">Constraint</th>
            <th className="px-5 py-3 font-medium">Default</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {columns.map(col => {
            const isPK = col.primary_key || col.is_primary_key || col.constraint_type === 'PRIMARY KEY';
            const isFK = col.constraint_type === 'FOREIGN KEY' || !!col.references;
            const isUnique = col.unique || col.is_unique;
            const refTable = col.referenced_table || col.references;

            return (
              <tr key={col.column_name} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 text-sm">
                  <div className="font-medium text-gray-900">{col.column_name}</div>
                  {col.business_description && (
                    <div className="text-xs text-gray-500 mt-1 leading-snug">
                      {col.business_description}
                    </div>
                  )}
                </td>
                <td className="px-5 py-3 font-mono text-xs text-gray-600">{col.data_type}</td>
                <td className="px-5 py-3 text-xs">
                  <span className={(col.is_nullable === 'YES' || col.nullable === true) ? 'text-gray-400' : 'text-gray-700 font-medium'}>
                    {(col.is_nullable === 'YES' || col.nullable === true) ? 'nullable' : 'NOT NULL'}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {isPK && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                                       bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-100 uppercase tracking-tight">
                        <Key className="w-2.5 h-2.5" /> PK
                      </span>
                    )}
                    {isUnique && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                                       bg-purple-50 text-purple-700 text-[10px] font-bold border border-purple-100 uppercase tracking-tight">
                        Unique
                      </span>
                    )}
                    {isFK && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                                       bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-100 uppercase tracking-tight">
                        <Link2 className="w-2.5 h-2.5" /> FK
                        {refTable && (
                          <span className="text-blue-500 font-normal normal-case">→ {refTable}</span>
                        )}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-xs text-gray-400 font-mono">
                  {col.column_default ?? col.default ?? <span className="italic">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
