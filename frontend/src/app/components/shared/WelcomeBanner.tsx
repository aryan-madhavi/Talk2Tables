import React from 'react';
import { currentUser } from '../../data/mockData';

export function WelcomeBanner() {
  const firstName = currentUser.name.split(' ')[0];

  return (
    <div className="bg-gradient-to-r from-blue-700 to-blue-900 rounded-xl p-8 text-white shadow-lg relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 opacity-10 transform translate-x-1/4 -translate-y-1/4 pointer-events-none">
        <svg width="400" height="400" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="100" cy="100" r="80" stroke="white" strokeWidth="20" />
          <path d="M100 20V180" stroke="white" strokeWidth="20" />
          <path d="M20 100H180" stroke="white" strokeWidth="20" />
        </svg>
      </div>

      <div className="relative z-10">
        <h1 className="text-3xl font-bold mb-2">Good morning, {firstName} 👋</h1>
        <p className="text-blue-100 text-lg">What would you like to know today?</p>
      </div>
    </div>
  );
}