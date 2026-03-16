import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Search, History as HistoryIcon, Heart, Loader2 } from 'lucide-react';
import { getQueryHistory, QueryHistoryItem } from '../../../lib/queryService';
import { cn } from '../../../lib/utils';
import { HistoryTab } from './types';
import { HistoryCard }      from './components/HistoryCard';

export default function History() {
  const navigate = useNavigate();
  const [tab,        setTab]        = useState<HistoryTab>('history');
  const [searchTerm, setSearchTerm] = useState('');

  const [historyItems, setHistoryItems] = useState<QueryHistoryItem[]>([]);
  const [savedItems,   setSavedItems]   = useState<QueryHistoryItem[]>([]);
  const [histLoading,  setHistLoading]  = useState(true);
  const [savedLoading, setSavedLoading] = useState(true);

  const loadHistory = useCallback(() => {
    setHistLoading(true);
    getQueryHistory({ limit: 100 })
      .then(res => setHistoryItems(res.history ?? []))
      .catch(console.error)
      .finally(() => setHistLoading(false));
  }, []);

  const loadSaved = useCallback(() => {
    setSavedLoading(true);
    getQueryHistory({ limit: 100, favouritesOnly: true })
      .then(res => setSavedItems(res.history ?? []))
      .catch(console.error)
      .finally(() => setSavedLoading(false));
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => { loadSaved();   }, [loadSaved]);

  const handleRun = (item: QueryHistoryItem) => {
    navigate('/query', {
      state: { query: item.title, connectionId: item.connection_id },
    });
  };

  const handleToggleFavourite = (_item: QueryHistoryItem, nowFavourited: boolean) => {
    if (nowFavourited) {
      // reload saved list to include the newly favourited item
      loadSaved();
    } else {
      // remove from saved list
      setSavedItems(prev => prev.filter(s => s.msg_id !== _item.msg_id));
    }
  };

  const term = searchTerm.toLowerCase();

  const filteredHistory = historyItems.filter(h =>
    !term || h.title.toLowerCase().includes(term) ||
    h.connection_name.toLowerCase().includes(term) ||
    h.sql_query.toLowerCase().includes(term)
  );

  const filteredSaved = savedItems.filter(s =>
    !term || s.title.toLowerCase().includes(term) ||
    s.connection_name.toLowerCase().includes(term) ||
    s.sql_query.toLowerCase().includes(term)
  );

  const TABS = [
    { value: 'history' as HistoryTab, label: 'History', icon: <HistoryIcon className="w-4 h-4" />, count: historyItems.length },
    { value: 'saved'   as HistoryTab, label: 'Saved',   icon: <Heart className="w-4 h-4" />,       count: savedItems.length  },
  ];

  const active     = tab === 'history' ? filteredHistory : filteredSaved;
  const isLoading  = tab === 'history' ? histLoading     : savedLoading;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Query History</h1>
          <p className="text-gray-500 text-sm">Browse past queries and saved favourites</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search queries…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm
                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                       w-full md:w-64 transition-all outline-none"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === t.value
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-800',
            )}
          >
            {t.icon}
            {t.label}
            {t.count > 0 && (
              <span className={cn(
                'px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
                tab === t.value ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500',
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="grid gap-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : active.length > 0 ? (
          active.map(item => (
            <HistoryCard
              key={item.msg_id}
              item={item}
              onRun={handleRun}
              onToggleFavourite={handleToggleFavourite}
            />
          ))
        ) : (
          <div className="text-center py-16 text-gray-400">
            {tab === 'history'
              ? <><HistoryIcon className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="text-sm">{searchTerm ? 'No queries match your search' : 'No query history yet'}</p></>
              : <><Heart className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="text-sm">{searchTerm ? 'No saved queries match your search' : 'No saved queries yet — like a result to save it'}</p></>
            }
          </div>
        )}
      </div>

    </div>
  );
}
