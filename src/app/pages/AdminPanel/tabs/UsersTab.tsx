// src/app/pages/AdminPanel/tabs/UsersTab.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, UserPlus, MoreVertical, Loader2, AlertCircle,
  ShieldCheck, ShieldOff, Trash2, ChevronDown, RefreshCw, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../../../lib/utils';
import { useAuth } from '../../../../context/AuthContext';
import {
  listUsers, createUser, updateUserRole,
  activateUser, deactivateUser, deleteUser,
  UserOut, UserRole,
} from '../../../../lib/userService';
import { listConnections, ConnectionOut } from '../../../../lib/connectionService';
import { AddUserDialog, AddUserForm } from '../components/AddUserDialog';
import { UserAccessPanel }            from '../components/UserAccessPanel';

// ── Role config ───────────────────────────────────────────────────────────────

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
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
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

// ── Actions Dropdown (⋮) ──────────────────────────────────────────────────────

function ActionsMenu({ user, currentUid, onActivate, onDeactivate, onDelete, loading }: {
  user: UserOut; currentUid: string;
  onActivate: () => void; onDeactivate: () => void;
  onDelete: () => void; loading: boolean;
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
        <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl shadow-xl border
                        border-gray-100 z-30 py-1 animate-in fade-in zoom-in-95 duration-150">
          {user.is_active ? (
            <button
              onClick={() => { setOpen(false); onDeactivate(); }}
              disabled={isSelf}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-orange-600
                         hover:bg-orange-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ShieldOff className="w-4 h-4" /> Deactivate
              {isSelf && <span className="ml-auto text-xs text-gray-400">self</span>}
            </button>
          ) : (
            <button
              onClick={() => { setOpen(false); onActivate(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-green-600
                         hover:bg-green-50 transition-colors"
            >
              <ShieldCheck className="w-4 h-4" /> Activate
            </button>
          )}
          <div className="h-px bg-gray-100 my-1" />
          <button
            onClick={() => { setOpen(false); onDelete(); }}
            disabled={isSelf}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600
                       hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" /> Delete User
            {isSelf && <span className="ml-auto text-xs text-gray-400">self</span>}
          </button>
        </div>
      )}
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
  const [expandedUid,    setExpandedUid]    = useState<string | null>(null);
  const [allConnections, setAllConnections] = useState<ConnectionOut[]>([]);

  const [roleLoadingUid,   setRoleLoadingUid]   = useState<string | null>(null);
  const [actionLoadingUid, setActionLoadingUid] = useState<string | null>(null);
  const [dialogOpen,       setDialogOpen]       = useState(false);
  const [saving,           setSaving]           = useState(false);

  // ── Fetch users + connections in parallel ─────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [usersRes, connsRes] = await Promise.all([
        listUsers(),
        listConnections(true),  // active only — for grant dialog
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

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      (u.display_name ?? '').toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleCreateUser = async (data: AddUserForm) => {
    setSaving(true);
    try {
      const created = await createUser({
        email:        data.email,
        password:     data.password,
        display_name: data.display_name || undefined,
        role:         data.role,
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
    } finally {
      setActionLoadingUid(null);
    }
  };

  const handleDeactivate = async (user: UserOut) => {
    setActionLoadingUid(user.firebase_uid);
    try {
      const updated = await deactivateUser(user.firebase_uid);
      setUsers(prev => prev.map(u => u.firebase_uid === updated.firebase_uid ? updated : u));
      toast.success(`${updated.display_name ?? updated.email} deactivated.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to deactivate.');
    } finally {
      setActionLoadingUid(null);
    }
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
    } finally {
      setActionLoadingUid(null);
    }
  };

  const toggleExpand = (uid: string) =>
    setExpandedUid(prev => prev === uid ? null : uid);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 animate-in fade-in">

      {/* Toolbar */}
      <div className="flex justify-between items-center mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email or role…"
              className="pl-9 pr-4 py-2 w-full border border-gray-200 rounded-lg text-sm
                         focus:ring-2 focus:ring-blue-500 transition-all outline-none"
            />
          </div>
          <button
            onClick={fetchAll}
            disabled={loading}
            title="Refresh"
            className="p-2 rounded-lg border border-gray-200 text-gray-500
                       hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
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
          <button
            onClick={fetchAll}
            className="mt-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200
                       bg-white hover:bg-gray-50 text-gray-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && !fetchError && (
        filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            {search ? `No users matching "${search}"` : 'No users found.'}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="w-10 pl-4" />
                  <th className="px-6 py-3 font-medium">User</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Last Login</th>
                  <th className="px-6 py-3 font-medium w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(user => (
                  <React.Fragment key={user.firebase_uid}>

                    {/* ── User row ── */}
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
                            <div className="font-bold text-gray-900">{user.display_name ?? '—'}</div>
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
                          loading={actionLoadingUid === user.firebase_uid}
                        />
                      </td>
                    </tr>

                    {/* ── Expandable access panel (separate component) ── */}
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

            {/* Table footer */}
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-xs
                            text-gray-400 flex justify-between items-center">
              <span>
                {filtered.length} of {users.length} user{users.length !== 1 ? 's' : ''}
                {search && ` matching "${search}"`}
              </span>
              <span>{users.filter(u => u.is_active).length} active</span>
            </div>
          </div>
        )
      )}

      {/* Add User dialog */}
      <AddUserDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleCreateUser}
        saving={saving}
      />
    </div>
  );
}