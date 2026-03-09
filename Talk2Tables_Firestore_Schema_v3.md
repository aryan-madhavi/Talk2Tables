# Talk2Tables — Firestore Schema v3
**Last updated:** 2026-03-09
**Project:** Talk2Tables Backend (FastAPI + LangGraph)
**Breaking changes from v2:** query_audit moved inside database_connections; schema_cache sub-collection added; message IDs changed from UUID to hex sequence; messages now store flat AI fields.

---

## Overview — Top-Level Collections

| Collection | Description |
|---|---|
| `users` | User profiles and nested workspaces / chats / messages |
| `database_connections` | Registered DB connections with nested audits and schema cache |
| `user_db_access` | RBAC access grants linking users to connections |

---

## 1. `users/{firebase_uid}`

**Document ID:** Firebase Auth UID (e.g. `Rf0dRxw6uscv6kEbvdqRKScvMmN2`)

| Field | Type | Description |
|---|---|---|
| `firebase_uid` | string | Firebase Auth UID |
| `email` | string | User email |
| `display_name` | string | Full name |
| `role` | string | RBAC role: `analyst` \| `power_user` \| `db_manager` \| `admin` |
| `is_active` | boolean | Account enabled flag |
| `created_at` | string (ISO 8601) | Account creation timestamp |
| `updated_at` | string (ISO 8601) | Last profile update |

> New users default to role `analyst` on first login.

---

### 1.1 `users/{uid}/workspaces/{connection_id}`

One workspace document per user per database connection.
**Document ID:** `connection_id` (same as `database_connections` doc ID)

| Field | Type | Description |
|---|---|---|
| `connection_id` | string | Reference to `database_connections/{id}` |
| `connection_name` | string | Display name copied at workspace creation |
| `created_at` | string (ISO 8601) | First query timestamp for this user+DB |

---

### 1.2 `users/{uid}/workspaces/{connection_id}/chats/{chat_id}`

**Document ID:** UUID (e.g. `5cacb874-5d6d-4331-b73c-780756d7b4ba`)

| Field | Type | Description |
|---|---|---|
| `chat_id` | string | UUID — same as document ID |
| `firebase_uid` | string | Owner UID — **stored here for collection group queries** |
| `connection_id` | string | Parent connection — **stored here for collection group queries** |
| `title` | string | Auto-generated from first user message (first 60 chars) |
| `msg_count` | integer | Total messages written; incremented atomically (+2 per turn) |
| `created_at` | string (ISO 8601) | Chat creation time |
| `updated_at` | string (ISO 8601) | Last message time; used for `recent chats` ordering |

> `firebase_uid` and `connection_id` are stored as fields (not just path segments) to support the `GET /api/v1/chat/recent` collection group query.
> **Firestore index required:** collection group `chats` — `firebase_uid ASC` + `updated_at DESC`

---

### 1.3 `users/{uid}/workspaces/{connection_id}/chats/{chat_id}/messages/{seq_hex}`

**Document ID:** Zero-padded hex sequence integer — `0001`, `0002`, `0003`, ..., `00ff`, `0100`, ...
IDs sort lexicographically in the correct order, enabling natural ordering without a timestamp index.
Written atomically via Firestore transaction; `msg_count` on the parent chat doc is the counter.
**Append-only — never update or delete message documents.**

#### User message (role: `user`)

| Field | Type | Description |
|---|---|---|
| `seq` | integer | Sequence number (1, 2, 3, …); same as hex doc ID decoded |
| `role` | string | `"user"` |
| `content` | string | The user's natural language query |
| `created_at` | string (ISO 8601) | Timestamp |

#### Assistant message (role: `assistant`)

| Field | Type | Description |
|---|---|---|
| `seq` | integer | Sequence number (always even; user is seq-1) |
| `role` | string | `"assistant"` |
| `content` | string | Summary text (same as `summary` — stored for quick display) |
| `sql_query` | string | The exact SQL executed against the target DB |
| `summary` | string | 1–2 line plain English explanation of the result |
| `total_records` | integer | Number of rows returned |
| `numerical_insights` | map | `{ total_records: N, aggregations: { key: value } }` |
| `data` | array of maps | Full query result rows (up to 10,000) |
| `error_message` | string \| null | Set when `response_type` is `error`; null on success |
| `created_at` | string (ISO 8601) | Timestamp |

> On error responses: `content` = error message, `sql_query` = `""`, `data` = `[]`, `error_message` = error detail.

---

## 2. `database_connections/{connection_id}`

**Document ID:** UUID (e.g. `763cb64b-8ced-44fa-a76b-17cf9b009318`)

| Field | Type | Description |
|---|---|---|
| `connection_id` | string | UUID — same as document ID |
| `name` | string | Human-readable label (e.g. `"Production PostgreSQL"`) |
| `db_type` | string | `postgresql` \| `mysql` \| `mssql` \| `oracle` \| `sqlite` |
| `host` | string | Hostname or IP of the database server |
| `port` | integer | Port number |
| `database_name` | string | Target schema/database name |
| `username` | string | DB login username |
| `password_enc` | string | **AES-256-GCM encrypted** ciphertext — never returned in API responses |
| `ssl_enabled` | boolean | Whether TLS is required |
| `is_active` | boolean | Inactive connections are blocked at query time |
| `description` | string \| null | Admin notes |
| `created_by_uid` | string | Firebase UID of the admin who registered this connection |
| `created_at` | string (ISO 8601) | |
| `updated_at` | string (ISO 8601) | Updated on any field change, test, or schema refresh |
| `last_tested_at` | string \| null | Timestamp of last `POST /api/v1/connections/{id}/test` call |
| `last_tested_ok` | boolean \| null | Result of last live connectivity test |

> `password_enc` is encrypted with `DB_ENCRYPTION_KEY` (AES-256-GCM, 32-byte key).
> Passwords are **never** cached in Redis and **never** included in any API response.

---

### 2.1 `database_connections/{connection_id}/audits/{audit_id}`

**Document ID:** UUID
**Append-only — never update or delete audit documents.**
Previously stored in the root `query_audit` collection (v2). Moved here in v3 so admins can filter audit logs per connection.

| Field | Type | Description |
|---|---|---|
| `audit_id` | string | UUID — same as document ID |
| `firebase_uid` | string | User who executed the query |
| `connection_id` | string | Parent connection (redundant with path — for convenience) |
| `chat_id` | string | Chat session the query belongs to |
| `sql_query` | string | The SQL that was executed |
| `summary` | string | Agent summary |
| `row_count` | integer | Number of rows returned |
| `execution_time_ms` | float | SQL execution time in milliseconds |
| `status` | string | `"results"` \| `"error"` |
| `error_message` | string \| null | Error detail if status is `"error"` |
| `created_at` | string (ISO 8601) | Query timestamp |

> API: `GET /api/v1/connections/{id}/audits?limit=50` — requires `db_manager` or `admin` role.

---

### 2.2 `database_connections/{connection_id}/schema_cache/_tables`

**Document ID:** `_tables` (literal string)
Stores the full table list for this connection. Populated on cache miss; TTL = 1 hour.

| Field | Type | Description |
|---|---|---|
| `tables` | array of maps | `[{ table_schema: "public", table_name: "sensors" }, …]` |
| `cached_at` | string (ISO 8601) | Timestamp of last DB fetch; used for TTL check |

---

### 2.3 `database_connections/{connection_id}/schema_cache/{schema}__{table}`

**Document ID:** `{schema_name}__{table_name}` (double underscore separator, e.g. `public__sensors`)
One document per table. Populated on cache miss; TTL = 1 hour.

| Field | Type | Description |
|---|---|---|
| `columns` | array of maps | See column structure below |
| `cached_at` | string (ISO 8601) | Timestamp of last DB fetch |

**Column map structure:**

| Key | Type | Description |
|---|---|---|
| `column_name` | string | Column name |
| `data_type` | string | SQLAlchemy type string (e.g. `VARCHAR(100)`, `INTEGER`) |
| `is_nullable` | string | `"YES"` or `"NO"` |
| `column_default` | string \| null | Default value expression |
| `constraint_type` | string \| null | `"PRIMARY KEY"` or null |
| `referenced_table` | string \| null | FK target: `schema.table.column` or null |

> Cache is invalidated by `POST /api/v1/connections/{id}/schema/refresh` (db_manager+).
> Next query after invalidation re-fetches from live DB and re-caches.

---

## 3. `user_db_access/{access_id}`

**Document ID:** UUID

| Field | Type | Description |
|---|---|---|
| `access_id` | string | UUID — same as document ID |
| `firebase_uid` | string | User being granted access |
| `connection_id` | string | Target database connection |
| `granted_by_uid` | string | Admin/db_manager who created the grant |
| `permission` | string | `"read"` \| `"write"` |
| `is_active` | boolean | `false` after revocation |
| `granted_at` | string (ISO 8601) | |
| `revoked_at` | string \| null | Set on revocation |
| `expires_at` | string \| null | Optional expiry; null = never expires |
| `note` | string \| null | Admin notes |

> **RBAC bypass:** users with role `admin` or `db_manager` skip the access grant check entirely and can query any connection without a `user_db_access` document.
> **Security:** revoking a grant immediately invalidates the Redis cache — blocked on very next query, no TTL delay.

---

## Redis Cache Keys (Reference)

| Key Pattern | TTL | Content |
|---|---|---|
| `token:{firebase_uid}` | 55 min | Firebase custom token |
| `user:{firebase_uid}` | 5 min | User profile dict |
| `connection:{id}` | 2 min | Safe connection dict (no password) |
| `connections:list` | 2 min | All connections list |
| `connections:list:active` | 2 min | Active-only connections list |
| `access:{uid}:{conn_id}` | 2 min | Single access grant (hottest path) |
| `access:user:{uid}` | 2 min | All grants for a user |
| `access:grant:{id}` | 2 min | Single grant by access_id |

> Passwords are **never** stored in Redis.
> Access revocation immediately deletes `access:{uid}:{conn_id}` — no TTL wait.

---

## API Endpoints Quick Reference

### Auth — `/api/v1/auth/*`
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/login` | public | Firebase ID token → custom token with role claim |
| POST | `/logout` | analyst+ | Revoke refresh tokens |

### Connections — `/api/v1/connections/*`
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/` | db_manager+ | Create connection |
| GET | `/` | db_manager+ | List connections |
| GET | `/{id}` | db_manager+ | Get single connection |
| PATCH | `/{id}` | db_manager+ | Update connection |
| DELETE | `/{id}` | admin | Hard delete |
| PATCH | `/{id}/activate` | db_manager+ | Enable connection |
| PATCH | `/{id}/deactivate` | db_manager+ | Disable connection |
| POST | `/{id}/test` | db_manager+ | Live connectivity test |
| GET | `/{id}/audits` | db_manager+ | Query audit log for this DB |
| POST | `/{id}/schema/refresh` | db_manager+ | Force-invalidate schema cache |

### Users — `/api/v1/users/*`
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/` | admin | List all users |
| GET | `/{uid}` | admin | Get single user |
| PATCH | `/{uid}/role` | admin | Change user role |
| DELETE | `/{uid}` | admin | Deactivate user |

### Access Grants — `/api/v1/access-grants/*`
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/my/connections` | analyst+ | My granted DBs + connection details |
| POST | `/` | db_manager+ | Grant DB access to a user |
| GET | `/?uid=` | db_manager+ | Grants for a user |
| GET | `/?connection_id=` | db_manager+ | Users on a DB |
| GET | `/{id}` | db_manager+ | Single grant |
| PATCH | `/{id}` | db_manager+ | Update permission / expiry |
| PATCH | `/{id}/revoke` | db_manager+ | Revoke access |

### Query — `/api/v1/*`
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/query` | analyst+ | NL → SQL → results |
| GET | `/schema/{conn_id}` | analyst+ | Table list (cache-aware) |
| GET | `/schema/{conn_id}/{schema}/{table}` | analyst+ | Column definitions (cache-aware) |

### Chat — `/api/v1/chat/*`
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/recent` | analyst+ | Last 5 chats across all workspaces |
| GET | `/workspaces` | analyst+ | All workspaces for current user |
| GET | `/workspaces/{conn_id}/chats` | analyst+ | Chats in a workspace |
| GET | `/workspaces/{conn_id}/chats/{chat_id}/messages` | analyst+ | All messages in a chat |
| GET | `/workspaces/{conn_id}/chats/{chat_id}/messages/{msg_id}` | analyst+ | Single message (all fields) |

---

## Firestore Indexes Required

| Collection / Group | Fields | Type | Used by |
|---|---|---|---|
| `user_db_access` | `firebase_uid ASC`, `is_active ASC` | Composite | `list_grants_by_user` |
| `user_db_access` | `connection_id ASC`, `is_active ASC` | Composite | `list_grants_by_connection` |
| `chats` (collection group) | `firebase_uid ASC`, `updated_at DESC` | Composite | `GET /chat/recent` |
| `messages` | `seq ASC` | Single field | `GET .../messages` |
| `audits` | `created_at DESC` | Single field | `GET .../audits` |

---

## Schema Change Log

| Version | Date | Changes |
|---|---|---|
| v1 | 2025-12 | Initial schema — users, connections, user_db_access, query_audit (root) |
| v2 | 2026-01 | Added sessions sub-collection; Redis cache keys documented |
| v3 | 2026-03-09 | • `query_audit` moved to `database_connections/{id}/audits/{id}` <br> • `schema_cache` sub-collection added to `database_connections` <br> • Message IDs changed from UUID to zero-padded hex (`0001`, `0002`, …) <br> • `msg_count` counter field added to chat docs <br> • Assistant messages now store flat fields: `sql_query`, `summary`, `total_records`, `numerical_insights`, `data`, `error_message` <br> • `firebase_uid` + `connection_id` added as fields to chat docs for collection group query <br> • New endpoints: `/chat/*`, `/access-grants/my/connections`, `/schema/{id}/{schema}/{table}`, `/connections/{id}/test`, `/connections/{id}/schema/refresh` |
