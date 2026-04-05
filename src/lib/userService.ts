// src/lib/userService.ts
import { getAccessToken } from './authService';

const API_BASE = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://localhost:8000/api/v1'
).replace(/\/auth$/, '').replace(/\/$/, '');

export type UserRole = 'analyst' | 'power_user' | 'db_manager' | 'admin';

export interface UserOut {
  firebase_uid:     string;
  email:            string;
  display_name:     string | null;
  photo_url:        string | null;
  role:             UserRole;
  is_active:        boolean;
  email_verified:   boolean;
  sign_in_provider: string;
  created_at:       string | null;
  last_login_at:    string | null;
}

export interface UserListResponse {
  users: UserOut[];
  total: number;
}

export interface CreateUserPayload {
  email:         string;
  password:      string;
  display_name?: string;
  role:          UserRole;
}

async function getIdToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in');
  return token;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getIdToken();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  const res = await fetch(`${API_BASE}${cleanPath}`, {
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
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

export async function listUsers(activeOnly = false): Promise<UserListResponse> {
  return apiFetch<UserListResponse>(`/users${activeOnly ? '?active_only=true' : ''}`);
}

export async function createUser(payload: CreateUserPayload): Promise<UserOut> {
  return apiFetch<UserOut>('/users', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateUserRole(uid: string, role: UserRole): Promise<UserOut> {
  return apiFetch<UserOut>(`/users/${uid}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
}

export async function activateUser(uid: string): Promise<UserOut> {
  return apiFetch<UserOut>(`/users/${uid}/activate`, { method: 'PATCH' });
}

export async function deactivateUser(uid: string): Promise<UserOut> {
  return apiFetch<UserOut>(`/users/${uid}/deactivate`, { method: 'PATCH' });
}

export async function updateUser(uid: string, payload: { display_name?: string; is_active?: boolean }): Promise<UserOut> {
  return apiFetch<UserOut>(`/users/${uid}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function deleteUser(uid: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/users/${uid}`, { method: 'DELETE' });
}
