import React from 'react';
import { useNavigate } from 'react-router';
import { Sparkles } from 'lucide-react';

// ─── Config ───────────────────────────────────────────────────────────────────

const SUGGESTED_QUERIES = [
  'Show sensors due for calibration',
  'List all active equipment',
  'Count employees by department',
  'Show maintenance logs for last week',
  'Which equipment has warranty expiring this year?',
  'Show top 10 products by revenue this month',
];

// ─── Component ────────────────────────────────────────────────────────────────

export function SuggestedQueries() {
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-amber-500" />
        Suggested Queries
      </h2>
      <p className="text-sm text-gray-500 mb-5">Click any to pre-fill the query box</p>

      <div className="flex flex-wrap gap-2">
        {SUGGESTED_QUERIES.map((q, i) => (
          <button
            key={i}
            onClick={() => navigate('/query', { state: { prefill: q } })}
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
