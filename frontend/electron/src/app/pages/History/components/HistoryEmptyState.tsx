import React from 'react';
import { Clock } from 'lucide-react';

export function HistoryEmptyState() {
  return (
    <div className="text-center py-12 bg-white rounded-xl border border-gray-100 border-dashed">
      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
        <Clock className="w-8 h-8 text-gray-300" />
      </div>
      <h3 className="text-lg font-medium text-gray-900">No queries found</h3>
      <p className="text-gray-500 text-sm mt-1">Try changing the filters or run a new query.</p>
    </div>
  );
}