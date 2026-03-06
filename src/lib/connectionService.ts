// src/lib/connectionService.ts
// All API calls for /api/v1/connections endpoints.
// Mirrors backend connection_routes.py exactly.

import { auth } from './firebaseConfig';

// ── Config ────────────────────────────────────────────────────────────────────

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace('/auth', '') ??
  'http://localhost:8000/api/v1';

// ── Response types (mirror backend ConnectionOut schema) ──────────────────────

export interface ConnectionOut {
  connection_id:  string;
  name:           string;
  db_type:        string;           // 'postgresql' | 'mysql' | 'oracle' | 'mssql' | 'sqlite'
  host:           string;
  port:           number;
  database_name:  string;
  username:       string;
  ssl_enabled:    boolean;
  is_active:      boolean;
  description:    string | null;
  created_by_uid: string;
  created_at:     string;
  updated_at:     string;
  last_tested_at: string | null;
  last_tested_ok: boolean | null;
}

export interface ConnectionListResponse {
  connections: ConnectionOut[];
  total:       number;
}

// ── Request body types ────────────────────────────────────────────────────────

export interface CreateConnectionPayload {
  name:          string;
  db_type:       string;
  host:          string;
  port:          number;
  database_name: string;
  username:      string;
  password:      string;
  ssl_enabled:   boolean;
  description?:  string;
}

export interface UpdateConnectionPayload {
  name?:          string;
  host?:          string;
  port?:          number;
  database_name?: string;
  username?:      string;
  password?:      string;
  ssl_enabled?:   boolean;
  description?:   string;
  is_active?:     boolean;
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken();
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getIdToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }

  // 204 No Content — return empty object
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

// ── API calls ─────────────────────────────────────────────────────────────────

/** POST /api/v1/connections — create a new connection */
export async function createConnection(
  payload: CreateConnectionPayload,
): Promise<ConnectionOut> {
  return apiFetch<ConnectionOut>('/connections', {
    method: 'POST',
    body:   JSON.stringify(payload),
  });
}

/** GET /api/v1/connections — list all connections */
export async function listConnections(
  activeOnly = false,
): Promise<ConnectionListResponse> {
  const qs = activeOnly ? '?active_only=true' : '';
  return apiFetch<ConnectionListResponse>(`/connections${qs}`);
}

/** GET /api/v1/connections/:id — get single connection */
export async function getConnection(id: string): Promise<ConnectionOut> {
  return apiFetch<ConnectionOut>(`/connections/${id}`);
}

/** PATCH /api/v1/connections/:id — partial update */
export async function updateConnection(
  id:      string,
  payload: UpdateConnectionPayload,
): Promise<ConnectionOut> {
  return apiFetch<ConnectionOut>(`/connections/${id}`, {
    method: 'PATCH',
    body:   JSON.stringify(payload),
  });
}

/** DELETE /api/v1/connections/:id — hard delete (admin only) */
export async function deleteConnection(id: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/connections/${id}`, {
    method: 'DELETE',
  });
}

/** PATCH /api/v1/connections/:id/activate */
export async function activateConnection(id: string): Promise<ConnectionOut> {
  return apiFetch<ConnectionOut>(`/connections/${id}/activate`, {
    method: 'PATCH',
  });
}

/** PATCH /api/v1/connections/:id/deactivate */
export async function deactivateConnection(id: string): Promise<ConnectionOut> {
  return apiFetch<ConnectionOut>(`/connections/${id}/deactivate`, {
    method: 'PATCH',
  });
}