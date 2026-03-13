import React, { useState, useEffect } from 'react';
import { Database, ChevronDown } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { getMyConnections } from '../../../lib/accessService';
import { listConnections } from '../../../lib/connectionService';
import { getSchema, getTableDetail, SchemaTableMeta, TableDetailResponse } from '../../../lib/schemaService';
import { SchemaTableList }   from './components/SchemaTableList';
import { SchemaDetailPanel } from './components/SchemaDetailPanel';

interface ConnectionOption { connection_id: string; name: string }

export default function SchemaBrowser() {
  const { isAdmin, isDbManager } = useAuth();

  const [connections,     setConnections]     = useState<ConnectionOption[]>([]);
  const [selectedConnId,  setSelectedConnId]  = useState('');
  const [tables,          setTables]          = useState<SchemaTableMeta[]>([]);
  const [tablesLoading,   setTablesLoading]   = useState(false);
  const [selectedTable,   setSelectedTable]   = useState<SchemaTableMeta | null>(null);
  const [tableDetail,     setTableDetail]     = useState<TableDetailResponse | null>(null);
  const [detailLoading,   setDetailLoading]   = useState(false);
  const [searchTerm,      setSearchTerm]      = useState('');

  // Load accessible connections
  useEffect(() => {
    const load = isAdmin || isDbManager
      ? listConnections(true).then(res =>
          res.connections.map(c => ({ connection_id: c.connection_id, name: c.name }))
        )
      : getMyConnections().then(list =>
          list.map(c => ({ connection_id: c.connection_id, name: c.name }))
        );

    load.then(opts => {
      setConnections(opts);
      if (opts.length > 0) setSelectedConnId(opts[0].connection_id);
    }).catch(console.error);
  }, [isAdmin, isDbManager]);

  // Load tables when connection changes
  useEffect(() => {
    if (!selectedConnId) return;
    setTables([]);
    setSelectedTable(null);
    setTableDetail(null);
    setSearchTerm('');
    setTablesLoading(true);
    getSchema(selectedConnId)
      .then(res => setTables(res.tables))
      .catch(console.error)
      .finally(() => setTablesLoading(false));
  }, [selectedConnId]);

  // Load columns when table is selected
  const handleSelectTable = (t: SchemaTableMeta) => {
    setSelectedTable(t);
    setTableDetail(null);
    if (!t.schema) return; // cannot fetch columns without schema name
    setDetailLoading(true);
    getTableDetail(selectedConnId, t.schema, t.table)
      .then(setTableDetail)
      .catch(console.error)
      .finally(() => setDetailLoading(false));
  };

  const filteredTables = tables.filter(t =>
    t.table.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedConnName = connections.find(c => c.connection_id === selectedConnId)?.name ?? '';

  return (
    <div className="h-[calc(100vh-6rem)] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">

      {/* ── DB selector bar ── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/60 shrink-0">
        <Database className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="text-sm font-medium text-gray-500">Database:</span>
        <div className="relative">
          <select
            value={selectedConnId}
            onChange={e => setSelectedConnId(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm font-semibold text-gray-800
                       bg-white border border-gray-200 rounded-lg shadow-sm
                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer"
          >
            {connections.length === 0 && <option value="">No connections available</option>}
            {connections.map(c => (
              <option key={c.connection_id} value={c.connection_id}>{c.name}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        </div>
        {tables.length > 0 && (
          <span className="text-xs text-gray-400 ml-1">{tables.length} tables</span>
        )}
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex overflow-hidden">
        <SchemaTableList
          tables={filteredTables}
          selectedTable={selectedTable}
          searchTerm={searchTerm}
          loading={tablesLoading}
          connName={selectedConnName}
          onSearch={setSearchTerm}
          onSelect={handleSelectTable}
        />

        <SchemaDetailPanel
          table={selectedTable}
          detail={tableDetail}
          loading={detailLoading}
        />
      </div>

    </div>
  );
}
