// src/app/pages/AdminPanel/components/UserAccessPanel.tsx
import React, { useState, useEffect } from 'react';
import { Database, Plus, Loader2, ShieldOff, ShieldCheck, Calendar, FileText, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../../../lib/utils';
import { UserOut } from '../../../../lib/userService';
import { ConnectionOut } from '../../../../lib/connectionService';
import {
  listGrantsByUser, createGrant, updateGrant, revokeGrant,
  AccessGrantOut, PermissionType,
} from '../../../../lib/accessService';
import { GrantAccessDialog, GrantPayload } from './GrantAccessDialog';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DB_TYPE_LABEL: Record<string, string> = {
  postgresql: 'PostgreSQL', mysql: 'MySQL',
  oracle: 'Oracle', mssql: 'MSSQL',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isExpired(expires_at: string | null): boolean {
  return !!expires_at && new Date(expires_at) < new Date();
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  user:           UserOut;
  allConnections: ConnectionOut[];
  currentUid:     string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function UserAccessPanel({ user, allConnections, currentUid }: Props) {
  const [grants,     setGrants]     = useState<AccessGrantOut[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [granting,   setGranting]   = useState(false);
  const [actionId,   setActionId]   = useState<string | null>(null);

  // Fetch this user's grants on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await listGrantsByUser(user.firebase_uid, false);
        setGrants(res.grants);
      } catch {
        toast.error('Failed to load DB access.');
      } finally {
        setLoading(false);
      }
    })();
  }, [user.firebase_uid]);

  const activeGrants = grants.filter(g => g.is_active);
  const grantedIds   = activeGrants.map(g => g.connection_id);

  const connName = (id: string) =>
    allConnections.find(c => c.connection_id === id)?.name ?? id;

  const connType = (id: string) => {
    const t = allConnections.find(c => c.connection_id === id)?.db_type ?? '';
    return DB_TYPE_LABEL[t] ?? t;
  };

  // ── Grant (multiple DBs) ──────────────────────────────────────────────────

  const handleGrant = async (payloads: GrantPayload[]) => {
    setGranting(true);
    const results = await Promise.allSettled(
      payloads.map(p => createGrant({ firebase_uid: user.firebase_uid, ...p })),
    );
    let ok = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        setGrants(prev => [r.value, ...prev]);
        ok++;
      } else {
        toast.error(`Failed: "${connName(payloads[i].connection_id)}"`);
      }
    });
    if (ok > 0) toast.success(`${ok} grant${ok > 1 ? 's' : ''} added.`);
    setGranting(false);
    setDialogOpen(false);
  };

  // ── Toggle permission ─────────────────────────────────────────────────────

  const handleTogglePerm = async (grant: AccessGrantOut) => {
    setActionId(grant.access_id);
    const newPerm: PermissionType = grant.permission === 'read' ? 'write' : 'read';
    try {
      const updated = await updateGrant(grant.access_id, { permission: newPerm });
      setGrants(prev => prev.map(g => g.access_id === updated.access_id ? updated : g));
      toast.success(`"${connName(grant.connection_id)}" → ${newPerm}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update permission.');
    } finally {
      setActionId(null);
    }
  };

  // ── Update expiry (on blur) ───────────────────────────────────────────────

  const handleExpiry = async (grant: AccessGrantOut, val: string) => {
    const newExpiry = val ? new Date(val).toISOString() : null;
    if (newExpiry === grant.expires_at) return; // no change
    setActionId(grant.access_id);
    try {
      const updated = await updateGrant(grant.access_id, { expires_at: newExpiry });
      setGrants(prev => prev.map(g => g.access_id === updated.access_id ? updated : g));
      toast.success('Expiry updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update expiry.');
    } finally {
      setActionId(null);
    }
  };

  // ── Revoke ────────────────────────────────────────────────────────────────

  const handleRevoke = async (grant: AccessGrantOut) => {
    if (!window.confirm(
      `Revoke "${connName(grant.connection_id)}" access?\nTakes effect immediately.`,
    )) return;
    setActionId(grant.access_id);
    try {
      const updated = await revokeGrant(grant.access_id);
      setGrants(prev => prev.map(g => g.access_id === updated.access_id ? updated : g));
      toast.success(`Access to "${connName(grant.connection_id)}" revoked.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke.');
    } finally {
      setActionId(null);
    }
  };

  const isSelf  = user.firebase_uid === currentUid;
  const isAdmin = user.role === 'admin';

  // ── Render ────────────────────────────────────────────────────────────────

  // Admins bypass per-connection grants — show informational message instead
  if (isAdmin) {
    return (
      <tr className="bg-blue-50/20">
        <td colSpan={6} className="px-6 pb-4 pt-0">
          <div className="rounded-xl border border-blue-100 bg-white px-5 py-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-800">Full Database Access</p>
                <p className="text-xs text-blue-500 mt-0.5">
                  Admins have unrestricted access to all active database connections. No per-database grants are needed.
                </p>
              </div>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-blue-50/20">
      <td colSpan={6} className="px-6 pb-4 pt-0">
        <div className="rounded-xl border border-blue-100 bg-white overflow-hidden shadow-sm">

          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-3 bg-blue-50/60 border-b border-blue-100">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-800">Database Access</span>
              {!loading && (
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold ml-1">
                  {activeGrants.length} active
                </span>
              )}
            </div>
            <button
              onClick={() => setDialogOpen(true)}
              disabled={isSelf}
              title={isSelf ? 'Cannot modify your own access' : 'Grant database access'}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm',
                isSelf
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700',
              )}
            >
              <Plus className="w-3.5 h-3.5" />
              {isSelf ? 'Your own account' : 'Grant Access'}
            </button>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-8 gap-2 text-blue-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading grants…</span>
            </div>
          )}

          {/* Empty */}
          {!loading && activeGrants.length === 0 && (
            <div className="text-center py-7">
              <Database className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400 font-medium">No database access granted</p>
              <p className="text-xs text-gray-300 mt-0.5">
                Click "Grant Access" to assign databases.
              </p>
            </div>
          )}

          {/* Grants table */}
          {!loading && activeGrants.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold text-gray-500 uppercase tracking-wide">Database</th>
                    <th className="px-5 py-2.5 font-semibold text-gray-500 uppercase tracking-wide">Permission</th>
                    <th className="px-5 py-2.5 font-semibold text-gray-500 uppercase tracking-wide">Expiry</th>
                    <th className="px-5 py-2.5 font-semibold text-gray-500 uppercase tracking-wide">Granted</th>
                    <th className="px-5 py-2.5 font-semibold text-gray-500 uppercase tracking-wide">Note</th>
                    <th className="px-5 py-2.5 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeGrants.map(grant => {
                    const expired = isExpired(grant.expires_at);
                    const busy    = actionId === grant.access_id;

                    return (
                      <tr
                        key={grant.access_id}
                        className={cn('hover:bg-gray-50 transition-colors', expired && 'opacity-60')}
                      >
                        {/* DB name + type */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
                              <Database className="w-3 h-3 text-blue-500" />
                            </div>
                            <div>
                              <div className="font-semibold text-gray-800">
                                {connName(grant.connection_id)}
                              </div>
                              <div className="text-gray-400">{connType(grant.connection_id)}</div>
                            </div>
                          </div>
                          {expired && (
                            <span className="inline-block mt-1 text-xs text-red-500 font-semibold">
                              ⚠ Expired
                            </span>
                          )}
                        </td>

                        {/* Permission toggle */}
                        <td className="px-5 py-3">
                          <button
                            onClick={() => !busy && !isSelf && handleTogglePerm(grant)}
                            disabled={busy || isSelf}
                            title={isSelf ? 'Cannot modify your own access' : 'Click to toggle read ↔ write'}
                            className={cn(
                              'flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold border transition-all',
                              grant.permission === 'write'
                                ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
                                : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100',
                              busy && 'opacity-50 cursor-not-allowed',
                            )}
                          >
                            {busy
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : grant.permission === 'write'
                                ? <ToggleRight className="w-3 h-3" />
                                : <ToggleLeft  className="w-3 h-3" />
                            }
                            {grant.permission}
                          </button>
                        </td>

                        {/* Expiry inline edit */}
                        <td className="px-5 py-3">
                          <input
                            type="datetime-local"
                            disabled={busy}
                            defaultValue={
                              grant.expires_at
                                ? new Date(grant.expires_at).toISOString().slice(0, 16)
                                : ''
                            }
                            onBlur={e => handleExpiry(grant, e.target.value)}
                            title="Set expiry (blank = no expiry)"
                            className={cn(
                              'border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-600',
                              'focus:ring-1 focus:ring-blue-400 outline-none w-40',
                              expired && 'border-red-200 text-red-500',
                              busy && 'opacity-40 cursor-not-allowed',
                            )}
                          />
                        </td>

                        {/* Granted date */}
                        <td className="px-5 py-3 text-gray-400 whitespace-nowrap">
                          {formatDate(grant.granted_at)}
                        </td>

                        {/* Note */}
                        <td className="px-5 py-3 max-w-[160px]">
                          <span
                            className="text-gray-400 truncate block"
                            title={grant.note ?? ''}
                          >
                            {grant.note
                              ? <span className="flex items-center gap-1"><FileText className="w-3 h-3 shrink-0" />{grant.note}</span>
                              : <span className="text-gray-200">—</span>
                            }
                          </span>
                        </td>

                        {/* Revoke */}
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => !busy && !isSelf && handleRevoke(grant)}
                            disabled={busy || isSelf}
                            title={isSelf ? 'Cannot revoke your own access' : 'Revoke access'}
                            className={cn(
                              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                              isSelf || busy
                                ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                                : 'border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300',
                            )}
                          >
                            {busy
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <ShieldOff className="w-3 h-3" />
                            }
                            Revoke
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>

        {/* Grant access dialog */}
        <GrantAccessDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onGrant={handleGrant}
          allConnections={allConnections}
          grantedIds={grantedIds}
          granting={granting}
        />
      </td>
    </tr>
  );
}