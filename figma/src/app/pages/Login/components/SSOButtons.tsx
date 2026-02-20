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

      {/* SSO Buttons */}
      <div className="mt-6 grid grid-cols-1 gap-3">
        <button
          type="button"
          className="w-full inline-flex justify-center py-2.5 px-4 border border-gray-300
                     rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700
                     hover:bg-gray-50 transition-colors"
        >
          <img
            className="h-5 w-5 mr-2"
            src="https://www.svgrepo.com/show/475656/google-color.svg"
            alt="Google"
          />
          Login with Google
        </button>
      </div>
    </div>
  );
}