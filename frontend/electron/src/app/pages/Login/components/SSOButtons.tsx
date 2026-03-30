// src/app/pages/Login/components/SSOButtons.tsx
// Google button is UI-only — wire it up when ready.

import React from 'react';

export function SSOButtons() {
  return (
    <div className="mt-6">

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500">Or continue with</span>
        </div>
      </div>

      {/* Google — disabled until wired */}
      <div className="mt-4">
        <button
          type="button"
          disabled
          title="Google sign-in — coming soon"
          className="w-full inline-flex justify-center items-center py-2.5 px-4
                     border border-gray-200 rounded-lg bg-gray-50
                     text-sm font-medium text-gray-400 cursor-not-allowed"
        >
          <img
            className="h-5 w-5 mr-2 opacity-40"
            src="https://www.svgrepo.com/show/475656/google-color.svg"
            alt="Google"
          />
          Login with Google
          <span className="ml-2 text-xs bg-gray-200 text-gray-400 px-1.5 py-0.5 rounded">
            Coming soon
          </span>
        </button>
      </div>

    </div>
  );
}