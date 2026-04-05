// src/lib/authService.ts
// All backend auth calls — JWT-based MongoDB backend.
// Fully typed to match backend auth_routes.py exactly.

// ── Types ────────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    electronAPI: {
      saveEnv: (data: any) => Promise<{ success: boolean; error?: string }>;
      encrypt: (text: string) => Promise<string>;
      decrypt: (cipher: string) => Promise<string | null>;
    };
  }
}

const API_BASE = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://localhost:8000/api/v1'
).replace(/\/auth$/, '').replace(/\/$/, '');

const AUTH_BASE = `${API_BASE}/auth`;

export interface BackendUser {
  uid:            string;
  firebase_uid:   string; 
  email:          string;
  display_name?:  string | null;
  photo_url?:     string | null;
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

// ── Secure Session storage — Electron Hardware Encryption ────────────────────

const ACCESS_TOKEN_KEY  = 't2t_access_token_secure';
const REFRESH_TOKEN_KEY = 't2t_refresh_token_secure';

/** Check if a backend session exists */
export async function hasSession(): Promise<boolean> {
  const token = await getAccessToken();
  return !!token;
}

export async function saveTokens(access: string, refresh: string): Promise<void> {
  // Encrypt tokens using OS-level keys before saving to disk (Electron)
  // Or use direct storage in browser (dev/web mode)
  if (window.electronAPI && window.electronAPI.encrypt) {
    const encryptedAccess = await window.electronAPI.encrypt(access);
    const encryptedRefresh = await window.electronAPI.encrypt(refresh);
    localStorage.setItem(ACCESS_TOKEN_KEY, encryptedAccess);
    localStorage.setItem(REFRESH_TOKEN_KEY, encryptedRefresh);
  } else {
    // Fallback for browser/dev mode - store as-is (less secure but functional)
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  }
}

export async function getAccessToken(): Promise<string | null> {
  const encrypted = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!encrypted) return null;
  
  // Decrypt using OS-level keys (Electron) or return as-is (browser/dev mode)
  if (window.electronAPI && window.electronAPI.decrypt) {
    return await window.electronAPI.decrypt(encrypted);
  } else {
    // Fallback for browser/dev mode
    return encrypted;
  }
}

export async function getRefreshToken(): Promise<string | null> {
  const encrypted = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!encrypted) return null;
  
  // Decrypt using OS-level keys (Electron) or return as-is (browser/dev mode)
  if (window.electronAPI && window.electronAPI.decrypt) {
    return await window.electronAPI.decrypt(encrypted);
  } else {
    // Fallback for browser/dev mode
    return encrypted;
  }
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// ── Authenticated fetch ──────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${AUTH_BASE}${cleanPath}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── Login / Signup ──────────────────────────────────────────────────────────

export async function signup(email: string, password: string, displayName: string): Promise<{ message: string; uid: string }> {
  const res = await fetch(`${AUTH_BASE}/signup`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password, display_name: displayName }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? 'Signup failed.');
  }

  const data = await res.json() as { message: string; uid: string; access_token?: string; refresh_token?: string };
  if (data.access_token && data.refresh_token) {
    await saveTokens(data.access_token, data.refresh_token);
  }
  return data;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${AUTH_BASE}/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? 'Login failed. Please check your credentials.');
  }

  const data = await res.json() as LoginResponse;
  await saveTokens(data.access_token, data.refresh_token);
  return data;
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function logout(): Promise<void> {
  try {
    await apiFetch('/logout', { method: 'POST' });
  } finally {
    clearTokens();
  }
}

// ── Profile ───────────────────────────────────────────────────────────────────

export async function getMe(): Promise<BackendUser> {
  const token = await getAccessToken();
  if (!token) throw new Error('No access token');
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
  await apiFetch(`/sessions/${sessionId}`, { method: 'DELETE' });
}

export async function forceLogoutUser(uid: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/admin/logout/${uid}`, { method: 'POST' });
}

/** compatibility export */
export async function checkTokenActive() {
    const token = await getAccessToken();
    if (!token) return { active: false };
    try {
        await getMe();
        return { active: true };
    } catch {
        return { active: false };
    }
}
