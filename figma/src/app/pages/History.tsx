import React, { useState } from 'react';
import { Search, Filter, Play, Clock, Database, ChevronRight, MoreVertical, Trash2, Bookmark } from 'lucide-react';
import { queryHistory, currentUser } from '../data/mockData';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';

export default function History() {
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredHistory = queryHistory.filter(item => {
    if (filter === 'saved' && item.status !== 'success') return false; 
    // In a real app, we'd have a 'saved' boolean on the query object
    if (searchTerm && !item.query.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Query History</h1>
          <p className="text-gray-500">View and rerun your past database interactions</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search history..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full md:w-64 transition-all"
            />
          </div>
          <button className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-gray-200 pb-1 overflow-x-auto">
        {['All', 'Saved', 'Recent', 'Shared'].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab.toLowerCase())}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap",
              filter === tab.toLowerCase()
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-gray-50"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid gap-4">
        {filteredHistory.length > 0 ? (
          filteredHistory.map((item) => (
            <div key={item.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide",
                      item.type === 'SELECT' ? "bg-green-100 text-green-700" :
                      item.type === 'UPDATE' ? "bg-amber-100 text-amber-700" :
                      "bg-red-100 text-red-700"
                    )}>
                      {item.type}
                    </span>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(item.timestamp), 'MMM d, yyyy • h:mm a')}
                    </span>
                  </div>
                  <h3 className="font-medium text-gray-900 truncate mb-1">{item.query}</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Database className="w-3.5 h-3.5" />
                    <span>{item.database}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Run Again">
                    <Play className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Bookmark">
                    <Bookmark className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="mt-4 pt-3 border-t border-gray-50">
                <code className="text-xs font-mono text-gray-500 block truncate bg-gray-50 p-2 rounded">
                  {item.sql}
                </code>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-100 border-dashed">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No queries found</h3>
            <p className="text-gray-500 text-sm mt-1">Try changing the filters or run a new query.</p>
          </div>
        )}
      </div>
    </div>
  );
}
