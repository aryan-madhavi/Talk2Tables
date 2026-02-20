import React, { useState } from 'react';
import { Database, Plus, Settings2 } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { databases } from '../../../data/mockData';
import { DatabaseConnection } from '../../../types';
import { ConnectionForm, dbConnectionToForm } from '../types';
import { AddConnectionDialog } from '../components/AddConnectionDialog';

export function DatabasesTab() {
  // ── Dialog state ─────────────────────────────────────────────────────────────

  const [dialogOpen, setDialogOpen]         = useState(false);
  const [configureDb, setConfigureDb]       = useState<DatabaseConnection | null>(null);

  // Derived: when configureDb is set, convert it to a pre-filled ConnectionForm
  const initialData = configureDb ? dbConnectionToForm(configureDb) : undefined;

  const openAddDialog = () => {
    setConfigureDb(null);       // clear any previous configure target
    setDialogOpen(true);
  };

  const openConfigureDialog = (db: DatabaseConnection) => {
    setConfigureDb(db);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setConfigureDb(null);
  };

  const handleSave = (data: ConnectionForm) => {
    if (configureDb) {
      // TODO: call update API with configureDb.id + data
      console.log('Update connection:', configureDb.id, data);
    } else {
      // TODO: call create API with data
      console.log('New connection:', data);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 animate-in fade-in">

      {/* Toolbar */}
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-gray-900">Database Connections</h3>
        <button
          onClick={openAddDialog}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg
                     text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Connection
        </button>
      </div>

      {/* Connection Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {databases.map(db => (
          <div
            key={db.id}
            className="p-6 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md
                       transition-all group bg-white"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-blue-50 text-blue-700 rounded-lg group-hover:bg-blue-100 transition-colors">
                <Database className="w-6 h-6" />
              </div>
              <span className={cn(
                'px-2 py-1 text-xs font-bold rounded-full border uppercase tracking-wide',
                db.status === 'active'
                  ? 'bg-green-50 text-green-700 border-green-100'
                  : 'bg-gray-50 text-gray-600 border-gray-100',
              )}>
                {db.status}
              </span>
            </div>

            <h4 className="font-bold text-gray-900 text-lg mb-1">{db.name}</h4>
            <p className="text-sm text-gray-500 mb-4 font-mono">{db.host}</p>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <span className="text-xs text-gray-400 font-medium">{db.type}</span>
              <button
                onClick={() => openConfigureDialog(db)}
                className="flex items-center gap-1.5 text-sm font-medium text-blue-700
                           hover:text-blue-900 transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Configure
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Configure Dialog — same component, different mode */}
      <AddConnectionDialog
        open={dialogOpen}
        onClose={handleClose}
        onSave={handleSave}
        initialData={initialData}
      />
    </div>
  );
}