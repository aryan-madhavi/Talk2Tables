import React from 'react';
import { BarChart2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { QueryResult } from '../types';

interface ResultChartProps {
  result: QueryResult;
}

export function ResultChart({ result }: ResultChartProps) {
  const hasData = result.chartData && result.chartData.length > 0;

  if (!hasData) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400">
        <BarChart2 className="w-12 h-12 mb-2 opacity-20" />
        <p>No numeric data to visualize</p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300 h-full w-full">
      <div className="h-[300px] w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={result.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill="#0D47A1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}