// src/lib/authService.ts
// All backend auth calls — Firebase SDK + Talk2Tables backend (Firestore).
// Fully typed to match backend schemas.py exactly.

import {
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
} from 'firebase/auth';
import { auth } from './firebaseConfig';
import { handleApiErrorSignal } from './errorHandler';

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

// ── Session storage ───────────────────────────────────────────────────────────
//
// We store the session ID + its expiry in localStorage rather than a cookie.
//
// Why localStorage instead of document.cookie?
//
// In Electron, the app is loaded via loadFile() which uses the file:// origin.
// Chromium does NOT reliably persist document.cookie with Max-Age for file://
// origins — cookies set on file:// are often treated as session-only and are
// discarded when the window closes, regardless of Max-Age. This caused the
// login state to be lost on every app restart.
//
// localStorage is reliably persisted to disk by Electron for file:// origins
// and survives window close/reopen as long as the userData path is stable
// (see main.ts where we pin userData to ~/.config/Talk2Tables on Linux).
//
// Security trade-offs vs. cookies:
//   • We lose SameSite CSRF protection — acceptable because Electron apps
//     don't receive cross-origin navigation requests the way a web browser does.
//   • The session ID is readable by page JS either way (no HttpOnly here),
//     so the XSS surface is unchanged.
//   • We manually enforce expiry via a stored timestamp (SESSION_MAX_AGE).

const SESSION_KEY     = 't2t_session_id';
const SESSION_EXP_KEY = 't2t_session_exp';
const SESSION_MAX_AGE = 28800; // seconds — 8 hours (matches backend session_expiry_seconds)

export function saveSession(id: string): void {
  const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;
  try {
    localStorage.setItem(SESSION_KEY, id);
    localStorage.setItem(SESSION_EXP_KEY, String(expiresAt));
  } catch {
    // localStorage unavailable (shouldn't happen in Electron, but guard anyway)
    console.warn('[auth] localStorage unavailable — session will not persist');
  }
}

function getSessionId(): string | null {
  try {
    const id  = localStorage.getItem(SESSION_KEY);
    const exp = localStorage.getItem(SESSION_EXP_KEY);
    if (!id) return null;
    // Treat as expired if past stored expiry
    if (exp && Date.now() > Number(exp)) {
      clearSession();
      return null;
    }
    return id;
  } catch {
    return null;
  }
}

/** Check if a backend session exists and hasn't locally expired. */
export function hasSession(): boolean {
  return !!getSessionId();
}

function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_EXP_KEY);
  } catch {
    // ignore
  }
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

  // Signal specific errors (413, 429) globally
  await handleApiErrorSignal(res);

  // Token stale — refresh once and retry
  if (res.status === 401) {
    res = await makeReq(await getIdToken(true));
    await handleApiErrorSignal(res);
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

  await handleApiErrorSignal(res);

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
export async function signup(idToken: string, displayName: string, organizationName: string): Promise<SignupResponse> {
  const res = await fetch(`${API_BASE}/signup`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      firebase_id_token: idToken,
      display_name:      displayName,
      organization_name: organizationName,
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
    await handleApiErrorSignal(res);
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
