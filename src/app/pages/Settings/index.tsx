import React from 'react';
import { ProfileSection }  from './components/ProfileSection';
import { PasswordSection } from './components/PasswordSection';
import { SessionsSection } from './components/SessionsSection';
import { DangerSection }   from './components/DangerSection';

export default function Settings() {
  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account and security</p>
      </div>

      <ProfileSection />
      <PasswordSection />
      <SessionsSection />
      <DangerSection />
    </div>
  );
}
