import { getAccessToken } from './authService';

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace('/auth', '') ??
  'http://localhost:8000/api/v1';

async function getIdToken(): Promise<string> {
  const token = getAccessToken();
  if (!token) throw new Error('Not signed in');
  return token;
}

async function apiFetch<T>(path: string): Promise<T> {
  const token = await getIdToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface SchemaTableMeta {
  table:   string;
  schema:  string | null;
  columns: number;
}

export interface SchemaListResponse {
  connection_id: string;
  schemas:       Record<string, string[]>;   // tables grouped by schema name
  tables:        SchemaTableMeta[];
  table_count:   number;
  cached:        boolean;
  cached_at:     string | null;
}

export interface ColumnOut {
  column_name:      string;
  data_type:        string;
  is_nullable:      string;       // 'YES' | 'NO'
  column_default:   string | null;
  constraint_type:  string | null; // 'PRIMARY KEY' | 'FOREIGN KEY' | null
  referenced_table: string | null;
}

export interface TableDetailResponse {
  connection_id: string;
  schema:        string;
  table:         string;
  column_count:  number;
  columns:       ColumnOut[];
}

/** GET /api/v1/schema/{connection_id} */
export async function getSchema(connectionId: string): Promise<SchemaListResponse> {
  return apiFetch<SchemaListResponse>(`/schema/${connectionId}`);
}

/** GET /api/v1/schema/{connection_id}/{schema_name}/{table_name} */
export async function getTableDetail(
  connectionId: string,
  schemaName:   string,
  tableName:    string,
): Promise<TableDetailResponse> {
  return apiFetch<TableDetailResponse>(`/schema/${connectionId}/${schemaName}/${tableName}`);
}
