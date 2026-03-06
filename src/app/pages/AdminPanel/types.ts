// src/app/pages/AdminPanel/types.ts

// ─── DB Types ─────────────────────────────────────────────────────────────────

export type DbType = 'PostgreSQL' | 'MySQL' | 'Oracle' | 'SQLite';

export interface DbTypeConfig {
  port: string;
  icon: string;
  color: string;
}

export const DB_DEFAULTS: Record<DbType, DbTypeConfig> = {
  PostgreSQL: { port: '5432', icon: '🐘', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  MySQL:      { port: '3306', icon: '🐬', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  Oracle:     { port: '1521', icon: '🔴', color: 'bg-red-50 text-red-700 border-red-200' },
  SQLite:     { port: '',     icon: '📦', color: 'bg-gray-50 text-gray-700 border-gray-200' },
};

// ─── Connection Form ───────────────────────────────────────────────────────────

export interface ConnectionForm {
  name:       string;
  type:       DbType;
  host:       string;
  port:       string;
  database:   string;
  username:   string;
  password:   string;
  ssl:        boolean;
  // SQLite-specific
  sqliteFile: File | null;
}

export const EMPTY_CONNECTION_FORM: ConnectionForm = {
  name:       '',
  type:       'PostgreSQL',
  host:       '',
  port:       '5432',
  database:   '',
  username:   '',
  password:   '',
  ssl:        false,
  sqliteFile: null,
};

export type ConnectionFormErrors = Partial<Record<keyof ConnectionForm, string>>;

// ─── Mapper: DatabaseConnection → ConnectionForm ───────────────────────────────
// Used when opening the dialog in "edit / configure" mode from an existing DB card.
// DatabaseConnection now carries the full backend shape (connection_id, database_name,
// username, port, ssl_enabled) so we pre-fill all fields instead of leaving them blank.

import { DatabaseConnection } from '../../types';

/** Map backend db_type (lowercase) → form DbType (display label) */
const BACKEND_TYPE_TO_FORM: Record<string, DbType> = {
  postgresql: 'PostgreSQL',
  mysql:      'MySQL',
  oracle:     'Oracle',
  sqlite:     'SQLite',
};

export function dbConnectionToForm(db: DatabaseConnection): ConnectionForm {
  // db.type is already the display label ('PostgreSQL') set by toUiConnection()
  // db.db_type is the raw backend value ('postgresql') — prefer display label
  const formType: DbType =
    (DB_DEFAULTS[db.type as DbType] ? db.type as DbType : null) ??
    BACKEND_TYPE_TO_FORM[db.db_type] ??
    'PostgreSQL';

  return {
    name:       db.name,
    type:       formType,
    host:       db.host,
    port:       String(db.port) || DB_DEFAULTS[formType]?.port || '',
    database:   db.database_name,   // ✅ pre-filled from backend
    username:   db.username,        // ✅ pre-filled from backend
    password:   '',                 // never returned by API — user types new one if changing
    ssl:        db.ssl_enabled,     // ✅ pre-filled from backend
    sqliteFile: null,
  };
}

// ─── Test Connection ───────────────────────────────────────────────────────────

export type TestStatus = 'idle' | 'testing' | 'success' | 'error';

// ─── Admin Tabs ────────────────────────────────────────────────────────────────

export type AdminTab = 'users' | 'audit' | 'databases' | 'stats';