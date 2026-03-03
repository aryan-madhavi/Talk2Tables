import React from 'react';
import { Save } from 'lucide-react';
import { ProfileSection }       from './components/ProfileSection';
import { LanguageSection }      from './components/LanguageSection';
import { NotificationsSection } from './components/NotificationsSection';

export default function Settings() {
  const handleSave = () => {
    // TODO: wire to API
    console.log('Save settings');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <ProfileSection />
      <LanguageSection />
      <NotificationsSection />

      <div className="flex justify-end pt-4">
        <button
          onClick={handleSave}
          className="px-6 py-2 bg-blue-700 text-white font-medium rounded-lg shadow-sm
                     hover:bg-blue-800 transition-colors flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          Save Changes
        </button>
      </div>
    </div>
  );
}