// src/lib/auditService.ts
// GET /api/v1/connections/{connection_id}/audits  — per-connection audit logs (db_manager/admin)
// GET /api/v1/query/audits                        — current user's audit logs

import { auth } from './firebaseConfig';

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace('/auth', '') ??
  'http://localhost:8000/api/v1';

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const token = await user.getIdToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface AuditLogEntry {
  audit_id:         string;
  connection_id:    string;
  connection_name?: string;
  firebase_uid:     string;
  user_email?:      string;
  sql_query:        string;
  query_type?:      string;
  status:           'success' | 'results' | 'error';
  row_count?:       number | null;
  execution_time_ms?: number | null;
  error_message?:   string | null;
  created_at:       string;
}

export interface AuditLogResponse {
  audits: AuditLogEntry[];
  total:  number;
  limit:  number;
  offset: number;
}

export interface ConnectionStats {
  connection_id:        string;
  period_days:          number;
  total_queries:        number;
  successful_queries:   number;
  failed_queries:       number;
  success_rate:         number;
  total_rows_fetched:   number;
  avg_rows_per_query:   number;
  avg_execution_time_ms: number;
  query_type_breakdown: Record<string, number>;
  top_users:            { firebase_uid: string; query_count: number }[];
  daily_activity:       { date: string; count: number }[];
}

/** GET /api/v1/connections/{connection_id}/stats — db_manager/admin only */
export async function getConnectionStats(
  connectionId: string,
  days = 30,
): Promise<ConnectionStats> {
  return apiFetch<ConnectionStats>(`/connections/${connectionId}/stats?days=${days}`);
}

/** GET /api/v1/connections/{connection_id}/audits — db_manager/admin only, all users */
export async function getConnectionAudits(
  connectionId: string,
  params?: { limit?: number; offset?: number; status?: string; uid?: string },
): Promise<AuditLogResponse> {
  const qs = new URLSearchParams();
  if (params?.limit   != null) qs.set('limit',  String(params.limit));
  if (params?.offset  != null) qs.set('offset', String(params.offset));
  if (params?.status)          qs.set('status', params.status);
  if (params?.uid)             qs.set('uid',    params.uid);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<AuditLogResponse>(`/connections/${connectionId}/audits${query}`);
}

/** GET /api/v1/query/audits — own logs (analyst+); pass uid to view any user's logs (db_manager+) */
export async function getMyAudits(
  params?: { limit?: number; offset?: number; connectionId?: string; status?: string; uid?: string },
): Promise<AuditLogResponse> {
  const qs = new URLSearchParams();
  if (params?.limit        != null) qs.set('limit',         String(params.limit));
  if (params?.offset       != null) qs.set('offset',        String(params.offset));
  if (params?.connectionId)         qs.set('connection_id', params.connectionId);
  if (params?.status)               qs.set('status',        params.status);
  if (params?.uid)                  qs.set('uid',           params.uid);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<AuditLogResponse>(`/query/audits${query}`);
}
