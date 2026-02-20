import React from 'react';
import { ComingSoon } from '../../../routes';

/**
 * StatsTab — placeholder until usage statistics are implemented.
 *
 * When ready, uncomment the full implementation below and remove <ComingSoon />.
 * Requires: recharts (AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer)
 */
export function StatsTab() {
  return <ComingSoon />;

  /*
  const chartData = [
    { name: 'Mon', queries: 400, errors: 24 },
    { name: 'Tue', queries: 300, errors: 13 },
    { name: 'Wed', queries: 550, errors: 38 },
    { name: 'Thu', queries: 450, errors: 20 },
    { name: 'Fri', queries: 600, errors: 45 },
    { name: 'Sat', queries: 200, errors: 10 },
    { name: 'Sun', queries: 150, errors:  5 },
  ];

  return (
    <div className="p-6 animate-in fade-in h-full flex flex-col">
      <h3 className="text-lg font-bold text-gray-900 mb-6">System Usage Statistics</h3>
      <div className="h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorQueries" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#0D47A1" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#0D47A1" stopOpacity={0}   />
              </linearGradient>
              <linearGradient id="colorErrors" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#C62828" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#C62828" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <XAxis dataKey="name" />
            <YAxis />
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <Tooltip />
            <Area type="monotone" dataKey="queries" stroke="#0D47A1" fillOpacity={1} fill="url(#colorQueries)" />
            <Area type="monotone" dataKey="errors"  stroke="#C62828" fillOpacity={1} fill="url(#colorErrors)"  />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
  */
}