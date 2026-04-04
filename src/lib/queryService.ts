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

// ── Streaming query (SSE) ─────────────────────────────────────────────────────

export interface QueryProgressEvent {
  stage:   string;
  message: string;
}

export interface StreamingQueryCallbacks {
  onProgress:  (event: QueryProgressEvent) => void;
  onResult:    (response: QueryResponse & { chat_id: string }) => void;
  onInsights?: (payload: { numerical_insights: unknown; narrative_insights: unknown }) => void;
  onError:     (message: string) => void;
}

export async function executeQueryStream(
  payload:   QueryRequest,
  callbacks: StreamingQueryCallbacks,
): Promise<void> {
  const token = await getIdToken();

  const res = await fetch(`${API_BASE}/query/stream`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    callbacks.onError(body.detail ?? `Query failed: ${res.status}`);
    return;
  }

  const reader  = res.body?.getReader();
  if (!reader) { callbacks.onError('No response body'); return; }

  const decoder = new TextDecoder();
  let   buffer  = '';

  while (true) {
    const { done, value } = await reader.read();
    
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
    }

    if (done && buffer.trim()) {
      buffer += '\n\n'; // force flush
    }

    const lines = buffer.split('\n\n');
    buffer = lines.pop() ?? '';

    for (const block of lines) {
      if (!block.trim()) continue;
      const eventMatch = block.match(/^event:\s*(\w+)/m);
      const dataMatch  = block.match(/^data:\s*(.*)/ms);
      if (!eventMatch || !dataMatch) continue;

      const eventType = eventMatch[1];
      let   data: unknown;
      try { data = JSON.parse(dataMatch[1].trim()); } catch { continue; }

      if (eventType === 'progress') {
        callbacks.onProgress(data as QueryProgressEvent);
      } else if (eventType === 'result') {
        callbacks.onResult(data as QueryResponse & { chat_id: string });
      } else if (eventType === 'insights') {
        callbacks.onInsights?.(data as { numerical_insights: unknown; narrative_insights: unknown });
      } else if (eventType === 'error') {
        callbacks.onError((data as { message: string }).message ?? 'Unknown error');
      }
    }

    if (done) break;
  }
}

// ── Query Suggestions ─────────────────────────────────────────────────────────

export interface SuggestionsResponse {
  suggestions:   string[];
  connection_id: string;
}

export async function getSuggestions(connectionId: string): Promise<SuggestionsResponse> {
  const token = await getIdToken();
  const res = await fetch(`${API_BASE}/query/suggestions?connection_id=${encodeURIComponent(connectionId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<SuggestionsResponse>;
}

// ── On-demand Insights ────────────────────────────────────────────────────────

export interface InsightsResponse {
  numerical_insights: Record<string, unknown>;
  narrative_insights: {
    key_finding:      string;
    business_insight: string;
    analyst_note:     string;
  } | null;
}

export async function generateInsights(
  data:     Record<string, unknown>[],
  question: string,
): Promise<InsightsResponse> {
  const token = await getIdToken();
  const res = await fetch(`${API_BASE}/query/insights`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ data, question }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<InsightsResponse>;
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
