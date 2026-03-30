import { User, QueryEntry, DatabaseConnection, TableSchema, AuditLogEntry } from '../types';

export const currentUser: User = {
  id: 'u1',
  name: 'Sahil Gangani',
  email: 'sahilgangani@email.com',
  role: 'admin',
  avatarUrl: 'https://img.icons8.com/?size=100&id=fUUEbUbXhzOA&format=png&color=000000'
};

export const databases: DatabaseConnection[] = [
  { id: 'db1', name: 'Plant Instrumentation DB', host: '10.0.0.15', type: 'PostgreSQL', status: 'active' },
  { id: 'db2', name: 'HR & Payroll', host: '10.0.0.22', type: 'Oracle', status: 'active' },
  { id: 'db3', name: 'Legacy Inventory', host: '192.168.1.50', type: 'MySQL', status: 'inactive' },
];

export const queryHistory: QueryEntry[] = [
  {
    id: 'q1',
    query: 'Show sensors due for calibration',
    sql: "SELECT * FROM sensors WHERE calibration_date < CURRENT_DATE - INTERVAL '1 year';",
    timestamp: '2023-10-25T09:15:00',
    database: 'Plant Instrumentation DB',
    type: 'SELECT',
    status: 'success',
    user: 'Sahil Gangani'
  },
  {
    id: 'q2',
    query: 'List all active equipment',
    sql: "SELECT * FROM equipment WHERE status = 'active';",
    timestamp: '2023-10-25T08:30:00',
    database: 'Plant Instrumentation DB',
    type: 'SELECT',
    status: 'success',
    user: 'Sahil Gangani'
  },
  {
    id: 'q3',
    query: 'Update sensor #405 status to maintenance',
    sql: "UPDATE sensors SET status = 'maintenance' WHERE id = 405;",
    timestamp: '2023-10-24T16:45:00',
    database: 'Plant Instrumentation DB',
    type: 'UPDATE',
    status: 'success',
    user: 'Sahil Gangani'
  }
];

export const tableSchemas: TableSchema[] = [
  {
    name: 'sensors',
    columns: [
      { name: 'id', type: 'INTEGER', isKey: true },
      { name: 'name', type: 'VARCHAR(255)' },
      { name: 'location', type: 'VARCHAR(100)' },
      { name: 'status', type: 'VARCHAR(50)' },
      { name: 'calibration_date', type: 'DATE' },
      { name: 'last_reading', type: 'FLOAT' }
    ]
  },
  {
    name: 'equipment',
    columns: [
      { name: 'id', type: 'INTEGER', isKey: true },
      { name: 'model', type: 'VARCHAR(255)' },
      { name: 'manufacturer', type: 'VARCHAR(255)' },
      { name: 'purchase_date', type: 'DATE' },
      { name: 'warranty_expiry', type: 'DATE' }
    ]
  }
];

export const auditLogs: AuditLogEntry[] = [
  { id: 'l1', action: 'Query Execution', user: 'Sahil Gangani', timestamp: '2023-10-25T09:15:00', details: 'Executed SELECT on sensors', severity: 'info' },
  { id: 'l2', action: 'Data Update', user: 'Sahil Gangani', timestamp: '2023-10-24T16:45:00', details: 'Updated sensor #405', severity: 'warning' },
  { id: 'l3', action: 'Login Failed', user: 'admin', timestamp: '2023-10-24T10:00:00', details: 'Invalid password attempt', severity: 'critical' },
];
