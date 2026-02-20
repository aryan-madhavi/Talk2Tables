import React from 'react';
import { Link } from 'react-router';
import { Search, Folder, BarChart2, Play, Clock, ArrowRight } from 'lucide-react';
import { currentUser, queryHistory } from '../data/mockData';
import { format } from 'date-fns';

export default function Dashboard() {
  const recentQueries = queryHistory.slice(0, 5);
  const suggestedQueries = [
    "Show sensors due for calibration",
    "List all active equipment",
    "Count employees by department",
    "Show maintenance logs for last week"
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 rounded-xl p-8 text-white shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 opacity-10 transform translate-x-1/4 -translate-y-1/4">
          {/* <svg width="400" height="400" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="100" cy="100" r="80" stroke="white" strokeWidth="20" />
            <path d="M100 20V180" stroke="white" strokeWidth="20" />
            <path d="M20 100H180" stroke="white" strokeWidth="20" />
          </svg> */}
        </div>
        <div className="relative z-10">
          <h1 className="text-3xl font-bold mb-2">Good morning, {currentUser.name.split(' ')[0]} 👋</h1>
          <p className="text-blue-100 text-lg">What would you like to know today?</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link to="/query" className="group p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all flex items-start gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center text-blue-700 group-hover:bg-blue-100 transition-colors">
            <Search className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-lg text-gray-900 mb-1 group-hover:text-blue-700 transition-colors">Ask a Question</h3>
            <p className="text-gray-500 text-sm">Query your database using plain language</p>
          </div>
        </Link>
        
        <Link to="/history" className="group p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all flex items-start gap-4">
          <div className="w-12 h-12 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600 group-hover:bg-amber-100 transition-colors">
            <Folder className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-lg text-gray-900 mb-1 group-hover:text-amber-600 transition-colors">Saved Queries</h3>
            <p className="text-gray-500 text-sm">Access your frequently used reports</p>
          </div>
        </Link>
        
        <Link to="/comingsoon" className="group p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all flex items-start gap-4">
          <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center text-green-600 group-hover:bg-green-100 transition-colors">
            <BarChart2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-lg text-gray-900 mb-1 group-hover:text-green-600 transition-colors">View Reports</h3>
            <p className="text-gray-500 text-sm">Visualize trends and analytics</p>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Queries */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-500" />
              Recent Queries
            </h2>
            <Link to="/history" className="text-sm font-medium text-blue-700 hover:text-blue-800 flex items-center">
              View All <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
          
          <div className="space-y-4">
            {recentQueries.map((query) => (
              <div key={query.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group">
                <div className="flex items-start gap-3 overflow-hidden">
                  <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                    query.type === 'SELECT' ? 'bg-green-500' : 
                    query.type === 'UPDATE' ? 'bg-amber-500' : 'bg-red-500'
                  }`} />
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate pr-4">{query.query}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                      <span>{query.database}</span>
                      <span>•</span>
                      <span>{format(new Date(query.timestamp), 'MMM d, h:mm a')}</span>
                    </div>
                  </div>
                </div>
                <button className="p-2 text-blue-700 hover:bg-blue-100 rounded-full opacity-0 group-hover:opacity-100 transition-all" title="Run Again">
                  <Play className="w-4 h-4 fill-current" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Suggested Queries */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Suggested Queries</h2>
          <div className="flex flex-wrap gap-2">
            {suggestedQueries.map((q, i) => (
              <button 
                key={i}
                className="text-left bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-700 px-4 py-2 rounded-full text-sm transition-colors border border-gray-200 hover:border-blue-200"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
