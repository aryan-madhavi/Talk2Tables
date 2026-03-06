// src/app/pages/Settings/components/ProfileSection.tsx

import React from 'react';
import { User } from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';

export function ProfileSection() {
  const { user } = useAuth();

  const displayName  = user?.display_name || user?.email?.split('@')[0] || '';
  const photoUrl     = user?.photo_url || null;
  const avatarLetter = displayName.charAt(0).toUpperCase();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 bg-gray-50/50">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <User className="w-5 h-5 text-blue-700" />
          Profile Information
        </h2>
        <p className="text-sm text-gray-500 mt-1">Update your photo and personal details</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-6">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={displayName}
              className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-sm"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-blue-700 flex items-center justify-center border-4 border-white shadow-sm shrink-0">
              <span className="text-white text-2xl font-bold">{avatarLetter}</span>
            </div>
          )}
          <div>
            <button
              disabled
              title="Photo upload coming soon"
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm
                         font-medium text-gray-400 cursor-not-allowed shadow-sm"
            >
              Change Photo
            </button>
            <p className="text-xs text-gray-500 mt-2">JPG, GIF or PNG. Max size of 800K</p>
          </div>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              defaultValue={displayName}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input
              type="email"
              defaultValue={user?.email ?? ''}
              disabled
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm
                         bg-gray-50 text-gray-500 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <input
              type="text"
              value={
                user?.role === 'admin'
                  ? 'Administrator'
                  : user?.role === 'power_user'
                  ? 'Power User'
                  : 'Viewer'
              }
              disabled
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm
                         bg-gray-50 text-gray-500 cursor-not-allowed"
            />
          </div>
        </div>
      </div>
    </div>
  );
}