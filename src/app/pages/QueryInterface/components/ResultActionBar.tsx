import React from 'react';
import { Download, Save, RefreshCw } from 'lucide-react';

export function ResultActionBar() {
  return (
    <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
      <div className="flex gap-2">
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                           text-gray-700 bg-white border border-gray-200 rounded-lg
                           hover:bg-gray-50 hover:text-blue-600 transition-colors">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                           text-gray-700 bg-white border border-gray-200 rounded-lg
                           hover:bg-gray-50 hover:text-blue-600 transition-colors">
          <Save className="w-3.5 h-3.5" /> Save
        </button>
      </div>
      <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                         text-blue-700 bg-blue-50 border border-blue-100 rounded-lg
                         hover:bg-blue-100 transition-colors">
        <RefreshCw className="w-3.5 h-3.5" /> Refine
      </button>
    </div>
  );
}