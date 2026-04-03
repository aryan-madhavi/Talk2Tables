// src/lib/authService.ts
// All backend auth calls — Firebase SDK + Talk2Tables backend (Firestore).
// Fully typed to match backend schemas.py exactly.

import {
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
} from 'firebase/auth';
import { auth } from './firebaseConfig';

// ── Config ────────────────────────────────────────────────────────────────────

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://localhost:8000/api/v1/auth';

// ── Response types (mirror backend schemas.py) ────────────────────────────────

export interface BackendUser {
  firebase_uid:   string;
  email:          string;
  display_name:   string | null;
  photo_url:      string | null;
  /** RBAC role — set by admin, never overwritten on login */
  role:           'admin' | 'db_manager' | 'power_user' | 'analyst';
  is_active:      boolean;
  email_verified: boolean;
  created_at?:    string;
  last_login_at?: string;
}

export interface LoginResponse {
  custom_token: string;   // exchange via signInWithCustomToken()
  session_id:   string;   // Firestore session document ID
  user:         BackendUser;
}

export interface TokenActiveResponse {
  active:      boolean;
  uid?:        string;
  email?:      string;
  role?:       string;
  db_user_id?: string;
  expires_at?: string;
  session_id?: string;
  reason?:     string;  // present only when active = false
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

export interface SignupResponse {
  custom_token: string;
  session_id:   string;
  user:         BackendUser;
}

// ── Session storage — secure cookie (replaces localStorage) ──────────────────
//
// Why cookies over localStorage?
//   • localStorage is readable by ANY JS on the page — stolen by XSS.
//   • Cookies with SameSite=Strict are blocked on cross-origin requests (CSRF).
//   • Cookies with Secure are HTTPS-only in production.
//   • Expiry is enforced by the browser automatically at Max-Age.
//
// Note: We set from JS (not HttpOnly) because this is a pure SPA with no SSR.
// If you add a BFF proxy later, move cookie setting there + add HttpOnly.
//
// Flags:
//   SameSite=Strict  — CSRF protection
//   Secure           — HTTPS only (auto-skipped on http://localhost)
//   Max-Age=3600     — 1 hour, matches Firebase ID token lifetime
//   Path=/           — accessible on all routes

const SESSION_KEY     = 't2t_session_id';
const SESSION_MAX_AGE = 28800; // seconds — 8 hours (matches backend session_expiry_seconds)

export function saveSession(id: string): void {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = [
    `${SESSION_KEY}=${encodeURIComponent(id)}`,
    `Max-Age=${SESSION_MAX_AGE}`,
    'Path=/',
    'SameSite=Strict',
    secure,
  ].join('; ');
}

function getSessionId(): string | null {
  const match = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${SESSION_KEY}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

/** Check if a backend session cookie exists (used by AuthContext to avoid 401 spam). */
export function hasSession(): boolean {
  return !!getSessionId();
}

function clearSession(): void {
  // Max-Age=0 expires the cookie immediately
  document.cookie = `${SESSION_KEY}=; Max-Age=0; Path=/; SameSite=Strict`;
}

// ── Token helper ──────────────────────────────────────────────────────────────

async function getIdToken(forceRefresh = false): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken(forceRefresh);
}

// ── Authenticated fetch (auto-refresh on 401) ─────────────────────────────────

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const makeReq = async (token: string) =>
    fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${token}`,
        ...options.headers,
      },
    });

  let res = await makeReq(await getIdToken());

  // Token stale — refresh once and retry
  if (res.status === 401) {
    res = await makeReq(await getIdToken(true));
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── Login ─────────────────────────────────────────────────────────────────────

/**
 * Email/password sign-in:
 *   1. Firebase SDK → Firebase ID token
 *   2. POST /login  → backend verifies + creates Firestore session → custom token
 *   3. signInWithCustomToken → fresh ID token with role claim embedded
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  // Step 1 — Firebase SDK
  const { user: fbUser } = await signInWithEmailAndPassword(auth, email, password);
  const idToken = await fbUser.getIdToken();

  // Step 2 — Backend (no auth header needed — unauthenticated endpoint)
  const res = await fetch(`${API_BASE}/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ firebase_id_token: idToken }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? 'Login failed. Please check your credentials.');
  }

  const data = await res.json() as LoginResponse;

  // Step 3 — Exchange custom token so subsequent ID tokens carry role claim
  await signInWithCustomToken(auth, data.custom_token);

  saveSession(data.session_id);
  return data;
}

// ── Signup ─────────────────────────────────────────────────────────────────────

/**
 * Register a new admin user.
 *   1. Firebase SDK → Firebase ID token
 *   2. POST /signup → backend creates Firestore doc → custom token
 *   3. signInWithCustomToken → fresh ID token with role='admin'
 */
export async function signup(idToken: string, displayName: string): Promise<SignupResponse> {
  const res = await fetch(`${API_BASE}/signup`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      firebase_id_token: idToken,
      display_name:      displayName,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? 'Registration failed. Please try again.');
  }

  const data = await res.json() as SignupResponse;

  // Step 3 — Exchange custom token so subsequent ID tokens carry role claim
  await signInWithCustomToken(auth, data.custom_token);

  saveSession(data.session_id);
  return data;
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function logout(): Promise<void> {
  try {
    await apiFetch<{ message: string }>('/logout', {
      method: 'POST',
      body:   JSON.stringify({ session_id: getSessionId() }),
    });
  } finally {
    // Always clear local state even if backend call fails
    clearSession();
    await signOut(auth);
  }
}

export async function logoutAll(): Promise<void> {
  try {
    await apiFetch<{ message: string }>('/logout-all', { method: 'POST' });
  } finally {
    clearSession();
    await signOut(auth);
  }
}

// ── Session check — called on every app boot ──────────────────────────────────

/**
 * Verifies the Firestore session is still valid.
 * Never throws — always returns { active: bool }.
 */
export async function checkTokenActive(): Promise<TokenActiveResponse> {
  const user = auth.currentUser;
  if (!user) return { active: false, reason: 'No Firebase user signed in' };

  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`${API_BASE}/token-active`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ firebase_id_token: idToken }),
    });
    return res.json() as Promise<TokenActiveResponse>;
  } catch {
    return { active: false, reason: 'Network error during session check' };
  }
}

// ── Profile ───────────────────────────────────────────────────────────────────

export async function getMe(): Promise<BackendUser> {
  return apiFetch<BackendUser>('/me');
}

// ── Profile update ────────────────────────────────────────────────────────────

export async function updateProfile(displayName: string): Promise<BackendUser> {
  return apiFetch<BackendUser>('/me', {
    method: 'PATCH',
    body:   JSON.stringify({ display_name: displayName }),
  });
}

// ── Sessions list ─────────────────────────────────────────────────────────────

export async function getSessions(): Promise<SessionEntry[]> {
  return apiFetch<SessionEntry[]>('/sessions');
}

/** Revoke a single session by ID — does NOT sign out other devices. */
export async function revokeSession(sessionId: string): Promise<void> {
  await apiFetch<{ message: string }>(`/sessions/${sessionId}`, { method: 'DELETE' });
}

/** Admin: force-logout a specific user by UID — POST /auth/admin/logout/{uid} */
export async function forceLogoutUser(uid: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/admin/logout/${uid}`, { method: 'POST' });
}
