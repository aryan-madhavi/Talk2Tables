// src/lib/accessService.ts
import { auth } from './firebaseConfig';
import { handleApiErrorSignal } from './errorHandler';

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace('/auth', '') ??
  'http://localhost:8000/api/v1';

export type PermissionType = 'read' | 'write';

export interface AccessGrantOut {
  access_id:      string;
  firebase_uid:   string;
  connection_id:  string;
  granted_by_uid: string;
  permission:     PermissionType;
  is_active:      boolean;
  granted_at:     string;
  revoked_at:     string | null;
  expires_at:     string | null;
  note:           string | null;
}

export interface AccessGrantListResponse {
  grants: AccessGrantOut[];
  total:  number;
}

export interface CreateGrantPayload {
  firebase_uid:  string;
  connection_id: string;
  permission:    PermissionType;
  expires_at?:   string | null;
  note?:         string | null;
}

export interface UpdateGrantPayload {
  permission?: PermissionType;
  expires_at?: string | null;
  note?:       string | null;
}

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

  await handleApiErrorSignal(res);

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

export interface MyConnectionItem {
  grant:      { access_id: string; permission: PermissionType; granted_at: string; expires_at: string | null };
  connection: { connection_id: string; name: string; db_type: string; host: string; port: number; database_name: string; is_active: boolean; description: string | null };
}

/** GET /api/v1/access-grants/my/connections — full items (grant + connection) */
export async function getMyConnections(): Promise<MyConnectionItem[]> {
  const raw = await apiFetch<{ connections: MyConnectionItem[]; total: number }>('/access-grants/my/connections');
  return raw.connections;
}

/** Convenience: returns only the connection objects (no grant info) */
export async function getMyConnectionsOnly(): Promise<MyConnectionItem['connection'][]> {
  const items = await getMyConnections();
  return items.map(item => item.connection);
}

export async function listGrantsByUser(uid: string, activeOnly = false): Promise<AccessGrantListResponse> {
  return apiFetch<AccessGrantListResponse>(`/access-grants?uid=${uid}&active_only=${activeOnly}`);
}

export async function createGrant(payload: CreateGrantPayload): Promise<AccessGrantOut> {
  return apiFetch<AccessGrantOut>('/access-grants', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateGrant(accessId: string, payload: UpdateGrantPayload): Promise<AccessGrantOut> {
  return apiFetch<AccessGrantOut>(`/access-grants/${accessId}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function revokeGrant(accessId: string): Promise<AccessGrantOut> {
  return apiFetch<AccessGrantOut>(`/access-grants/${accessId}/revoke`, { method: 'PATCH' });
}