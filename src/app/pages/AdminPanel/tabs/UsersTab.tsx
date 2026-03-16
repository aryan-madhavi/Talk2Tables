// src/app/pages/AdminPanel/tabs/UsersTab.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, UserPlus, MoreVertical, Loader2, AlertCircle,
  ShieldCheck, ShieldOff, Trash2, ChevronDown, RefreshCw,
  ChevronRight, LogOut, ScrollText, X, CheckCircle2, XCircle, Clock, Database,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '../../../../lib/utils';
import { useAuth } from '../../../../context/AuthContext';
import {
  listUsers, createUser, updateUser, updateUserRole,
  activateUser, deactivateUser, deleteUser,
  UserOut, UserRole,
} from '../../../../lib/userService';
import { forceLogoutUser } from '../../../../lib/authService';
import { getMyAudits, AuditLogEntry } from '../../../../lib/auditService';
import { listConnections, ConnectionOut } from '../../../../lib/connectionService';
import { AddUserDialog, AddUserForm } from '../components/AddUserDialog';
import { UserAccessPanel }            from '../components/UserAccessPanel';

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<UserRole, string> = {
  admin:      'bg-red-50 text-red-700 border-red-100',
  db_manager: 'bg-blue-50 text-blue-700 border-blue-100',
  power_user: 'bg-purple-50 text-purple-700 border-purple-100',
  analyst:    'bg-gray-50 text-gray-700 border-gray-100',
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin:      'Admin',
  db_manager: 'DB Manager',
  power_user: 'Power User',
  analyst:    'Analyst',
};

const ALL_ROLES: UserRole[] = ['analyst', 'power_user', 'db_manager', 'admin'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(user: UserOut): string {
  if (user.display_name)
    return user.display_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return user.email[0].toUpperCase();
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Role Dropdown ─────────────────────────────────────────────────────────────

function RoleDropdown({ user, currentUid, onChange, loading }: {
  user: UserOut; currentUid: string;
  onChange: (r: UserRole) => void; loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isSelf = user.firebase_uid === currentUid;

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !isSelf && !loading && setOpen(o => !o)}
        disabled={loading || isSelf}
        title={isSelf ? 'Cannot change your own role' : 'Change role'}
        className={cn(
          'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all',
          ROLE_STYLES[user.role as UserRole] ?? ROLE_STYLES.analyst,
          !isSelf && !loading && 'hover:opacity-80 cursor-pointer',
          (isSelf || loading) && 'cursor-not-allowed opacity-60',
        )}
      >
        {loading
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : ROLE_LABELS[user.role as UserRole] ?? user.role}
        {!isSelf && !loading && <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />}
      </button>

      {open && (
        <div className="absolute left-0 mt-1.5 w-40 bg-white rounded-xl shadow-xl border
                        border-gray-100 z-30 py-1 animate-in fade-in zoom-in-95 duration-150">
          {ALL_ROLES.map(role => (
            <button
              key={role}
              onClick={() => { setOpen(false); if (role !== user.role) onChange(role); }}
              className={cn(
                'w-full text-left px-3 py-2 text-xs font-medium transition-colors',
                role === user.role
                  ? `${ROLE_STYLES[role]} font-semibold cursor-default`
                  : 'text-gray-700 hover:bg-gray-50',
              )}
            >
              {ROLE_LABELS[role]}
              {role === user.role && <span className="ml-1 opacity-50">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Actions Dropdown ──────────────────────────────────────────────────────────

function ActionsMenu({ user, currentUid, onActivate, onDeactivate, onDelete, onForceLogout, onEdit, onViewLogs, loading }: {
  user: UserOut; currentUid: string;
  onActivate: () => void; onDeactivate: () => void;
  onDelete: () => void; onForceLogout: () => void;
  onEdit: () => void; onViewLogs: () => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isSelf = user.firebase_uid === currentUid;

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const item = (icon: React.ReactNode, label: string, onClick: () => void, className = '', disabled = false) => (
    <button
      onClick={() => { setOpen(false); onClick(); }}
      disabled={disabled}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
        className || 'text-gray-700 hover:bg-gray-50',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      {icon} {label}
      {disabled && <span className="ml-auto text-xs text-gray-400">self</span>}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={loading}
        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400
                   hover:text-gray-600 transition-colors disabled:opacity-40"
      >
        {loading
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <MoreVertical className="w-4 h-4" />}
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-xl shadow-xl border
                        border-gray-100 z-30 py-1 animate-in fade-in zoom-in-95 duration-150">
          {item(<ScrollText className="w-4 h-4" />, 'View Logs', onViewLogs, 'text-gray-700 hover:bg-gray-50')}
          <div className="h-px bg-gray-100 my-1" />
          {user.is_active
            ? item(<ShieldOff className="w-4 h-4" />, 'Deactivate', onDeactivate, 'text-orange-600 hover:bg-orange-50', isSelf)
            : item(<ShieldCheck className="w-4 h-4" />, 'Activate', onActivate, 'text-green-600 hover:bg-green-50')
          }
          {item(<LogOut className="w-4 h-4" />, 'Force Logout', onForceLogout, 'text-amber-600 hover:bg-amber-50', isSelf)}
          <div className="h-px bg-gray-100 my-1" />
          {item(<Trash2 className="w-4 h-4" />, 'Delete User', onDelete, 'text-red-600 hover:bg-red-50', isSelf)}
        </div>
      )}
    </div>
  );
}

// ── Edit Name Modal ────────────────────────────────────────────────────────────

function EditNameModal({ user, onClose, onSave }: {
  user: UserOut; onClose: () => void; onSave: (name: string) => Promise<void>;
}) {
  const [name,    setName]    = useState(user.display_name ?? '');
  const [saving,  setSaving]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(name); onClose(); }
    catch { /* toast shown by caller */ }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">Edit Display Name</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4 font-mono">{user.email}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Display name"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm
                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white
                         font-medium disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── User Audit Drawer ─────────────────────────────────────────────────────────

function UserAuditDrawer({ user, onClose }: { user: UserOut; onClose: () => void }) {
  const [logs,    setLogs]    = useState<AuditLogEntry[]>([]);
  const [total,   setTotal]   = useState(0);
  const [offset,  setOffset]  = useState(0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const PAGE = 50;

  const fetchLogs = useCallback((off: number, append = false) => {
    setLoading(true);
    setError(null);
    getMyAudits({ uid: user.firebase_uid, limit: PAGE, offset: off })
      .then(res => {
        setTotal(res.total);
        setLogs(prev => append ? [...prev, ...(res.audits ?? [])] : (res.audits ?? []));
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load logs'))
      .finally(() => setLoading(false));
  }, [user.firebase_uid]);

  useEffect(() => { fetchLogs(0); }, [fetchLogs]);

  const handleLoadMore = () => {
    const next = offset + PAGE;
    setOffset(next);
    fetchLogs(next, true);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col
                      animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">Audit Logs</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {user.display_name ?? user.email}
              {!loading && <span className="ml-2 text-gray-300">· {total} records</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && logs.length === 0 && (
            <div className="space-y-2">
              {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />)}
            </div>
          )}

          {/* Empty */}
          {!loading && !error && logs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <ScrollText className="w-8 h-8 text-gray-200" />
              <p className="text-sm text-gray-400">No audit logs for this user</p>
            </div>
          )}

          {/* Log entries */}
          {logs.map((log, i) => {
            const isSuccess = log.status === 'success' || log.status === 'results';
            return (
              <div key={log.audit_id ?? i} className="bg-white border border-gray-100 rounded-xl p-3">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0',
                    isSuccess ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500',
                  )}>
                    {isSuccess
                      ? <CheckCircle2 className="w-3.5 h-3.5" />
                      : <XCircle      className="w-3.5 h-3.5" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                        isSuccess ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500',
                      )}>
                        {log.status}
                      </span>
                      {log.connection_name && (
                        <span className="flex items-center gap-1 text-[10px] text-gray-400">
                          <Database className="w-2.5 h-2.5" /> {log.connection_name}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[10px] text-gray-400 ml-auto">
                        <Clock className="w-2.5 h-2.5" />
                        {format(new Date(log.created_at), 'MMM d · h:mm a')}
                      </span>
                    </div>
                    <code className="text-[11px] font-mono text-gray-600 block whitespace-pre-wrap
                                     break-words bg-gray-50 px-2 py-1.5 rounded border border-gray-100 mb-1.5">
                      {log.sql_query}
                    </code>
                    <div className="flex gap-3 text-[10px] text-gray-400">
                      {log.row_count != null && <span>{log.row_count} rows</span>}
                      {log.execution_time_ms != null && <span>{log.execution_time_ms.toFixed(0)} ms</span>}
                      {!isSuccess && log.error_message && (
                        <span className="text-red-400 truncate">{log.error_message}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Load more */}
          {logs.length > 0 && logs.length < total && (
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className="w-full py-2 text-sm text-gray-500 border border-gray-200 rounded-lg
                         hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>
                : `Load more (${total - logs.length} remaining)`
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function UsersTab() {
  const { user: currentUser } = useAuth();

  const [users,          setUsers]          = useState<UserOut[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [fetchError,     setFetchError]     = useState<string | null>(null);
  const [search,         setSearch]         = useState('');
  const [roleFilter,     setRoleFilter]     = useState<UserRole | ''>('');
  const [expandedUid,    setExpandedUid]    = useState<string | null>(null);
  const [allConnections, setAllConnections] = useState<ConnectionOut[]>([]);

  const [roleLoadingUid,   setRoleLoadingUid]   = useState<string | null>(null);
  const [actionLoadingUid, setActionLoadingUid] = useState<string | null>(null);
  const [dialogOpen,       setDialogOpen]       = useState(false);
  const [saving,           setSaving]           = useState(false);

  const [editingUser,   setEditingUser]   = useState<UserOut | null>(null);
  const [auditUser,     setAuditUser]     = useState<UserOut | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [usersRes, connsRes] = await Promise.all([
        listUsers(),
        listConnections(true),
      ]);
      setUsers(usersRes.users);
      setAllConnections(connsRes.connections);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load data.';
      setFetchError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.email.toLowerCase().includes(q) ||
      (u.display_name ?? '').toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
    const matchRole = !roleFilter || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreateUser = async (data: AddUserForm) => {
    setSaving(true);
    try {
      const created = await createUser({
        email: data.email, password: data.password,
        display_name: data.display_name || undefined, role: data.role,
      });
      setUsers(prev => [created, ...prev]);
      toast.success(`User "${created.display_name ?? created.email}" created.`);
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditName = async (user: UserOut, name: string) => {
    try {
      const updated = await updateUser(user.firebase_uid, { display_name: name });
      setUsers(prev => prev.map(u => u.firebase_uid === updated.firebase_uid ? updated : u));
      toast.success('Display name updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update name.');
      throw err;
    }
  };

  const handleRoleChange = async (user: UserOut, newRole: UserRole) => {
    setRoleLoadingUid(user.firebase_uid);
    try {
      const updated = await updateUserRole(user.firebase_uid, newRole);
      setUsers(prev => prev.map(u => u.firebase_uid === updated.firebase_uid ? updated : u));
      toast.success(`${updated.display_name ?? updated.email} → ${ROLE_LABELS[newRole]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update role.');
    } finally {
      setRoleLoadingUid(null);
    }
  };

  const handleActivate = async (user: UserOut) => {
    setActionLoadingUid(user.firebase_uid);
    try {
      const updated = await activateUser(user.firebase_uid);
      setUsers(prev => prev.map(u => u.firebase_uid === updated.firebase_uid ? updated : u));
      toast.success(`${updated.display_name ?? updated.email} activated.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to activate.');
    } finally { setActionLoadingUid(null); }
  };

  const handleDeactivate = async (user: UserOut) => {
    setActionLoadingUid(user.firebase_uid);
    try {
      const updated = await deactivateUser(user.firebase_uid);
      setUsers(prev => prev.map(u => u.firebase_uid === updated.firebase_uid ? updated : u));
      toast.success(`${updated.display_name ?? updated.email} deactivated.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to deactivate.');
    } finally { setActionLoadingUid(null); }
  };

  const handleForceLogout = async (user: UserOut) => {
    setActionLoadingUid(user.firebase_uid);
    try {
      await forceLogoutUser(user.firebase_uid);
      toast.success(`${user.display_name ?? user.email} force-logged out.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to force logout.');
    } finally { setActionLoadingUid(null); }
  };

  const handleDelete = async (user: UserOut) => {
    if (!window.confirm(
      `Permanently delete "${user.display_name ?? user.email}"?\nThis cannot be undone.`,
    )) return;
    setActionLoadingUid(user.firebase_uid);
    try {
      await deleteUser(user.firebase_uid);
      setUsers(prev => prev.filter(u => u.firebase_uid !== user.firebase_uid));
      if (expandedUid === user.firebase_uid) setExpandedUid(null);
      toast.success('User deleted.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete.');
    } finally { setActionLoadingUid(null); }
  };

  const toggleExpand = (uid: string) =>
    setExpandedUid(prev => prev === uid ? null : uid);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 animate-in fade-in">

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email or role…"
              className="pl-9 pr-4 py-2 w-full border border-gray-200 rounded-lg text-sm
                         focus:ring-2 focus:ring-blue-500 transition-all outline-none"
            />
          </div>

          {/* Role filter */}
          <div className="relative">
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value as UserRole | '')}
              className="pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white
                         focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
            >
              <option value="">All roles</option>
              {ALL_ROLES.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>

          <button onClick={fetchAll} disabled={loading} title="Refresh"
            className="p-2 rounded-lg border border-gray-200 text-gray-500
                       hover:bg-gray-50 transition-colors disabled:opacity-40">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>

        <button
          onClick={() => setDialogOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg
                     text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
        >
          <UserPlus className="w-4 h-4" /> Add User
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-4 px-6 py-4 rounded-xl
                                    border border-gray-100 bg-white animate-pulse">
              <div className="w-4 h-4 rounded bg-gray-100 shrink-0" />
              <div className="w-9 h-9 rounded-full bg-gray-100 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-36 rounded bg-gray-100" />
                <div className="h-3 w-48 rounded bg-gray-100" />
              </div>
              <div className="w-20 h-5 rounded-full bg-gray-100" />
              <div className="w-14 h-4 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && fetchError && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <p className="text-sm font-medium text-gray-700">Failed to load users</p>
          <p className="text-xs text-gray-400">{fetchError}</p>
          <button onClick={fetchAll}
            className="mt-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200
                       bg-white hover:bg-gray-50 text-gray-700 transition-colors">
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && !fetchError && (
        filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            {search || roleFilter
              ? 'No users match your filters.'
              : 'No users found.'}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-100">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="w-10 pl-4 rounded-tl-xl" />
                  <th className="px-6 py-3 font-medium">User</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Last Login</th>
                  <th className="px-6 py-3 font-medium w-12 rounded-tr-xl" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(user => (
                  <React.Fragment key={user.firebase_uid}>
                    <tr className={cn(
                      'transition-colors',
                      expandedUid === user.firebase_uid
                        ? 'bg-blue-50/40 border-l-2 border-l-blue-400'
                        : 'hover:bg-gray-50',
                      !user.is_active && 'opacity-50',
                    )}>

                      {/* Expand chevron */}
                      <td className="pl-3 pr-1 py-4">
                        <button
                          onClick={() => toggleExpand(user.firebase_uid)}
                          title="View database access"
                          className="p-1 rounded-lg hover:bg-blue-100 text-gray-400
                                     hover:text-blue-600 transition-all"
                        >
                          <ChevronRight className={cn(
                            'w-4 h-4 transition-transform duration-200',
                            expandedUid === user.firebase_uid && 'rotate-90 text-blue-500',
                          )} />
                        </button>
                      </td>

                      {/* Avatar + Name + Email */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center
                                          justify-center text-blue-700 font-bold text-xs shrink-0">
                            {getInitials(user)}
                          </div>
                          <div>
                            <button
                              onClick={() => setEditingUser(user)}
                              className="font-bold text-gray-900 hover:text-blue-600 transition-colors text-left"
                              title="Edit display name"
                            >
                              {user.display_name ?? '—'}
                            </button>
                            <div className="text-xs text-gray-500">{user.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-6 py-4">
                        <RoleDropdown
                          user={user}
                          currentUid={currentUser?.firebase_uid ?? ''}
                          onChange={role => handleRoleChange(user, role)}
                          loading={roleLoadingUid === user.firebase_uid}
                        />
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <span className={cn(
                          'flex items-center gap-1.5 text-xs font-medium w-fit',
                          user.is_active ? 'text-green-600' : 'text-gray-400',
                        )}>
                          <span className={cn(
                            'w-1.5 h-1.5 rounded-full',
                            user.is_active ? 'bg-green-500 animate-pulse' : 'bg-gray-300',
                          )} />
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Last login */}
                      <td className="px-6 py-4 text-xs text-gray-500">
                        {formatDate(user.last_login_at)}
                      </td>

                      {/* ⋮ Actions */}
                      <td className="px-6 py-4 text-right">
                        <ActionsMenu
                          user={user}
                          currentUid={currentUser?.firebase_uid ?? ''}
                          onActivate={() => handleActivate(user)}
                          onDeactivate={() => handleDeactivate(user)}
                          onDelete={() => handleDelete(user)}
                          onForceLogout={() => handleForceLogout(user)}
                          onEdit={() => setEditingUser(user)}
                          onViewLogs={() => setAuditUser(user)}
                          loading={actionLoadingUid === user.firebase_uid}
                        />
                      </td>
                    </tr>

                    {/* Expandable access panel */}
                    {expandedUid === user.firebase_uid && (
                      <UserAccessPanel
                        user={user}
                        allConnections={allConnections}
                        currentUid={currentUser?.firebase_uid ?? ''}
                      />
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-xs
                            text-gray-400 flex justify-between items-center">
              <span>
                {filtered.length} of {users.length} user{users.length !== 1 ? 's' : ''}
                {(search || roleFilter) && ' matching filters'}
              </span>
              <span>{users.filter(u => u.is_active).length} active</span>
            </div>
          </div>
        )
      )}

      {/* Dialogs / Drawers */}
      <AddUserDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleCreateUser}
        saving={saving}
      />

      {editingUser && (
        <EditNameModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={name => handleEditName(editingUser, name)}
        />
      )}

      {auditUser && (
        <UserAuditDrawer
          user={auditUser}
          onClose={() => setAuditUser(null)}
        />
      )}
    </div>
  );
}
