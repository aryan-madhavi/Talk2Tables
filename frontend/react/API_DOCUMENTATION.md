# Talk2Tables — API Documentation
**Version:** 2.0.0
**Base URL:** `http://localhost:8000`
**Swagger UI:** `http://localhost:8000/docs`
**Last updated:** 2026-03-09

---

## Authentication

All endpoints (except `/health` and `/`) require a Firebase ID token in the `Authorization` header.

```
Authorization: Bearer <firebase_id_token>
```

### How to get a token (frontend flow)
1. User signs in via Firebase SDK (email/password, Google, etc.)
2. Firebase SDK returns an **ID token**
3. Send the ID token to `POST /api/v1/auth/login`
4. Server returns a **custom token** with your role embedded
5. Exchange custom token via Firebase SDK → get a **fresh ID token with role claim**
6. Use that fresh ID token as `Bearer` on all subsequent requests

### RBAC Roles (ascending privilege)
| Role | Level | Can do |
|---|---|---|
| `analyst` | 0 | SELECT queries on assigned DBs only |
| `power_user` | 1 | SELECT + write queries on assigned DBs |
| `db_manager` | 2 | Manage connections + access grants |
| `admin` | 3 | Full control, bypasses all access grant checks |

---

## Global Response Formats

### Success
```json
{ ...endpoint specific fields... }
```

### Validation Error (422)
```json
{
  "detail": [
    { "loc": ["body", "field_name"], "msg": "error description", "type": "value_error" }
  ]
}
```

### Auth Error (401 / 403)
```json
{ "detail": "Could not validate credentials." }
{ "detail": "Insufficient permissions. Required role: db_manager" }
```

### Not Found (404)
```json
{ "detail": "Connection 'abc-123' not found." }
```

### Server Error (500)
```json
{ "error": "Internal Server Error", "message": "An unexpected error occurred.", "path": "/api/v1/..." }
```

---

---

# Module 1 — Authentication
**Base path:** `/api/v1/auth`
**Tag:** Auth

---

## POST `/api/v1/auth/login`
Verify a Firebase ID token and return a custom token with the user's role claim embedded.
**Auth required:** No

### Request Body
```json
{ "id_token": "eyJhbGci..." }
```
| Field | Type | Required | Description |
|---|---|---|---|
| `id_token` | string | yes | Firebase ID token from Firebase SDK sign-in |

### Response `200 OK`
```json
{
  "custom_token": "eyJhbGci...",
  "firebase_uid": "Rf0dRxw6uscv6kEbvdqRKScvMmN2",
  "role": "admin",
  "email": "user@example.com",
  "display_name": "John Doe"
}
```
| Field | Type | Description |
|---|---|---|
| `custom_token` | string | Exchange this via Firebase SDK to get a fresh ID token with role claim |
| `firebase_uid` | string | User's Firebase UID |
| `role` | string | `analyst` \| `power_user` \| `db_manager` \| `admin` |
| `email` | string | User email |
| `display_name` | string | User display name |

### Error Responses
| Code | Reason |
|---|---|
| 401 | Invalid or expired ID token |
| 403 | User account is deactivated |

---

## POST `/api/v1/auth/register`
Same as login — Firebase SDK handles signup client-side. Call this after the user creates an account to register them in Firestore with default role `analyst`.
**Auth required:** No

### Request Body
```json
{ "id_token": "eyJhbGci..." }
```

### Response `200 OK`
Same as `/login`.

---

## GET `/api/v1/auth/me`
Get the current authenticated user's profile.
**Auth required:** Any authenticated user

### Request
No body. Token in `Authorization` header.

### Response `200 OK`
```json
{
  "firebase_uid": "Rf0dRxw6uscv6kEbvdqRKScvMmN2",
  "email": "user@example.com",
  "display_name": "John Doe",
  "role": "admin",
  "is_active": true,
  "created_at": "2026-01-15T10:30:00+00:00"
}
```

---

## POST `/api/v1/auth/token-active`
Check if the current token and Firestore session are valid (used by frontend to detect session expiry).
**Auth required:** Any authenticated user

### Response `200 OK`
```json
{ "active": true, "firebase_uid": "Rf0dRxw6uscv6kEbvdqRKScvMmN2", "role": "admin" }
```

---

## POST `/api/v1/auth/logout`
Revoke the current session.
**Auth required:** Any authenticated user

### Response `200 OK`
```json
{ "message": "Logged out successfully." }
```

---

## POST `/api/v1/auth/logout-all`
Revoke ALL active sessions for the current user (across all devices).
**Auth required:** Any authenticated user

### Response `200 OK`
```json
{ "message": "All sessions revoked." }
```

---

## GET `/api/v1/auth/sessions`
List all active sessions for the current user.
**Auth required:** Any authenticated user

### Response `200 OK`
```json
{
  "sessions": [
    {
      "session_id": "abc-123",
      "created_at": "2026-03-09T10:00:00+00:00",
      "last_used": "2026-03-09T21:00:00+00:00"
    }
  ],
  "total": 1
}
```

---

---

# Module 2 — Database Connections
**Base path:** `/api/v1/connections`
**Tag:** Database Connections
**Minimum role:** `db_manager` (except DELETE which requires `admin`)

---

## POST `/api/v1/connections`
Register a new database connection. Password is AES-256-GCM encrypted before storage.
**Role:** `db_manager+`

### Request Body
```json
{
  "name": "Production PostgreSQL",
  "db_type": "postgresql",
  "host": "db.example.com",
  "port": 5432,
  "database_name": "analytics",
  "username": "readonly_user",
  "password": "my_secret_password",
  "ssl_enabled": false,
  "description": "Read-only replica for analysts"
}
```
| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Human-readable label (1–100 chars) |
| `db_type` | string | yes | `postgresql` \| `mysql` \| `mssql` \| `oracle` \| `sqlite` |
| `host` | string | yes | Hostname or IP (auto lowercased/trimmed) |
| `port` | integer | yes | 1–65535 |
| `database_name` | string | yes | Target schema/database |
| `username` | string | yes | DB login username |
| `password` | string | yes | Plaintext — encrypted by server, never stored raw |
| `ssl_enabled` | boolean | no | Default: `false` |
| `description` | string | no | Admin notes (max 500 chars) |

### Response `201 Created`
```json
{
  "connection_id": "763cb64b-8ced-44fa-a76b-17cf9b009318",
  "name": "Production PostgreSQL",
  "db_type": "postgresql",
  "host": "db.example.com",
  "port": 5432,
  "database_name": "analytics",
  "username": "readonly_user",
  "ssl_enabled": false,
  "is_active": true,
  "description": "Read-only replica for analysts",
  "created_by_uid": "Rf0dRxw6uscv6kEbvdqRKScvMmN2",
  "created_at": "2026-03-09T10:00:00+00:00",
  "updated_at": "2026-03-09T10:00:00+00:00",
  "last_tested_at": null,
  "last_tested_ok": null
}
```
> `password` and `password_enc` are **never** returned in any response.

---

## GET `/api/v1/connections`
List all registered connections.
**Role:** `db_manager+`

### Query Parameters
| Param | Type | Default | Description |
|---|---|---|---|
| `active_only` | boolean | `false` | If `true`, return only active connections |

### Response `200 OK`
```json
{
  "connections": [ { ...ConnectionOut... }, ... ],
  "total": 3
}
```

---

## GET `/api/v1/connections/{connection_id}`
Get a single connection by ID.
**Role:** `db_manager+`

### Path Parameters
| Param | Description |
|---|---|
| `connection_id` | UUID of the connection |

### Response `200 OK`
```json
{
  "connection_id": "763cb64b-...",
  "name": "Production PostgreSQL",
  "db_type": "postgresql",
  "host": "db.example.com",
  "port": 5432,
  "database_name": "analytics",
  "username": "readonly_user",
  "ssl_enabled": false,
  "is_active": true,
  "description": "...",
  "created_by_uid": "Rf0dRxw6...",
  "created_at": "2026-03-09T10:00:00+00:00",
  "updated_at": "2026-03-09T10:00:00+00:00",
  "last_tested_at": "2026-03-09T12:00:00+00:00",
  "last_tested_ok": true
}
```

---

## PATCH `/api/v1/connections/{connection_id}`
Partial update. Only provided fields are changed. Providing `password` re-encrypts it.
**Role:** `db_manager+`

### Request Body (all fields optional)
```json
{
  "name": "New Name",
  "host": "new-host.example.com",
  "port": 5433,
  "database_name": "new_db",
  "username": "new_user",
  "password": "new_password",
  "ssl_enabled": true,
  "description": "Updated notes",
  "is_active": true
}
```

### Response `200 OK`
Updated `ConnectionOut` object.

---

## DELETE `/api/v1/connections/{connection_id}`
Permanently delete a connection. Consider using `/deactivate` instead to preserve audit history.
**Role:** `admin` only

### Response `200 OK`
```json
{ "message": "Connection '763cb64b-...' permanently deleted." }
```

---

## POST `/api/v1/connections/{connection_id}/test`
Open a real connection to the target database and run `SELECT 1`.
Updates `last_tested_at` and `last_tested_ok` on the connection document.
**Role:** `db_manager+`

### Response `200 OK` (always 200, even on DB failure)
```json
{ "ok": true, "message": "Connection successful." }
```
```json
{ "ok": false, "message": "could not translate host name \"db.example.com\" to address" }
```
| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` if DB accepted the connection |
| `message` | string | Success message or first line of the error |

---

## PATCH `/api/v1/connections/{connection_id}/activate`
Re-enable a disabled connection.
**Role:** `db_manager+`

### Response `200 OK`
Updated `ConnectionOut` object with `is_active: true`.

---

## PATCH `/api/v1/connections/{connection_id}/deactivate`
Disable a connection. Users with access grants to it will get 403 on queries until re-activated.
**Role:** `db_manager+`

### Response `200 OK`
Updated `ConnectionOut` object with `is_active: false`.

---

## GET `/api/v1/connections/{connection_id}/audits`
List query audit logs for a specific connection. Returns newest first.
**Role:** `db_manager+`

### Query Parameters
| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | `50` | Max records to return |

### Response `200 OK`
```json
{
  "connection_id": "763cb64b-...",
  "audits": [
    {
      "audit_id": "e24bc6c8-...",
      "firebase_uid": "Rf0dRxw6...",
      "connection_id": "763cb64b-...",
      "chat_id": "5cacb874-...",
      "sql_query": "SELECT * FROM public.sensors LIMIT 1000",
      "summary": "All sensors retrieved",
      "row_count": 100,
      "execution_time_ms": 125.3,
      "status": "results",
      "error_message": null,
      "created_at": "2026-03-09T21:33:00+00:00"
    }
  ]
}
```
| Field | Type | Description |
|---|---|---|
| `status` | string | `"results"` on success, `"error"` on failure |
| `row_count` | integer | Number of rows the query returned |
| `execution_time_ms` | float | SQL execution time only (excludes LLM time) |

---

## POST `/api/v1/connections/{connection_id}/schema/refresh`
Force-delete the Firestore schema cache for this connection.
The next query will re-fetch schema from the live DB and re-cache it.
Use after DDL changes (new tables, renamed columns, added indexes, etc.).
**Role:** `db_manager+`

### Response `200 OK`
```json
{ "message": "Schema cache cleared for connection '763cb64b-...'." }
```

---

---

# Module 3 — Users
**Base path:** `/api/v1/users`
**Tag:** Users
**Minimum role:** `db_manager` (read), `admin` (write)

---

## POST `/api/v1/users`
Create a new user account. New users default to role `analyst`.
**Role:** `admin`

### Request Body
```json
{
  "email": "newuser@example.com",
  "display_name": "Jane Smith",
  "password": "InitialPassword123",
  "role": "analyst"
}
```

### Response `201 Created`
```json
{
  "firebase_uid": "newUid123",
  "email": "newuser@example.com",
  "display_name": "Jane Smith",
  "role": "analyst",
  "is_active": true,
  "created_at": "2026-03-09T10:00:00+00:00"
}
```

---

## GET `/api/v1/users`
List all users.
**Role:** `db_manager+`

### Query Parameters
| Param | Type | Default | Description |
|---|---|---|---|
| `active_only` | boolean | `false` | Only return active accounts |

### Response `200 OK`
```json
{
  "users": [ { ...UserOut... } ],
  "total": 12
}
```

---

## GET `/api/v1/users/{uid}`
Get a single user profile.
**Role:** `db_manager+`

### Response `200 OK`
```json
{
  "firebase_uid": "Rf0dRxw6...",
  "email": "user@example.com",
  "display_name": "John Doe",
  "role": "analyst",
  "is_active": true,
  "created_at": "2026-01-15T10:30:00+00:00",
  "updated_at": "2026-03-01T09:00:00+00:00"
}
```

---

## PATCH `/api/v1/users/{uid}`
Update display name or active status.
**Role:** `admin`

### Request Body (all optional)
```json
{ "display_name": "New Name", "is_active": true }
```

### Response `200 OK`
Updated `UserOut` object.

---

## PATCH `/api/v1/users/{uid}/role`
Change a user's role. Admins cannot demote themselves.
**Role:** `admin`

### Request Body
```json
{ "role": "power_user" }
```
`role` must be one of: `analyst`, `power_user`, `db_manager`, `admin`

### Response `200 OK`
Updated `UserOut` object.

### Error `400`
```json
{ "detail": "Admins cannot change their own role." }
```

---

## PATCH `/api/v1/users/{uid}/activate`
Re-enable a deactivated user account.
**Role:** `admin`

### Response `200 OK`
Updated `UserOut` with `is_active: true`.

---

## PATCH `/api/v1/users/{uid}/deactivate`
Disable a user account. Admins cannot deactivate themselves.
**Role:** `admin`

### Response `200 OK`
Updated `UserOut` with `is_active: false`.

---

## DELETE `/api/v1/users/{uid}`
Hard-delete a user from Firebase Auth and Firestore. Prefer `/deactivate` to preserve history.
**Role:** `admin`

### Response `200 OK`
```json
{ "message": "User 'Rf0dRxw6...' deleted." }
```

---

---

# Module 4 — Access Grants
**Base path:** `/api/v1/access-grants`
**Tag:** DB Access Grants

---

## GET `/api/v1/access-grants/my/connections`
List all databases the **current user** has been granted access to, with full connection details.
**Role:** `analyst+` (any authenticated user — own data only)

### Response `200 OK`
```json
{
  "connections": [
    {
      "grant": {
        "access_id": "abc-123",
        "permission": "read",
        "granted_at": "2026-03-01T10:00:00+00:00",
        "expires_at": null
      },
      "connection": {
        "connection_id": "763cb64b-...",
        "name": "Production PostgreSQL",
        "db_type": "postgresql",
        "host": "db.example.com",
        "port": 5432,
        "database_name": "analytics",
        "is_active": true,
        ...
      }
    }
  ],
  "total": 2
}
```
> Password is never included in `connection`.

---

## POST `/api/v1/access-grants`
Grant a user access to a database connection.
**Role:** `db_manager+`

### Request Body
```json
{
  "firebase_uid": "targetUserUid123",
  "connection_id": "763cb64b-...",
  "permission": "read",
  "expires_at": "2026-12-31T23:59:59+00:00",
  "note": "Temporary access for Q4 analysis"
}
```
| Field | Type | Required | Description |
|---|---|---|---|
| `firebase_uid` | string | yes | UID of the user to grant access to |
| `connection_id` | string | yes | Connection UUID |
| `permission` | string | yes | `"read"` or `"write"` |
| `expires_at` | string (ISO 8601) | no | Grant expiry. `null` = never expires |
| `note` | string | no | Admin notes (max 500 chars) |

### Response `201 Created`
```json
{
  "access_id": "grant-uuid-here",
  "firebase_uid": "targetUserUid123",
  "connection_id": "763cb64b-...",
  "granted_by_uid": "Rf0dRxw6...",
  "permission": "read",
  "is_active": true,
  "granted_at": "2026-03-09T10:00:00+00:00",
  "revoked_at": null,
  "expires_at": "2026-12-31T23:59:59+00:00",
  "note": "Temporary access for Q4 analysis"
}
```

### Error `409 Conflict`
```json
{ "detail": "User 'targetUserUid123' already has an active grant for connection '763cb64b-...'." }
```

---

## GET `/api/v1/access-grants`
List access grants, filtered by user or connection.
**Role:** `db_manager+`

### Query Parameters
| Param | Type | Description |
|---|---|---|
| `uid` | string | Filter by user UID — returns all DBs that user can access |
| `connection_id` | string | Filter by connection — returns all users on that DB |
| `active_only` | boolean | Default `true`. Set `false` to include revoked/expired grants |

> At least one of `uid` or `connection_id` is required.

### Response `200 OK`
```json
{
  "grants": [ { ...AccessGrantOut... } ],
  "total": 5
}
```

---

## GET `/api/v1/access-grants/{access_id}`
Get a single grant by its ID.
**Role:** `db_manager+`

### Response `200 OK`
`AccessGrantOut` object.

---

## PATCH `/api/v1/access-grants/{access_id}`
Update permission, expiry, or note on an existing grant.
**Role:** `db_manager+`

### Request Body (all optional)
```json
{
  "permission": "write",
  "expires_at": "2027-01-01T00:00:00+00:00",
  "note": "Upgraded to write access"
}
```

### Response `200 OK`
Updated `AccessGrantOut` object.

---

## PATCH `/api/v1/access-grants/{access_id}/revoke`
Revoke a user's access. Sets `is_active: false` immediately.
Redis cache is invalidated instantly — user is blocked on their very next query.
**Role:** `db_manager+`

### Response `200 OK`
```json
{
  "access_id": "grant-uuid",
  "is_active": false,
  "revoked_at": "2026-03-09T15:30:00+00:00",
  ...
}
```

---

---

# Module 5 — Query (AI Agent)
**Base path:** `/api/v1`
**Tag:** Query
**Minimum role:** `analyst`

---

## POST `/api/v1/query`
Convert a natural language question to SQL, execute it, and return structured results.
DB credentials are fetched server-side from Firestore — never pass credentials in the request.
**Role:** `analyst+`

### Request Body
```json
{
  "connection_id": "763cb64b-8ced-44fa-a76b-17cf9b009318",
  "chat_input": "Show all sensors due for calibration this month",
  "chat_id": "5cacb874-5d6d-4331-b73c-780756d7b4ba"
}
```
| Field | Type | Required | Description |
|---|---|---|---|
| `connection_id` | string | yes | UUID of the target database connection |
| `chat_input` | string | yes | Natural language query (1–2000 chars) |
| `chat_id` | string | no | Continue an existing chat. Omit to start a new chat |

### Response `200 OK` — Success
```json
{
  "response_type": "results",
  "chat_id": "5cacb874-5d6d-4331-b73c-780756d7b4ba",
  "data": [
    {
      "sql_query": "SELECT sensor_id, sensor_name, next_calibration FROM public.sensors WHERE next_calibration <= CURRENT_DATE + INTERVAL '30 days' AND status = 'Active' LIMIT 1000",
      "summary": "Found 23 active sensors due for calibration within the next 30 days.",
      "total_records": 23,
      "numerical_insights": {
        "total_records": 23,
        "aggregations": {
          "overdue": 5,
          "due_this_week": 8,
          "due_this_month": 10
        }
      },
      "data": [
        { "sensor_id": 1, "sensor_name": "Temp Sensor A", "next_calibration": "2026-03-10" },
        { "sensor_id": 2, "sensor_name": "Pressure Gauge B", "next_calibration": "2026-03-15" }
      ]
    }
  ]
}
```

### Response `200 OK` — Error (agent or DB failure)
```json
{
  "response_type": "error",
  "chat_id": "5cacb874-...",
  "data": [
    { "error_message": "Could not load database connection: Connection '763cb64b-...' not found." }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `response_type` | string | `"results"` or `"error"` |
| `chat_id` | string | Use this in subsequent requests to continue the conversation |
| `data` | array | Always an array with one object. Access result as `response.data[0]` |
| `data[0].sql_query` | string | The exact SQL that was executed |
| `data[0].summary` | string | 1–2 sentence plain English explanation |
| `data[0].total_records` | integer | Number of rows returned |
| `data[0].numerical_insights` | object | `{ total_records, aggregations: { key: value } }` |
| `data[0].data` | array | Full result rows as array of objects |
| `data[0].error_message` | string | Set only when `response_type` is `"error"` |

> **Note:** `data[0].data` is capped at **10,000 rows**.
> `chat_id` is returned even on error — always pass it back to continue the same chat session.

### Error Responses
| Code | Reason |
|---|---|
| 403 | No active access grant for this connection (analyst/power_user only) |
| 500 | Agent infrastructure failure (LLM unreachable, Firestore down, etc.) |

---

## GET `/api/v1/schema/{connection_id}`
List all tables in a database connection. Uses Firestore schema cache (1h TTL).
**Role:** `analyst+` (access grant required for analyst/power_user; bypassed for db_manager/admin)

### Path Parameters
| Param | Description |
|---|---|
| `connection_id` | UUID of the connection |

### Response `200 OK`
```json
{
  "connection_id": "763cb64b-...",
  "tables": [
    { "table": "sensors", "schema": "public", "columns": 12 },
    { "table": "machines", "schema": "public", "columns": 8 },
    { "table": "maintenance_logs", "schema": "public", "columns": 15 }
  ],
  "table_count": 3
}
```

---

## GET `/api/v1/schema/{connection_id}/{schema_name}/{table_name}`
Get column definitions for a specific table. Uses Firestore schema cache (1h TTL).
**Role:** `analyst+` (access grant required for analyst/power_user)

### Path Parameters
| Param | Description |
|---|---|
| `connection_id` | UUID of the connection |
| `schema_name` | Schema name (e.g. `public`, `dbo`, `mydb`) |
| `table_name` | Table name (e.g. `sensors`) |

### Response `200 OK`
```json
{
  "connection_id": "763cb64b-...",
  "schema": "public",
  "table": "sensors",
  "column_count": 12,
  "columns": [
    {
      "column_name": "sensor_id",
      "data_type": "INTEGER",
      "is_nullable": "NO",
      "column_default": "nextval('sensors_sensor_id_seq')",
      "constraint_type": "PRIMARY KEY",
      "referenced_table": null
    },
    {
      "column_name": "machine_id",
      "data_type": "INTEGER",
      "is_nullable": "YES",
      "column_default": null,
      "constraint_type": null,
      "referenced_table": "public.machines.machine_id"
    },
    {
      "column_name": "sensor_name",
      "data_type": "VARCHAR(100)",
      "is_nullable": "NO",
      "column_default": null,
      "constraint_type": null,
      "referenced_table": null
    }
  ]
}
```

---

---

# Module 6 — Chat & Workspaces
**Base path:** `/api/v1/chat`
**Tag:** Chat & Workspaces
**Role:** `analyst+` — users can only access **their own** chats

---

## GET `/api/v1/chat/recent`
Last 5 most recently updated chats across ALL workspaces for the current user.
**Role:** `analyst+`

### Response `200 OK`
```json
{
  "chats": [
    {
      "chat_id": "5cacb874-...",
      "title": "Show all sensors due for calibration",
      "connection_id": "763cb64b-...",
      "msg_count": 6,
      "created_at": "2026-03-09T20:00:00+00:00",
      "updated_at": "2026-03-09T21:51:00+00:00"
    }
  ],
  "total": 5
}
```

> Requires Firestore index: collection group `chats` — `firebase_uid ASC` + `updated_at DESC`

---

## GET `/api/v1/chat/workspaces`
List all workspaces for the current user. Each workspace = one DB connection the user has queried.
**Role:** `analyst+`

### Response `200 OK`
```json
{
  "workspaces": [
    {
      "connection_id": "763cb64b-...",
      "connection_name": "Production PostgreSQL",
      "created_at": "2026-03-01T10:00:00+00:00"
    }
  ],
  "total": 2
}
```

---

## GET `/api/v1/chat/workspaces/{connection_id}/chats`
List all chats in a specific workspace, newest first.
**Role:** `analyst+`

### Path Parameters
| Param | Description |
|---|---|
| `connection_id` | UUID of the database connection |

### Response `200 OK`
```json
{
  "connection_id": "763cb64b-...",
  "chats": [
    {
      "chat_id": "5cacb874-...",
      "title": "Show all sensors due for calibration",
      "connection_id": "763cb64b-...",
      "msg_count": 6,
      "created_at": "2026-03-09T20:00:00+00:00",
      "updated_at": "2026-03-09T21:51:00+00:00"
    }
  ],
  "total": 3
}
```

---

## GET `/api/v1/chat/workspaces/{connection_id}/chats/{chat_id}/messages`
Get all messages in a chat, ordered by sequence number (oldest first).
**Role:** `analyst+`

### Path Parameters
| Param | Description |
|---|---|
| `connection_id` | UUID of the database connection |
| `chat_id` | UUID of the chat |

### Response `200 OK`
```json
{
  "chat_id": "5cacb874-...",
  "connection_id": "763cb64b-...",
  "total": 4,
  "messages": [
    {
      "msg_id": "0001",
      "seq": 1,
      "role": "user",
      "content": "Show all sensors due for calibration",
      "sql_query": null,
      "summary": null,
      "total_records": null,
      "numerical_insights": null,
      "data": null,
      "error_message": null,
      "created_at": "2026-03-09T20:00:00+00:00"
    },
    {
      "msg_id": "0002",
      "seq": 2,
      "role": "assistant",
      "content": "Found 23 active sensors due for calibration within 30 days.",
      "sql_query": "SELECT * FROM public.sensors WHERE next_calibration <= CURRENT_DATE + INTERVAL '30 days' LIMIT 1000",
      "summary": "Found 23 active sensors due for calibration within 30 days.",
      "total_records": 23,
      "numerical_insights": {
        "total_records": 23,
        "aggregations": { "overdue": 5 }
      },
      "data": [
        { "sensor_id": 1, "sensor_name": "Temp Sensor A", "next_calibration": "2026-03-10" }
      ],
      "error_message": null,
      "created_at": "2026-03-09T20:00:05+00:00"
    }
  ]
}
```

### Message field reference
| Field | User msg | Assistant msg | Description |
|---|---|---|---|
| `msg_id` | `"0001"` | `"0002"` | Hex document ID — always even for assistant, odd for user |
| `seq` | integer | integer | Sequence number. User = odd, Assistant = even |
| `role` | `"user"` | `"assistant"` | Message author |
| `content` | User's question | Summary text | Quick display text |
| `sql_query` | null | string | The SQL that was executed |
| `summary` | null | string | Plain English result explanation |
| `total_records` | null | integer | Row count |
| `numerical_insights` | null | object | `{ total_records, aggregations }` |
| `data` | null | array | Full result rows |
| `error_message` | null | string \| null | Error detail (null on success) |

---

## GET `/api/v1/chat/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id}`
Get a single message with all fields.
Use this to render a specific message's full data table, SQL, and insights.
**Role:** `analyst+`

### Path Parameters
| Param | Description |
|---|---|
| `connection_id` | UUID of the database connection |
| `chat_id` | UUID of the chat |
| `msg_id` | Hex message ID (`0001`, `0002`, `00ff`, `0100`, ...) |

### Response `200 OK`
Full `MessageOut` object (same structure as messages list above).

### Error `404`
```json
{ "detail": "Message '0099' not found in chat '5cacb874-...'." }
```

---

---

# System Endpoints

## GET `/health`
**Auth required:** No

### Response `200 OK`
```json
{ "status": "ok", "service": "talk2tables-backend", "version": "2.0.0" }
```

---

## GET `/`
**Auth required:** No

### Response `200 OK`
```json
{ "message": "Talk2Tables API running. See /docs", "docs": "/docs" }
```

---

---

# Common Patterns

## Multi-turn Conversation (Chat)
```
1. POST /api/v1/query  { connection_id, chat_input }
   → Response includes chat_id

2. POST /api/v1/query  { connection_id, chat_input, chat_id }  ← pass the same chat_id
   → Agent has history context from previous turns
```

## Schema Explorer Flow (Frontend)
```
1. GET /api/v1/access-grants/my/connections       ← which DBs can I access?
2. GET /api/v1/schema/{connection_id}             ← what tables exist?
3. GET /api/v1/schema/{conn_id}/{schema}/{table}  ← what columns does this table have?
```

## Admin — Monitor DB Usage
```
1. GET /api/v1/connections                        ← all registered DBs
2. GET /api/v1/connections/{id}/audits            ← what queries ran on this DB?
3. GET /api/v1/access-grants?connection_id={id}   ← who has access to this DB?
```

## Admin — Manage User Access
```
1. GET /api/v1/users?active_only=true             ← list all users
2. POST /api/v1/access-grants                     ← grant DB access
3. PATCH /api/v1/access-grants/{id}/revoke        ← revoke access (effective immediately)
```

---

# Rate Limits & Limits

| Limit | Value | Notes |
|---|---|---|
| Max query rows | 10,000 | Hard cap on SELECT results |
| Max chat_input length | 2,000 chars | Pydantic validation |
| Max schema chars to LLM | 12,000 chars | Agent context window budget |
| Max chat history turns | 6 turns (12 msgs) | Injected into LLM context |
| Agent retry attempts | 3 | On JSON parse failure |
| Schema cache TTL | 1 hour | Per table, per connection |
| Redis token TTL | 55 min | Auto-refreshed on login |
| Redis access grant TTL | 2 min | Revocation invalidates immediately |
