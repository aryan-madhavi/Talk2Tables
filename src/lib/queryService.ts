// src/lib/queryService.ts
// POST /api/v1/query — natural language → SQL → results

import { auth } from './firebaseConfig';

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace('/auth', '') ??
  'http://localhost:8000/api/v1';

// ── Request ───────────────────────────────────────────────────────────────────

export interface QueryRequest {
  connection_id: string;
  chat_input:    string;
  /** Pass the chat_id from the previous response to continue a conversation. Omit to start new. */
  chat_id?:      string | null;
}

// ── Response ──────────────────────────────────────────────────────────────────

/** Present in data[0] on a successful query */
export interface QuerySuccessPayload {
  sql_query:            string;
  summary:              string;
  total_records:        number;
  numerical_insights?:  Record<string, unknown>;
  data:                 Record<string, unknown>[];
}

/** Present in data[0] when the backend returns an error response */
export interface QueryErrorPayload {
  error_message: string;
}

/**
 * POST /api/v1/query response.
 *
 * On success: data = [{ sql_query, summary, total_records, numerical_insights, data }]
 * On error:   data = [{ error_message }]
 */
export interface QueryResponse {
  response_type: string;
  chat_id:       string;
  data:          (QuerySuccessPayload | QueryErrorPayload)[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken();
}

export function isErrorPayload(
  payload: QuerySuccessPayload | QueryErrorPayload,
): payload is QueryErrorPayload {
  return 'error_message' in payload;
}

// ── API call ──────────────────────────────────────────────────────────────────

export async function executeQuery(payload: QueryRequest): Promise<QueryResponse> {
  const token = await getIdToken();

  const res = await fetch(`${API_BASE}/query`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Query failed: ${res.status}`);
  }

  return res.json() as Promise<QueryResponse>;
}

// ── Query History ──────────────────────────────────────────────────────────────

export interface QueryHistoryItem {
  msg_id:            string;
  chat_id:           string;
  connection_id:     string;
  connection_name:   string;
  title:             string;
  sql_query:         string;
  query_type:        string;
  status:            'success' | 'error';
  favourited:        boolean;
  total_records:     number | null;
  execution_time_ms: number | null;
  created_at:        string;
}

export interface QueryHistoryResponse {
  history: QueryHistoryItem[];
  total:   number;
  limit:   number;
  offset:  number;
}

export async function getQueryHistory(params?: {
  limit?:          number;
  offset?:         number;
  favouritesOnly?: boolean;
}): Promise<QueryHistoryResponse> {
  const token = await getIdToken();
  const qs = new URLSearchParams();
  if (params?.limit    != null) qs.set('limit',           String(params.limit));
  if (params?.offset   != null) qs.set('offset',          String(params.offset));
  if (params?.favouritesOnly)   qs.set('favourites_only', 'true');
  const url = `${API_BASE}/query/history${qs.toString() ? '?' + qs.toString() : ''}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<QueryHistoryResponse>;
}
