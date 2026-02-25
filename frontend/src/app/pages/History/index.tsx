import React, { useState } from 'react';
import { queryHistory } from '../../data/mockData';
import { QueryEntry } from '../../types';
import { HistoryFilter } from './types';
import { HistoryToolbar }    from './components/HistoryToolbar';
import { HistoryFilterTabs } from './components/HistoryFilterTabs';
import { HistoryCard }       from './components/HistoryCard';
import { HistoryEmptyState } from './components/HistoryEmptyState';

export default function History() {
  const [filter, setFilter]       = useState<HistoryFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // ── Filtering logic ───────────────────────────────────────────────────────────

  const filteredHistory = queryHistory.filter(item => {
    if (filter === 'saved'  && item.status !== 'success') return false;
    // TODO: wire 'recent' and 'shared' filters when API is ready
    if (searchTerm && !item.query.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleRun    = (item: QueryEntry) => console.log('Run:',    item.id); // TODO
  const handleSave   = (item: QueryEntry) => console.log('Save:',   item.id); // TODO
  const handleDelete = (item: QueryEntry) => console.log('Delete:', item.id); // TODO

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      <HistoryToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />

      <HistoryFilterTabs
        active={filter}
        onChange={setFilter}
      />

      <div className="grid gap-4">
        {filteredHistory.length > 0 ? (
          filteredHistory.map(item => (
            <HistoryCard
              key={item.id}
              item={item}
              onRun={handleRun}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          ))
        ) : (
          <HistoryEmptyState />
        )}
      </div>

    </div>
  );
}