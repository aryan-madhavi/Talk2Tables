import React, { useEffect, useState } from 'react';
import { Monitor, Loader2, Trash2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { getSessions, revokeSession, SessionEntry } from '../../../../lib/authService';

// Read the current session ID from the cookie set at login
function getCurrentSessionId(): string | null {
  const match = document.cookie
    .split('; ')
    .find(row => row.startsWith('t2t_session_id='));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return format(new Date(iso), 'MMM d, yyyy · h:mm a');
}

export function SessionsSection() {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const currentSessionId = getCurrentSessionId();

  function load() {
    setLoading(true);
    getSessions()
      .then(data => setSessions(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Failed to load sessions.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleRevoke(sessionId: string) {
    setRevoking(sessionId);
    try {
      await revokeSession(sessionId);
      setSessions(prev => prev.filter(s => s.session_id !== sessionId));
      toast.success('Session revoked.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke session.');
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Monitor className="w-5 h-5 text-blue-700" />
            Active Sessions
          </h2>
          <p className="text-sm text-gray-500 mt-1">Devices currently signed in to your account</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="divide-y divide-gray-50">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading sessions…</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">No active sessions found.</div>
        ) : (
          sessions.map(s => {
            const isCurrent = s.session_id === currentSessionId;
            return (
              <div key={s.session_id} className="flex items-center justify-between p-5 gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${isCurrent ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {s.device_info ? s.device_info.split(' ').slice(0, 4).join(' ') : 'Unknown device'}
                      </p>
                      {isCurrent && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                          This device
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      IP {s.ip_address || '—'}
                      <span className="mx-1.5">·</span>
                      Signed in {formatDate(s.created_at)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Last active {formatDate(s.last_seen_at)}
                    </p>
                  </div>
                </div>

                {!isCurrent && (
                  <button
                    onClick={() => handleRevoke(s.session_id)}
                    disabled={revoking === s.session_id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600
                               bg-red-50 hover:bg-red-100 rounded-lg transition-colors
                               disabled:opacity-50 shrink-0"
                    title="Sign out this device"
                  >
                    {revoking === s.session_id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />
                    }
                    Revoke
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
