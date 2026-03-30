// src/app/pages/AdminPanel/types.ts

// ─── DB Types ─────────────────────────────────────────────────────────────────

export type DbType = 'PostgreSQL' | 'MySQL' | 'Oracle' | 'MSSQL';

export interface DbTypeConfig {
  port:  string;
  icon:  string;
  color: string;
}

export const DB_DEFAULTS: Record<DbType, DbTypeConfig> = {
  PostgreSQL: { port: '5432', icon: '🐘', color: 'bg-blue-50 text-blue-700 border-blue-200'   },
  MySQL:      { port: '3306', icon: '🐬', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  Oracle:     { port: '1521', icon: '🔴', color: 'bg-red-50 text-red-700 border-red-200'      },
  MSSQL:      { port: '1433', icon: '🔷', color: 'bg-sky-50 text-sky-700 border-sky-200'      },
};

// ─── Connection Form ───────────────────────────────────────────────────────────

export interface ConnectionForm {
  name:     string;
  type:     DbType;
  host:     string;
  port:     string;
  database: string;
  username: string;
  password: string;
  ssl:      boolean;
}

export const EMPTY_CONNECTION_FORM: ConnectionForm = {
  name:     '',
  type:     'PostgreSQL',
  host:     '',
  port:     '5432',
  database: '',
  username: '',
  password: '',
  ssl:      false,
};

export type ConnectionFormErrors = Partial<Record<keyof ConnectionForm, string>>;

// ─── Mapper: DatabaseConnection → ConnectionForm ───────────────────────────────

import { DatabaseConnection } from '../../types';

/** Map backend db_type (lowercase) → form DbType (display label) */
const BACKEND_TYPE_TO_FORM: Record<string, DbType> = {
  postgresql: 'PostgreSQL',
  mysql:      'MySQL',
  oracle:     'Oracle',
  mssql:      'MSSQL',
};

export function dbConnectionToForm(db: DatabaseConnection): ConnectionForm {
  const formType: DbType =
    (DB_DEFAULTS[db.type as DbType] ? db.type as DbType : null) ??
    BACKEND_TYPE_TO_FORM[db.db_type] ??
    'PostgreSQL';

  return {
    name:     db.name,
    type:     formType,
    host:     db.host,
    port:     String(db.port) || DB_DEFAULTS[formType]?.port || '',
    database: db.database_name,
    username: db.username,
    password: '',
    ssl:      db.ssl_enabled,
  };
}

// ─── Test Connection ───────────────────────────────────────────────────────────

export type TestStatus = 'idle' | 'testing' | 'success' | 'error';

// ─── Admin Tabs ────────────────────────────────────────────────────────────────

export type AdminTab = 'users' | 'audit' | 'databases' | 'stats';
