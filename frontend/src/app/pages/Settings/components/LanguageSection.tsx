import React from 'react';
import { Globe } from 'lucide-react';

const LANGUAGES = [
  { value: 'en', label: 'English (India)' },
  { value: 'hi', label: 'Hindi (हिंदी)'   },
  { value: 'mr', label: 'Marathi (मराठी)' },
  { value: 'ta', label: 'Tamil (தமிழ்)'   },
];

export function LanguageSection() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 bg-gray-50/50">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Globe className="w-5 h-5 text-blue-700" />
          Language & Region
        </h2>
        <p className="text-sm text-gray-500 mt-1">Select your preferred language for the interface</p>
      </div>

      <div className="p-6">
        <div className="max-w-md">
          <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
          <select className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm
                             focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none">
            {LANGUAGES.map(lang => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}