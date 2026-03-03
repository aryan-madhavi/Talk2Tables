import React, { useState } from 'react';
import { tableSchemas } from '../../data/mockData';
import { TableSchema } from '../../types';
import { SchemaTableList }   from './components/SchemaTableList';
import { SchemaDetailPanel } from './components/SchemaDetailPanel';

export default function SchemaBrowser() {
  const [selectedTable, setSelectedTable] = useState<TableSchema>(tableSchemas[0]);
  const [searchTerm, setSearchTerm]       = useState('');

  const filteredTables = tableSchemas.filter(table =>
    table.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="h-[calc(100vh-6rem)] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col md:flex-row">

      <SchemaTableList
        tables={filteredTables}
        selectedTable={selectedTable}
        searchTerm={searchTerm}
        onSearch={setSearchTerm}
        onSelect={setSelectedTable}
      />

      <SchemaDetailPanel table={selectedTable} />

    </div>
  );
}