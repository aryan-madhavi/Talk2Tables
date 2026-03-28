// ─── Message ──────────────────────────────────────────────────────────────────

export interface Message {
  id:           string;
  role:         'user' | 'assistant';
  content:      string;
  timestamp:    Date;
  queryResult?: QueryResult;
  isError?:     boolean;
  retryInput?:  string;
}

// ─── Insights ─────────────────────────────────────────────────────────────────

export interface NumericColumnStats {
  type:       'numeric';
  min:        number;
  max:        number;
  avg:        number;
  sum:        number;
  null_count: number;
}

export interface CategoricalColumnStats {
  type:         'categorical';
  unique_count: number;
  null_count:   number;
  most_common:  { value: string; count: number }[];
}

export type ColumnStats = NumericColumnStats | CategoricalColumnStats;

export interface NumericalInsights {
  total_records: number;
  aggregations:  Record<string, ColumnStats>;
}

export interface NarrativeInsights {
  key_finding:      string;
  business_insight: string;
  analyst_note:     string;
}

// ─── Query Result ─────────────────────────────────────────────────────────────

export interface QueryResult {
  id:            string;
  sql:           string;
  data:          Record<string, unknown>[];
  columns:       string[];
  executionTime: number;
  rowCount:      number;
  question?:          string;
  summary?:           string;
  insights?:          NumericalInsights;
  narrativeInsights?: NarrativeInsights;
  insightsLoading?:   boolean;
  msgId?:        string;
  chartData?:    { name: string; value: number }[];
}

// ─── Result Tab ───────────────────────────────────────────────────────────────

export type ResultTab = 'table' | 'sql' | 'chart' | 'insights';