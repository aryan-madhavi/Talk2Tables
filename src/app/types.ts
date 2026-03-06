// src/app/types.ts

// ── Auth ──────────────────────────────────────────────────────────────────────

/** User profile as returned by GET /api/v1/auth/me (lives in Firestore) */
export interface User {
  firebase_uid:   string;
  email:          string;
  display_name:   string | null;
  photo_url:      string | null;
  /** RBAC role — set by admin, never overwritten on login */
  role:           'admin' | 'power_user' | 'viewer';
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

export interface DatabaseConnection {
  id:     string;
  name:   string;
  host:   string;
  type:   'PostgreSQL' | 'MySQL' | 'Oracle';
  status: 'active' | 'inactive';
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