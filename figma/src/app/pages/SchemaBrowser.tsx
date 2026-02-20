import React, { useState } from 'react';
import { Search, Table, Key, Link2, Database, ArrowRight } from 'lucide-react';
import { tableSchemas, databases } from '../data/mockData';
import { cn } from '../../lib/utils';

export default function SchemaBrowser() {
  const [selectedTable, setSelectedTable] = useState(tableSchemas[0]);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTables = tableSchemas.filter(table => 
    table.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-[calc(100vh-6rem)] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col md:flex-row">
      {/* Left Sidebar: Tables List */}
      <div className="w-full md:w-64 border-r border-gray-100 flex flex-col bg-gray-50/50">
        <div className="p-4 border-b border-gray-100 bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search tables..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredTables.map((table) => (
            <button
              key={table.name}
              onClick={() => setSelectedTable(table)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group",
                selectedTable.name === table.name
                  ? "bg-blue-50 text-blue-700 shadow-sm"
                  : "text-gray-600 hover:bg-white hover:text-gray-900 hover:shadow-sm"
              )}
            >
              <Table className={cn(
                "w-4 h-4 transition-colors",
                selectedTable.name === table.name ? "text-blue-500" : "text-gray-400 group-hover:text-gray-500"
              )} />
              <span className="truncate">{table.name}</span>
              {selectedTable.name === table.name && <ArrowRight className="ml-auto w-3 h-3 opacity-50" />}
            </button>
          ))}
        </div>
        
        <div className="p-4 border-t border-gray-100 bg-white text-xs text-gray-500 flex items-center gap-2">
          <Database className="w-3 h-3" />
          <span>Connected to: <strong>Plant Instrumentation</strong></span>
        </div>
      </div>

      {/* Right Content: Table Details */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Table className="w-5 h-5 text-blue-600" />
              {selectedTable.name}
            </h2>
            <p className="text-sm text-gray-500 mt-1">Found {selectedTable.columns.length} columns</p>
          </div>
          <button className="px-4 py-2 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-100 transition-colors">
            Use in Query
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
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
                {selectedTable.columns.map((col) => (
                  <tr key={col.name} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-2">
                      {col.name}
                    </td>
                    <td className="px-6 py-4 text-gray-600 font-mono text-xs">
                      {col.type}
                    </td>
                    <td className="px-6 py-4">
                      {col.isKey && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-100">
                          <Key className="w-3 h-3" /> PK
                        </span>
                      )}
                      {col.isForeignKey && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100 ml-2">
                          <Link2 className="w-3 h-3" /> FK
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-400 italic">
                      No description available
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Relationships</h3>
            <div className="p-8 border border-gray-200 border-dashed rounded-xl bg-gray-50 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Link2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Relationship diagram visualization would appear here</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
