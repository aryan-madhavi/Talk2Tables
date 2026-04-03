// src/app/pages/AdminPanel/components/GrantAccessDialog.tsx
import React, { useState, useEffect } from 'react';
import { X, Search, Database, Calendar, FileText, Lock, Unlock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../../../lib/utils';
import { ConnectionOut } from '../../../../lib/connectionService';
import { PermissionType } from '../../../../lib/accessService';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GrantPayload {
  connection_id: string;
  permission:    PermissionType;
  expires_at:    string | null;
  note:          string | null;
}

interface Props {
  open:           boolean;
  onClose:        () => void;
  /** Called with one payload per selected DB */
  onGrant:        (payloads: GrantPayload[]) => void;
  allConnections: ConnectionOut[];
  /** connection_ids already actively granted — excluded from list */
  grantedIds:     string[];
  granting:       boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DB_TYPE_LABEL: Record<string, string> = {
  postgresql: 'PostgreSQL', mysql: 'MySQL',
  oracle: 'Oracle', mssql: 'MSSQL',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function GrantAccessDialog({
  open, onClose, onGrant, allConnections, grantedIds, granting,
}: Props) {
  const [search,     setSearch]     = useState('');
  const [selected,   setSelected]   = useState<string[]>([]);
  const [permission, setPermission] = useState<PermissionType>('read');
  const [expiresAt,  setExpiresAt]  = useState('');
  const [note,       setNote]       = useState('');

  // Reset on open
  useEffect(() => {
    if (open) {
      setSearch(''); setSelected([]); setPermission('read'); setExpiresAt(''); setNote('');
    }
  }, [open]);

  if (!open) return null;

  // Only active connections that are not yet granted
  const available = allConnections.filter(
    c => c.is_active && !grantedIds.includes(c.connection_id),
  );

  const filtered = available.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.host.toLowerCase().includes(search.toLowerCase()) ||
    (DB_TYPE_LABEL[c.db_type] ?? c.db_type).toLowerCase().includes(search.toLowerCase()),
  );

  const toggle    = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const selectAll = () => setSelected(filtered.map(c => c.connection_id));
  const clearAll  = () => setSelected([]);

  const handleSubmit = () => {
    if (selected.length === 0) { toast.error('Select at least one database.'); return; }
    onGrant(selected.map(connection_id => ({
      connection_id,
      permission,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      note:       note || null,
    })));
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-lg bg-white rounded-2xl shadow-2xl
                     border border-gray-100 animate-in fade-in zoom-in-95 duration-300 overflow-hidden"
          onClick={e => e.stopPropagation()}
        >

          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                <Database className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Grant Database Access</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Select one or more databases to grant
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={granting}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400
                         hover:bg-gray-100 transition-colors disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-5 max-h-[62vh] overflow-y-auto">

            {/* ── DB list ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Databases <span className="text-red-500">*</span>
                  {selected.length > 0 && (
                    <span className="ml-2 normal-case font-normal text-blue-600">
                      {selected.length} selected
                    </span>
                  )}
                </label>
                {filtered.length > 0 && (
                  <div className="flex gap-2">
                    <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">
                      Select all
                    </button>
                    {selected.length > 0 && (
                      <>
                        <span className="text-gray-300">|</span>
                        <button onClick={clearAll} className="text-xs text-gray-400 hover:underline">
                          Clear
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Search */}
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name, host or type…"
                  className="pl-8 pr-4 py-2 w-full border border-gray-200 rounded-lg text-sm
                             focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>

              {/* List */}
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                {available.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-400">
                    All active databases are already granted to this user.
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-400">
                    No databases matching "{search}"
                  </div>
                ) : (
                  filtered.map((c, idx) => {
                    const checked = selected.includes(c.connection_id);
                    return (
                      <button
                        key={c.connection_id}
                        onClick={() => toggle(c.connection_id)}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                          idx !== filtered.length - 1 && 'border-b border-gray-100',
                          checked
                            ? 'bg-blue-50 border-l-[3px] border-l-blue-500'
                            : 'hover:bg-gray-50',
                        )}
                      >
                        {/* Checkbox */}
                        <div className={cn(
                          'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all',
                          checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300',
                        )}>
                          {checked && (
                            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                              <path d="M1.5 5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.8"
                                    strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>

                        {/* DB icon */}
                        <div className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                          checked ? 'bg-blue-100' : 'bg-gray-100',
                        )}>
                          <Database className={cn('w-3.5 h-3.5', checked ? 'text-blue-600' : 'text-gray-400')} />
                        </div>

                        {/* Name + host */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-800 truncate">{c.name}</div>
                          <div className="text-xs text-gray-400 font-mono truncate">{c.host}</div>
                        </div>

                        {/* Type badge */}
                        <span className="text-xs font-medium text-gray-400 shrink-0 bg-gray-100 px-1.5 py-0.5 rounded">
                          {DB_TYPE_LABEL[c.db_type] ?? c.db_type}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* ── Permission ── */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Permission
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['read', 'write'] as PermissionType[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setPermission(p)}
                    className={cn(
                      'flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 transition-all text-left',
                      permission === p
                        ? p === 'read'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 bg-white hover:border-gray-300',
                    )}
                  >
                    {p === 'read'
                      ? <Lock   className={cn('w-4 h-4 shrink-0', permission === p ? 'text-blue-600'   : 'text-gray-400')} />
                      : <Unlock className={cn('w-4 h-4 shrink-0', permission === p ? 'text-orange-600' : 'text-gray-400')} />
                    }
                    <div>
                      <div className={cn(
                        'text-xs font-bold capitalize',
                        permission === p
                          ? p === 'read' ? 'text-blue-700' : 'text-orange-700'
                          : 'text-gray-700',
                      )}>
                        {p}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {p === 'read' ? 'SELECT only' : 'SELECT + write ops'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Expiry ── */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Expiry Date
                  <span className="font-normal normal-case text-gray-400 ml-1">
                    (optional — blank = no expiry)
                  </span>
                </span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={e => setExpiresAt(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
                {expiresAt && (
                  <button
                    onClick={() => setExpiresAt('')}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-400
                               border border-gray-200 hover:bg-red-50 hover:text-red-500
                               hover:border-red-200 transition-colors whitespace-nowrap"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* ── Note ── */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Note
                  <span className="font-normal normal-case text-gray-400 ml-1">(optional)</span>
                </span>
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. Temp access for Q4 analysis"
                rows={2}
                maxLength={500}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none
                           focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
              <p className="text-right text-xs text-gray-300 mt-0.5">{note.length}/500</p>
            </div>

          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-100">
            <span className="text-xs text-gray-400">
              {selected.length === 0
                ? 'No databases selected'
                : `${selected.length} DB${selected.length > 1 ? 's' : ''} → ${permission} access`}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                disabled={granting}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600
                           hover:bg-gray-200 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={granting || selected.length === 0}
                className={cn(
                  'px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all shadow-sm',
                  granting || selected.length === 0
                    ? 'bg-blue-300 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 active:scale-95',
                )}
              >
                {granting
                  ? <span className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Granting…
                    </span>
                  : 'Grant Access'
                }
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}