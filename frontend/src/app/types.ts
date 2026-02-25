export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  avatarUrl: string;
}

export interface QueryEntry {
  id: string;
  query: string;
  sql: string;
  timestamp: string;
  database: string;
  type: 'SELECT' | 'UPDATE' | 'DELETE' | 'INSERT';
  status: 'success' | 'error';
  user: string;
}

export interface DatabaseConnection {
  id: string;
  name: string;
  host: string;
  type: 'PostgreSQL' | 'MySQL' | 'Oracle';
  status: 'active' | 'inactive';
}

export interface TableSchema {
  name: string;
  columns: {
    name: string;
    type: string;
    isKey?: boolean;
    isForeignKey?: boolean;
  }[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  user: string;
  timestamp: string;
  details: string;
  severity: 'info' | 'warning' | 'critical';
}
