import React from 'react';
import { Table, Loader2 } from 'lucide-react';
import { SchemaTableMeta, TableDetailResponse } from '../../../../lib/schemaService';
import { SchemaColumnTable } from './SchemaColumnTable';

interface SchemaDetailPanelProps {
  table:   SchemaTableMeta | null;
  detail:  TableDetailResponse | null;
  loading: boolean;
}

export function SchemaDetailPanel({ table, detail, loading }: SchemaDetailPanelProps) {
  if (!table) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50/30">
        <div className="text-center text-gray-400">
          <Table className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a table to view its columns</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">

      {/* Header */}
      <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Table className="w-5 h-5 text-blue-600" />
            {table.table}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {table.schema && <>Schema: <span className="font-medium text-gray-700">{table.schema}</span> · </>}
            {detail && <><span className="font-medium">{detail.column_count}</span> columns</>}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading columns…</span>
          </div>
        )}

        {!loading && detail && <SchemaColumnTable columns={detail.columns} />}
      </div>

    </div>
  );
}
