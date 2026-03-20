import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, LogOut, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../../context/AuthContext';

export function DangerSection() {
  const { logout } = useAuth();
  const navigate   = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [loading,    setLoading]    = useState(false);

  async function handleSignOutAll() {
    setLoading(true);
    try {
      await logout();
      toast.success('Signed out from all devices.');
      navigate('/login', { replace: true });
    } catch {
      toast.error('Failed to sign out all devices.');
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-red-100 overflow-hidden">
      <div className="p-6 border-b border-red-50 bg-red-50/40">
        <h2 className="text-lg font-bold text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Danger Zone
        </h2>
        <p className="text-sm text-red-500 mt-1">Actions here cannot be undone easily</p>
      </div>

      <div className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-red-100 rounded-lg bg-red-50/30">
          <div>
            <p className="text-sm font-semibold text-gray-900">Sign Out of All Devices</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Revokes all active sessions. You will be signed out here too.
            </p>
          </div>

          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600
                         border border-red-200 bg-white rounded-lg hover:bg-red-50 transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
              Sign Out All
            </button>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-gray-600 mr-1">Are you sure?</span>
              <button
                onClick={handleSignOutAll}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white
                           bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-60"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Yes, sign out
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={loading}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100
                           hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
