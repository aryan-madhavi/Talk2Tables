import React from 'react';
import { Link2 } from 'lucide-react';

export function SchemaRelationships() {
  return (
    <div className="mt-8">
      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">
        Relationships
      </h3>
      <div className="p-8 border border-gray-200 border-dashed rounded-xl bg-gray-50
                      flex items-center justify-center text-gray-400">
        <div className="text-center">
          <Link2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Relationship diagram visualization would appear here</p>
        </div>
      </div>
    </div>
  );
}