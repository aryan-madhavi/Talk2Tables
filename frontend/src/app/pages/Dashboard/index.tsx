import React from 'react';
import { WelcomeBanner }   from '../../components/shared/WelcomeBanner';
import { QuickActions }    from './components/QuickActions';
import { RecentQueries }   from './components/RecentQueries';
import { SuggestedQueries } from './components/SuggestedQueries';

export default function Dashboard() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <WelcomeBanner />

      <QuickActions />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <RecentQueries />
        <SuggestedQueries />
      </div>
    </div>
  );
}