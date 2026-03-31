import React, { useState } from 'react';
import { Lock, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../../context/AuthContext';

export function PasswordSection() {
  const { user } = useAuth();
  const [current,  setCurrent]  = useState('');
  const [next,     setNext]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showCur,  setShowCur]  = useState(false);
  const [showNew,  setShowNew]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [done,     setDone]     = useState(false);

  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 6;
  const canSave  = current.length > 0 && next.length >= 6 && next === confirm && !saving;

  async function handleChange() {
    if (!canSave) return;
    if (!user || !user.email) {
      toast.error('Not signed in.');
      return;
    }

    setSaving(true);
    try {
      // TODO: Implement backend password change endpoint
      // Example: await updatePassword(current, next);
      toast.info('Password change is currently disabled in local mode.');
      setDone(true);
      setCurrent(''); setNext(''); setConfirm('');
      setTimeout(() => setDone(false), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to change password.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 bg-gray-50/50">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Lock className="w-5 h-5 text-blue-700" />
          Change Password
        </h2>
        <p className="text-sm text-gray-500 mt-1">Must be at least 6 characters</p>
      </div>

      <div className="p-6 space-y-5">
        {/* Current password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Password</label>
          <div className="relative">
            <input
              type={showCur ? 'text' : 'password'}
              value={current}
              onChange={e => setCurrent(e.target.value)}
              className="w-full md:w-80 px-4 py-2 pr-10 border border-gray-200 rounded-lg text-sm
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Enter current password"
            />
            <button
              type="button"
              onClick={() => setShowCur(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showCur ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* New password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={next}
              onChange={e => setNext(e.target.value)}
              className={`w-full md:w-80 px-4 py-2 pr-10 border rounded-lg text-sm
                          focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none
                          ${tooShort ? 'border-red-300' : 'border-gray-200'}`}
              placeholder="At least 6 characters"
            />
            <button
              type="button"
              onClick={() => setShowNew(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {tooShort && <p className="text-xs text-red-500 mt-1">Password must be at least 6 characters</p>}
        </div>

        {/* Confirm */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className={`w-full md:w-80 px-4 py-2 border rounded-lg text-sm
                        focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none
                        ${mismatch ? 'border-red-300' : 'border-gray-200'}`}
            placeholder="Repeat new password"
          />
          {mismatch && <p className="text-xs text-red-500 mt-1">Passwords do not match</p>}
        </div>

        <div className="flex justify-end md:justify-start">
          <button
            onClick={handleChange}
            disabled={!canSave}
            className="flex items-center gap-2 px-5 py-2 bg-blue-700 text-white text-sm font-medium
                       rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50
                       disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : done ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Lock className="w-4 h-4" />
            )}
            {saving ? 'Changing…' : done ? 'Changed' : 'Change Password'}
          </button>
        </div>
      </div>
    </div>
  );
}
