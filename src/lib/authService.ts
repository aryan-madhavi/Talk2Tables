// src/lib/authService.ts
// All backend auth calls — JWT-based MongoDB backend.
// Fully typed to match backend auth_routes.py exactly.

// ── Config ────────────────────────────────────────────────────────────────────

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://localhost:8000/api/v1/auth';

// ── Response types (mirror backend auth_routes.py) ────────────────────────────

export interface BackendUser {
  uid:            string;
  firebase_uid:   string; // Added for compatibility
  email:          string;
  display_name?:  string | null;
  photo_url?:     string | null;
  /** RBAC role — set by admin, never overwritten on login */
  role:           'admin' | 'db_manager' | 'power_user' | 'analyst';
  is_active?:     boolean;
  email_verified?: boolean;
}

export interface LoginResponse {
  access_token:  string;
  refresh_token: string;
  token_type:    string;
  user:          BackendUser;
}

export interface SessionEntry {
  session_id:   string;
  device_info:  string | null;
  ip_address:   string | null;
  is_revoked:   boolean;
  created_at:   string | null;
  last_seen_at: string | null;
  expires_at:   string | null;
}

// ── Session storage — secure cookie (replaces localStorage) ──────────────────

const ACCESS_TOKEN_KEY  = 't2t_access_token';
const REFRESH_TOKEN_KEY = 't2t_refresh_token';
const SESSION_MAX_AGE   = 604800; // 7 days (matches backend refresh token)

function setCookie(name: string, value: string, maxAge: number): void {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'SameSite=Strict',
    secure,
  ].join('; ');
}

function getCookie(name: string): string | null {
  const match = document.cookie
    .split('; ')
    .find(row => row.trim().startsWith(`${name}=`));
  return match ? decodeURIComponent(match.trim().split('=')[1]) : null;
}

function deleteCookie(name: string): void {
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Strict`;
}

/** Check if a backend session cookie exists */
export function hasSession(): boolean {
  return !!getAccessToken();
}

export function saveTokens(access: string, refresh: string): void {
  setCookie(ACCESS_TOKEN_KEY, access, 3600); // 1 hour for access
  setCookie(REFRESH_TOKEN_KEY, refresh, SESSION_MAX_AGE);
}

export function getAccessToken(): string | null {
  return getCookie(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return getCookie(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void {
  deleteCookie(ACCESS_TOKEN_KEY);
  deleteCookie(REFRESH_TOKEN_KEY);
}

// ── Authenticated fetch (auto-refresh on 401) ─────────────────────────────────

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && getRefreshToken()) {
     // TODO: Implement refresh token logic if needed
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── Login / Signup ──────────────────────────────────────────────────────────

export async function signup(email: string, password: string, displayName: string): Promise<{ message: string; uid: string }> {
  const res = await fetch(`${API_BASE}/signup`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password, display_name: displayName }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? 'Signup failed.');
  }

  return res.json() as Promise<{ message: string; uid: string }>;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? 'Login failed. Please check your credentials.');
  }

  const data = await res.json() as LoginResponse;
  saveTokens(data.access_token, data.refresh_token);
  return data;
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function logout(): Promise<void> {
  try {
    await apiFetch<{ message: string }>('/logout', { method: 'POST' });
  } finally {
    clearTokens();
  }
}

// ── Profile ───────────────────────────────────────────────────────────────────

export async function getMe(): Promise<BackendUser> {
  if (!getAccessToken()) throw new Error('No access token');
  return apiFetch<BackendUser>('/me');
}

export async function updateProfile(displayName: string): Promise<BackendUser> {
  return apiFetch<BackendUser>('/me', {
    method: 'PATCH',
    body:   JSON.stringify({ display_name: displayName }),
  });
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function getSessions(): Promise<SessionEntry[]> {
  return apiFetch<SessionEntry[]>('/sessions');
}

export async function revokeSession(sessionId: string): Promise<void> {
  await apiFetch<{ message: string }>(`/sessions/${sessionId}`, { method: 'DELETE' });
}

export async function forceLogoutUser(uid: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/admin/logout/${uid}`, { method: 'POST' });
}

/** compatibility export */
export async function checkTokenActive() {
    const token = getAccessToken();
    if (!token) return { active: false };
    try {
        await getMe();
        return { active: true };
    } catch {
        return { active: false };
    }
}
