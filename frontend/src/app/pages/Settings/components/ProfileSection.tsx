import React from 'react';
import { User } from 'lucide-react';
import { currentUser } from '../../../data/mockData';

export function ProfileSection() {
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
          <img
            src={currentUser.avatarUrl}
            alt={currentUser.name}
            className="w-20 h-20 rounded-full bg-gray-200 object-cover border-4 border-white shadow-sm"
          />
          <div>
            <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm
                               font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
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
              defaultValue={currentUser.name}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input
              type="email"
              defaultValue={currentUser.email}
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