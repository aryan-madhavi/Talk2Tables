// src/app/pages/Login/components/SSOButtons.tsx
// Google button is UI-only — wire it up when ready.

import React from 'react';
import { useNavigate } from 'react-router';

export function SSOButtons() {
  const navigate = useNavigate();

  return (
    <div className="mt-6">

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500">New to Talk2Tables?</span>
        </div>
      </div>

      {/* Register Redirect */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => navigate('/signup')}
          className="w-full inline-flex justify-center items-center py-2.5 px-4
                     border border-gray-200 rounded-lg bg-white
                     text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Register an Account
        </button>
      </div>

    </div>
  );
}