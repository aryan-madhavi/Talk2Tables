// src/app/types.ts

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface User {
  firebase_uid:   string;
  email:          string;
  display_name:   string | null;
  photo_url:      string | null;
  role:           'admin' | 'db_manager' | 'power_user' | 'analyst';
  is_active:      boolean;
  email_verified: boolean;
  created_at?:    string;
  last_login_at?: string;
}

export interface Session {
  session_id:   string;
  device_info:  string | null;
  ip_address:   string | null;
  is_revoked:   boolean;
  created_at:   string | null;
  last_seen_at: string | null;
  expires_at:   string | null;
}

// ── Query history ─────────────────────────────────────────────────────────────

export interface QueryEntry {
  id:        string;
  query:     string;
  sql:       string;
  timestamp: string;
  database:  string;
  type:      'SELECT' | 'UPDATE' | 'DELETE' | 'INSERT';
  status:    'success' | 'error';
  user:      string;
}

// ── Database connections ──────────────────────────────────────────────────────

/**
 * Full connection shape — mirrors backend ConnectionOut.
 * password / password_enc are NEVER present (stripped by backend).
 *
 * UI-only convenience fields (id, type, status) are derived by
 * toUiConnection() in DatabasesTab and kept for backwards-compat.
 */
export interface DatabaseConnection {
  // ── Backend fields (ConnectionOut) ──
  connection_id:  string;
  name:           string;
  db_type:        string;         // raw backend: 'postgresql' | 'mysql' | 'oracle' | 'sqlite'
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

  // ── UI aliases (set by toUiConnection, kept for legacy components) ──
  id:     string;                 // === connection_id
  type:   string;                 // display label e.g. 'PostgreSQL'
  status: 'active' | 'inactive'; // derived from is_active
}

// ── Schema browser ────────────────────────────────────────────────────────────

export interface TableSchema {
  name:    string;
  columns: {
    name:          string;
    type:          string;
    isKey?:        boolean;
    isForeignKey?: boolean;
  }[];
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id:        string;
  action:    string;
  user:      string;
  timestamp: string;
  details:   string;
  severity:  'info' | 'warning' | 'critical';
}

// --------- ELECTRON --------------
export interface IElectronAPI {
  sendMessageToMain: (message: string) => void;
  onReplyFromMain: (callback: (event: any, response: string) => void) => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}