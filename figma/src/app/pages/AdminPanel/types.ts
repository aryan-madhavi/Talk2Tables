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

import { DatabaseConnection } from '../../types';

export function dbConnectionToForm(db: DatabaseConnection): ConnectionForm {
  return {
    name:       db.name,
    type:       db.type as DbType,
    host:       db.host,
    port:       DB_DEFAULTS[db.type as DbType]?.port ?? '',
    database:   '',          // not stored in DatabaseConnection — user fills if needed
    username:   '',          // same — not stored, user fills
    password:   '',
    ssl:        false,
    sqliteFile: null,
  };
}

// ─── Test Connection ───────────────────────────────────────────────────────────

export type TestStatus = 'idle' | 'testing' | 'success' | 'error';

// ─── Admin Tabs ────────────────────────────────────────────────────────────────

export type AdminTab = 'users' | 'audit' | 'databases' | 'stats';