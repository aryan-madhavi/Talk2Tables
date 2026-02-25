import React from 'react';

// ─── Config ───────────────────────────────────────────────────────────────────

const SUGGESTED_QUERIES = [
  'Show sensors due for calibration',
  'List all active equipment',
  'Count employees by department',
  'Show maintenance logs for last week',
];

// ─── Component ────────────────────────────────────────────────────────────────

export function SuggestedQueries() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Suggested Queries</h2>

      <div className="flex flex-wrap gap-2">
        {SUGGESTED_QUERIES.map((q, i) => (
          <button
            key={i}
            className="text-left bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-700
                       px-4 py-2 rounded-full text-sm transition-colors
                       border border-gray-200 hover:border-blue-200"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}