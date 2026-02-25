// ─── Message ──────────────────────────────────────────────────────────────────

export interface Message {
  id:              string;
  role:            'user' | 'assistant';
  content:         string;
  timestamp:       Date;
  relatedQueryId?: string;
}

// ─── Query Result ─────────────────────────────────────────────────────────────

export interface QueryResult {
  id:            string;
  sql:           string;
  data:          Record<string, unknown>[];
  columns:       string[];
  executionTime: number;
  rowCount:      number;
  chartData?:    { name: string; value: number }[];
}

// ─── Result Tab ───────────────────────────────────────────────────────────────

export type ResultTab = 'table' | 'sql' | 'chart';