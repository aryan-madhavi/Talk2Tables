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
