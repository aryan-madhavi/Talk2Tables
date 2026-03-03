import React from 'react';
import { Table } from 'lucide-react';
import { TableSchema } from '../types';
import { SchemaColumnTable }   from './SchemaColumnTable';
import { SchemaRelationships } from './SchemaRelationships';

interface SchemaDetailPanelProps {
  table: TableSchema;
}

export function SchemaDetailPanel({ table }: SchemaDetailPanelProps) {
  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">

      {/* Header */}
      <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Table className="w-5 h-5 text-blue-600" />
            {table.name}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Found {table.columns.length} columns
          </p>
        </div>
        <button className="px-4 py-2 bg-blue-50 text-blue-700 text-sm font-medium
                           rounded-lg hover:bg-blue-100 transition-colors">
          Use in Query
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6">
        <SchemaColumnTable   table={table} />
        <SchemaRelationships />
      </div>

    </div>
  );
}