// ─── Filter Tab ───────────────────────────────────────────────────────────────

export type HistoryFilter = 'all' | 'saved' | 'recent' | 'shared';

export const HISTORY_FILTER_TABS: { label: string; value: HistoryFilter }[] = [
  { label: 'All',    value: 'all'    },
  { label: 'Saved',  value: 'saved'  },
  { label: 'Recent', value: 'recent' },
  { label: 'Shared', value: 'shared' },
];