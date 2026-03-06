// src/app/pages/AdminPanel/tabs/DatabasesTab.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Database, Plus, Settings2, Power, PowerOff, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../../../lib/utils';
import { DatabaseConnection } from '../../../types';
import { ConnectionForm, dbConnectionToForm } from '../types';
import { AddConnectionDialog } from '../components/AddConnectionDialog';
import {
  listConnections,
  createConnection,
  updateConnection,
  activateConnection,
  deactivateConnection,
  ConnectionOut,
} from '../../../../lib/connectionService';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map backend db_type (lowercase) → display label */
const DB_TYPE_LABEL: Record<string, string> = {
  postgresql: 'PostgreSQL',
  mysql:      'MySQL',
  oracle:     'Oracle',
  mssql:      'MSSQL',
  sqlite:     'SQLite',
};

/** Map frontend form DbType → backend db_type string */
const FORM_TYPE_TO_BACKEND: Record<string, string> = {
  PostgreSQL: 'postgresql',
  MySQL:      'mysql',
  Oracle:     'oracle',
  SQLite:     'sqlite',
};

/** Convert backend ConnectionOut → UI DatabaseConnection */
function toUiConnection(c: ConnectionOut): DatabaseConnection {
  return {
    ...c,
    id:     c.connection_id,
    type:   DB_TYPE_LABEL[c.db_type] ?? c.db_type,
    status: c.is_active ? 'active' : 'inactive',
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DatabasesTab() {
  const [connections, setConnections] = useState<DatabaseConnection[]>([]);
  const [loading, setLoading]         = useState(true);
  const [fetchError, setFetchError]   = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [configureDb, setConfigureDb] = useState<DatabaseConnection | null>(null);
  const [saving, setSaving]           = useState(false);

  // Per-card toggling (activate/deactivate)
  const [togglingId, setTogglingId]   = useState<string | null>(null);

  // ── Fetch connections on mount ─────────────────────────────────────────────

  const fetchConnections = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await listConnections();
      setConnections(res.connections.map(toUiConnection));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load connections.';
      setFetchError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConnections(); }, [fetchConnections]);

  // ── Dialog helpers ─────────────────────────────────────────────────────────

  const openAddDialog = () => {
    setConfigureDb(null);
    setDialogOpen(true);
  };

  const openConfigureDialog = (db: DatabaseConnection) => {
    // Close first → React unmounts the dialog → clears all internal state
    // Then immediately reopen with the new target → mounts fresh with correct data
    setDialogOpen(false);
    setConfigureDb(db);
    setTimeout(() => setDialogOpen(true), 0);
  };

  const initialData = configureDb ? dbConnectionToForm(configureDb) : undefined;

  const handleClose = () => {
    setDialogOpen(false);
    setConfigureDb(null);
  };

  // ── Save handler (create or update) ───────────────────────────────────────

  const handleSave = async (data: ConnectionForm) => {
    setSaving(true);
    try {
      if (configureDb) {
        // ── UPDATE existing connection ──
        const payload: Parameters<typeof updateConnection>[1] = {
          name:          data.name   || undefined,
          host:          data.host   || undefined,
          port:          data.port   ? Number(data.port)   : undefined,
          database_name: data.database || undefined,
          username:      data.username || undefined,
          ssl_enabled:   data.ssl,
          description:   undefined,
        };
        // Only send password if user typed a new one
        if (data.password) {
          (payload as Record<string, unknown>).password = data.password;
        }

        const updated = await updateConnection(configureDb.connection_id, payload);
        const updatedUi = toUiConnection(updated);

        // Update in local state
        setConnections(prev =>
          prev.map(c => c.connection_id === updated.connection_id ? updatedUi : c),
        );
        toast.success(`"${updated.name}" updated successfully.`);

      } else {
        // ── CREATE new connection ──
        const created = await createConnection({
          name:          data.name,
          db_type:       FORM_TYPE_TO_BACKEND[data.type] ?? data.type.toLowerCase(),
          host:          data.host,
          port:          Number(data.port),
          database_name: data.database,
          username:      data.username,
          password:      data.password,
          ssl_enabled:   data.ssl,
        });
        const newUi = toUiConnection(created);

        // Prepend to local state (newest first)
        setConnections(prev => [newUi, ...prev]);
        toast.success(`"${created.name}" added successfully.`);
      }

      handleClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save connection.';
      toast.error(msg);
      // Keep dialog open so user can fix and retry
    } finally {
      setSaving(false);
    }
  };

  // ── Activate / Deactivate toggle ───────────────────────────────────────────

  const handleToggleActive = async (db: DatabaseConnection) => {
    setTogglingId(db.connection_id);
    try {
      const updated = db.is_active
        ? await deactivateConnection(db.connection_id)
        : await activateConnection(db.connection_id);

      const updatedUi = toUiConnection(updated);
      setConnections(prev =>
        prev.map(c => c.connection_id === updated.connection_id ? updatedUi : c),
      );
      toast.success(
        updated.is_active
          ? `"${updated.name}" activated.`
          : `"${updated.name}" deactivated.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update connection status.';
      toast.error(msg);
    } finally {
      setTogglingId(null);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────



  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 animate-in fade-in">

      {/* Toolbar */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Database Connections</h3>
          {!loading && !fetchError && (
            <p className="text-xs text-gray-400 mt-0.5">
              {connections.length} connection{connections.length !== 1 ? 's' : ''} registered
            </p>
          )}
        </div>
        <button
          onClick={openAddDialog}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg
                     text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Connection
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid md:grid-cols-2 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-6 rounded-xl border border-gray-100 bg-white animate-pulse">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-lg bg-gray-100" />
                <div className="w-16 h-5 rounded-full bg-gray-100" />
              </div>
              <div className="h-5 w-40 rounded bg-gray-100 mb-2" />
              <div className="h-3 w-28 rounded bg-gray-100 mb-4" />
              <div className="h-px bg-gray-100 mb-4" />
              <div className="flex justify-between">
                <div className="h-3 w-16 rounded bg-gray-100" />
                <div className="h-3 w-20 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && fetchError && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <p className="text-sm font-medium text-gray-700">Failed to load connections</p>
          <p className="text-xs text-gray-400">{fetchError}</p>
          <button
            onClick={fetchConnections}
            className="mt-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200
                       bg-white hover:bg-gray-50 text-gray-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !fetchError && connections.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
            <Database className="w-7 h-7 text-blue-400" />
          </div>
          <p className="text-sm font-medium text-gray-700">No connections yet</p>
          <p className="text-xs text-gray-400">Add your first database connection to get started.</p>
          <button
            onClick={openAddDialog}
            className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg
                       text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Connection
          </button>
        </div>
      )}

      {/* Connection cards */}
      {!loading && !fetchError && connections.length > 0 && (
        <div className="grid md:grid-cols-2 gap-6">
          {connections.map(db => (
            <div
              key={db.connection_id}
              className={cn(
                'p-6 rounded-xl border hover:shadow-md transition-all group bg-white',
                db.is_active
                  ? 'border-gray-200 hover:border-blue-300'
                  : 'border-gray-100 opacity-70',
              )}
            >
              {/* Card header */}
              <div className="flex items-start justify-between mb-4">
                <div className={cn(
                  'p-3 rounded-lg transition-colors',
                  db.is_active
                    ? 'bg-blue-50 text-blue-700 group-hover:bg-blue-100'
                    : 'bg-gray-100 text-gray-400',
                )}>
                  <Database className="w-6 h-6" />
                </div>
                <span className={cn(
                  'px-2 py-1 text-xs font-bold rounded-full border uppercase tracking-wide',
                  db.is_active
                    ? 'bg-green-50 text-green-700 border-green-100'
                    : 'bg-gray-50 text-gray-500 border-gray-100',
                )}>
                  {db.status}
                </span>
              </div>

              {/* Card body */}
              <h4 className="font-bold text-gray-900 text-lg mb-1 truncate">{db.name}</h4>
              <p className="text-sm text-gray-500 mb-1 font-mono truncate">{db.host}</p>
              {db.description && (
                <p className="text-xs text-gray-400 mb-1 truncate">{db.description}</p>
              )}
              <p className="text-xs text-gray-300 mb-4">
                DB: <span className="text-gray-400 font-medium">{db.database_name}</span>
              </p>

              {/* Card footer */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <span className="text-xs text-gray-400 font-medium">{db.type}</span>

                <div className="flex items-center gap-2">
                  {/* Activate / Deactivate */}
                  <button
                    onClick={() => handleToggleActive(db)}
                    disabled={togglingId === db.connection_id}
                    title={db.is_active ? 'Deactivate' : 'Activate'}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-all',
                      db.is_active
                        ? 'border-orange-200 text-orange-600 hover:bg-orange-50'
                        : 'border-green-200 text-green-600 hover:bg-green-50',
                      togglingId === db.connection_id && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    {togglingId === db.connection_id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : db.is_active
                        ? <PowerOff className="w-3 h-3" />
                        : <Power    className="w-3 h-3" />
                    }
                    {db.is_active ? 'Disable' : 'Enable'}
                  </button>

                  {/* Configure */}
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
            </div>
          ))}
        </div>
      )}

      {/* Add / Configure dialog */}
      <AddConnectionDialog
        key={configureDb?.connection_id ?? 'new'}
        open={dialogOpen}
        onClose={handleClose}
        onSave={handleSave}
        initialData={initialData}
        saving={saving}
      />
    </div>
  );
}