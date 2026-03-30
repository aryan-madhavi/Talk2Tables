import React, { useState, useEffect } from 'react';
import { User, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../../context/AuthContext';
import { updateProfile } from '../../../../lib/authService';

const ROLE_LABEL: Record<string, string> = {
  admin:      'Administrator',
  db_manager: 'DB Manager',
  power_user: 'Power User',
  analyst:    'Analyst',
};

export function ProfileSection() {
  const { user } = useAuth();

  const displayName  = user?.display_name || user?.email?.split('@')[0] || '';
  const photoUrl     = user?.photo_url || null;
  const avatarLetter = displayName.charAt(0).toUpperCase();

  const [name,    setName]    = useState(displayName);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  // Keep input in sync if auth user changes after login
  useEffect(() => { setName(displayName); }, [displayName]);

  const isDirty = name.trim() !== displayName;

  async function handleSave() {
    if (!isDirty || !name.trim()) return;
    setSaving(true);
    try {
      await updateProfile(name.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast.success('Display name updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 bg-gray-50/50">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <User className="w-5 h-5 text-blue-700" />
          Profile Information
        </h2>
        <p className="text-sm text-gray-500 mt-1">Update your display name</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-5">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={displayName}
              className="w-16 h-16 rounded-full object-cover border-2 border-gray-100 shadow-sm shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-blue-700 flex items-center justify-center border-2 border-gray-100 shadow-sm shrink-0">
              <span className="text-white text-xl font-bold">{avatarLetter}</span>
            </div>
          )}
          <div>
            <p className="font-semibold text-gray-900">{displayName}</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
          </div>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
            <input
              type="email"
              value={user?.email ?? ''}
              disabled
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm
                         bg-gray-50 text-gray-500 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
            <input
              type="text"
              value={ROLE_LABEL[user?.role ?? ''] ?? user?.role ?? ''}
              disabled
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm
                         bg-gray-50 text-gray-500 cursor-not-allowed"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-700 text-white text-sm font-medium
                       rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50
                       disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save Name'}
          </button>
        </div>
      </div>
    </div>
  );
}
