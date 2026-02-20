import React from 'react';
import { User, Lock, Globe, Bell, Moon, Sun, Save } from 'lucide-react';
import { currentUser } from '../data/mockData';

export default function Settings() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-700" />
            Profile Information
          </h2>
          <p className="text-sm text-gray-500 mt-1">Update your photo and personal details</p>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-6">
            <img 
              src={currentUser.avatarUrl} 
              alt={currentUser.name} 
              className="w-20 h-20 rounded-full bg-gray-200 object-cover border-4 border-white shadow-sm"
            />
            <div>
              <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
                Change Photo
              </button>
              <p className="text-xs text-gray-500 mt-2">JPG, GIF or PNG. Max size of 800K</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input 
                type="text" 
                defaultValue={currentUser.name}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input 
                type="email" 
                defaultValue={currentUser.email}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-gray-50 text-gray-500 cursor-not-allowed"
                disabled
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-700" />
            Language & Region
          </h2>
          <p className="text-sm text-gray-500 mt-1">Select your preferred language for the interface</p>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="max-w-md">
            <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
            <select className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all">
              <option value="en">English (India)</option>
              <option value="hi">Hindi (हिंदी)</option>
              <option value="mr">Marathi (मराठी)</option>
              <option value="ta">Tamil (தமிழ்)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-700" />
            Notifications
          </h2>
          <p className="text-sm text-gray-500 mt-1">Manage how you receive alerts</p>
        </div>
        
        <div className="p-6 space-y-4">
          {[
            { label: 'Query execution completed', desc: 'Get notified when long-running queries finish' },
            { label: 'Security alerts', desc: 'Receive alerts for suspicious activities' },
            { label: 'System updates', desc: 'News about Talk2Tables features' }
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex items-center h-5">
                <input 
                  type="checkbox" 
                  defaultChecked 
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-900 block">{item.label}</label>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button className="px-6 py-2 bg-blue-700 text-white font-medium rounded-lg shadow-sm hover:bg-blue-800 transition-colors flex items-center gap-2">
          <Save className="w-4 h-4" />
          Save Changes
        </button>
      </div>
    </div>
  );
}
