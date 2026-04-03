// Saved (favourited) queries — stored in localStorage

const STORAGE_KEY = 't2t_saved_queries';

export interface SavedQuery {
  id:              string;
  sql:             string;
  summary:         string;
  connection_id:   string;
  connection_name: string;
  row_count:       number;
  saved_at:        string; // ISO
}

export function getSavedQueries(): SavedQuery[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as SavedQuery[];
  } catch {
    return [];
  }
}

export function saveQuery(q: Omit<SavedQuery, 'id' | 'saved_at'>): SavedQuery {
  const list = getSavedQueries();
  const entry: SavedQuery = { ...q, id: crypto.randomUUID(), saved_at: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...list]));
  return entry;
}

export function unsaveQuery(id: string): void {
  const list = getSavedQueries().filter(q => q.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function isSaved(sql: string): boolean {
  return getSavedQueries().some(q => q.sql === sql);
}
