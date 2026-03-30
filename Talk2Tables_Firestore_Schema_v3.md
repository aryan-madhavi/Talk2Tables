# Talk2Tables — Firestore Schema v3
**Last updated:** 2026-03-30
**Project:** Talk2Tables Backend (FastAPI + LangGraph)
**Breaking changes from v2:** query_audit moved inside database_connections; schema_cache sub-collection added; message IDs changed from UUID to role-prefixed turn IDs; messages now store flat AI fields including title, query_type, status, favourited, firebase_uid, connection_id, chat_id.

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
| `turn_count` | integer | Number of turns (user+AI pairs); incremented atomically (+1 per turn) |
| `created_at` | string (ISO 8601) | Chat creation time |
| `updated_at` | string (ISO 8601) | Last message time; used for `recent chats` ordering |

> `turn_count` replaced `msg_count` in v3.1. Each turn = 1 user message + 1 assistant message.
> **Firestore index required:** collection group `chats` — `firebase_uid ASC` + `updated_at DESC`

---

### 1.3 `users/{uid}/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id}`

**Document ID:** Role-prefixed turn ID:
- User messages: `u_0001`, `u_0002`, `u_0003`, …
- Assistant messages: `a_0001`, `a_0002`, `a_0003`, …

Turn N always produces `u_000N` (seq = 2N-1) and `a_000N` (seq = 2N).
Written atomically via Firestore transaction; `turn_count` on the parent chat doc is the counter.
**Append-only — never update or delete message documents.**

#### User message (role: `user`)

| Field | Type | Description |
|---|---|---|
| `seq` | integer | Global sequence (odd: 1, 3, 5, …); used for ordering |
| `role` | string | `"user"` |
| `content` | string | The user's natural language query |
| `firebase_uid` | string | Owner UID — stored for collection group queries |
| `connection_id` | string | Parent connection — stored for collection group queries |
| `connection_name` | string | Display name of the DB — denormalized for history display |
| `chat_id` | string | Parent chat ID — stored for collection group queries |
| `created_at` | string (ISO 8601) | Timestamp |

#### Assistant message (role: `assistant`)

| Field | Type | Description |
|---|---|---|
| `seq` | integer | Global sequence (even: 2, 4, 6, …); used for ordering |
| `role` | string | `"assistant"` |
| `title` | string | 5–8 word LLM-generated phrase describing the query (e.g. `"Top 10 orders by revenue"`) |
| `content` | string | Summary text (same as `summary` — stored for quick list display) |
| `sql_query` | string | The exact SQL executed against the target DB |
| `query_type` | string | `"SELECT"` \| `"INSERT"` \| `"UPDATE"` \| `"DELETE"` \| `"OTHER"` \| `"UNKNOWN"` |
| `status` | string | `"success"` \| `"error"` |
| `summary` | string | 1–2 line plain English explanation of the result |
| `total_records` | integer | Number of rows returned |
| `numerical_insights` | map \| null | Column-level stats: `{ total_records: N, aggregations: { col: { type, min, max, avg, sum, null_count } \| { type, unique_count, null_count, most_common } } }`. Populated by Phase 2 Gemini LLM call. `null` if Phase 2 did not run. |
| `narrative_insights` | map \| null | Three plain-English AI insight cards: `{ key_finding, business_insight, analyst_note }`. Populated by Phase 2 Gemini LLM call. `null` if Phase 2 did not run. |
| `data` | array of maps | Full query result rows (up to 10,000) |
| `error_message` | string \| null | Set when status is `error`; null on success |
| `favourited` | boolean | Whether user has starred this query; default `false` |
| `firebase_uid` | string | Owner UID — stored for collection group queries |
| `connection_id` | string | Parent connection — stored for collection group queries |
| `connection_name` | string | Display name of the DB — denormalized for history display |
| `chat_id` | string | Parent chat ID — stored for collection group queries |
| `created_at` | string (ISO 8601) | Timestamp |

> `firebase_uid`, `connection_id`, `connection_name`, `chat_id` are stored on every message doc
> to enable `GET /api/v1/query/history` collection group query without path traversal.
>
> **Firestore indexes required:**
> - Collection group `messages`: `firebase_uid ASC` + `role ASC` + `created_at DESC` (base history)
> - Collection group `messages`: `firebase_uid ASC` + `role ASC` + `favourited ASC` + `created_at DESC` (favourites filter)

---

## 2. `database_connections/{connection_id}`

**Document ID:** UUID (e.g. `763cb64b-8ced-44fa-a76b-17cf9b009318`)

| Field | Type | Description |
|---|---|---|
| `connection_id` | string | UUID — same as document ID |
| `name` | string | Human-readable label (e.g. `"Production PostgreSQL"`) |
| `db_type` | string | `postgresql` \| `mysql` \| `mssql` \| `oracle` |
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
| `status` | string | `"success"` \| `"error"` |
| `error_message` | string \| null | Error detail if status is `"error"` |
| `created_at` | string (ISO 8601) | Query timestamp |

> API: `GET /api/v1/connections/{id}/audits?limit=50&status=success&uid=<uid>` — requires `db_manager+`
> Admin stats: `GET /api/v1/connections/{id}/stats?days=30` — aggregates audit docs for usage metrics.
>
> **Firestore index required:** collection group `audits` — `firebase_uid ASC` + `created_at DESC` (for `GET /api/v1/query/audits`)

---

### 2.2 `database_connections/{connection_id}/schema_cache/_tables`

**Document ID:** `_tables` (literal string)
Stores the full table list for this connection. Populated on cache miss; TTL = 1 hour.
Served with **stale-while-revalidate**: if cache is stale (>1hr), the old data is returned instantly and a background task refreshes the cache.

| Field | Type | Description |
|---|---|---|
| `tables` | array of maps | `[{ table_schema: "public", table_name: "sensors", column_count: 12 }, …]` |
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
| `nullable` | boolean | `true` if nullable, `false` if NOT NULL |
| `primary_key` | boolean | Present and `true` only if the column is a primary key (omitted otherwise) |
| `default` | string | Default value expression — omitted if no default |
| `references` | string | FK target in `schema.table.column` format — omitted if not a FK |
| `sample_values` | array of strings | **Distinct values sampled via `SELECT DISTINCT`** — present only on string-type columns (VARCHAR, CHAR, TEXT, ENUM, NVARCHAR, etc.) that are not PKs or FKs and have ≤ 20 distinct values. Used by the LLM to generate exact WHERE clause filters instead of guessing. Omitted on high-cardinality columns (free-text fields like names, emails). |

> Cache is invalidated by `POST /api/v1/connections/{id}/schema/refresh` (db_manager+).
> Next request after invalidation re-fetches from live DB, re-runs `SELECT DISTINCT` sampling, and re-caches.

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

> **RBAC bypass:** users with role `admin` or `db_manager` skip the access grant check entirely.
> **Security:** revoking a grant immediately invalidates the Redis cache — blocked on very next query.

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
| `schema:tables:{conn_id}` | 1 h | Table list for a connection (`_tables` doc mirror) |
| `schema:def:{conn_id}:{schema}:{table}` | 1 h | Column definitions including `sample_values` for a specific table |

> Passwords are **never** stored in Redis.
> Access revocation immediately deletes `access:{uid}:{conn_id}` — no TTL wait.
> All Redis operations have a 1.0s app-level timeout; on timeout the request falls back to Firestore silently.
> Schema cache keys are bulk-deleted by `POST /api/v1/connections/{id}/schema/refresh` using key pattern `schema:*:{conn_id}:*`.

---

## API Endpoints Quick Reference

### Auth — `/api/v1/auth/*`
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/login` | public | Firebase ID token → custom token with role claim |
| POST | `/register` | public | Same as login — server upserts user doc |
| POST | `/logout` | analyst+ | Revoke session + Firebase refresh tokens |
| POST | `/admin/logout/{uid}` | admin | Force-logout any user |
| POST | `/token-active` | public | Check if token + session are still valid |
| GET | `/me` | analyst+ | Current user profile |
| GET | `/sessions` | analyst+ | List active sessions |

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
| GET | `/{id}/audits` | db_manager+ | Query audit log (`?limit&offset&status&uid`) |
| GET | `/{id}/stats` | db_manager+ | Usage stats (`?days=30`) |
| POST | `/{id}/schema/refresh` | db_manager+ | Force-invalidate schema cache |

### Users — `/api/v1/users/*`
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/` | db_manager+ | List all users (`?active_only=true`) |
| GET | `/{uid}` | db_manager+ | Get single user |
| POST | `/` | admin | Create user |
| PATCH | `/{uid}` | admin | Update display_name / is_active |
| PATCH | `/{uid}/role` | admin | Change user role |
| PATCH | `/{uid}/activate` | admin | Re-enable a deactivated user |
| PATCH | `/{uid}/deactivate` | admin | Disable user (blocks login instantly) |
| DELETE | `/{uid}` | admin | Soft-delete — sets `is_active=False`, preserves all data |

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
| POST | `/query` | analyst+ | NL → SQL → results (blocking JSON response) |
| POST | `/query/stream` | analyst+ | NL → SQL → results via SSE. Emits `event: progress`, `event: result`, then `event: insights` (Phase 2 parallel Gemini calls ~3s later) |
| POST | `/query/insights` | analyst+ | Re-generate insights for a result set (`{ data, question }` → `{ numerical_insights, narrative_insights }`) |
| GET | `/query/suggestions` | analyst+ | LLM-generated query suggestions for a connection (Redis cached 24h) |
| GET | `/schema/{conn_id}` | analyst+ | Table list grouped by schema (stale-while-revalidate) |
| GET | `/schema/{conn_id}/{schema}/{table}` | analyst+ | Column definitions (cache-aware) |
| GET | `/query/history` | analyst+ | AI message history (`?limit&offset&favourites_only`) |
| GET | `/query/audits` | analyst+ | Audit logs (`?uid=` admin/db_manager only; `?limit&offset&connection_id&status`) |

### Chat — `/api/v1/chat/*`
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/recent` | analyst+ | Last 5 chats across all workspaces |
| GET | `/workspaces` | analyst+ | All workspaces for current user |
| GET | `/workspaces/{conn_id}/chats` | analyst+ | Chats in a workspace |
| GET | `/workspaces/{conn_id}/chats/{chat_id}/messages` | analyst+ | All messages in a chat |
| GET | `/workspaces/{conn_id}/chats/{chat_id}/messages/{msg_id}` | analyst+ | Single message (all fields) |
| POST | `/workspaces/{conn_id}/chats/{chat_id}/messages/{msg_id}/favourite` | analyst+ | Star a query |
| DELETE | `/workspaces/{conn_id}/chats/{chat_id}/messages/{msg_id}/favourite` | analyst+ | Unstar a query |

---

## Firestore Indexes Required

| Collection / Group | Fields | Type | Used by |
|---|---|---|---|
| `user_db_access` | `firebase_uid ASC`, `is_active ASC` | Composite | `list_grants_by_user` |
| `user_db_access` | `connection_id ASC`, `is_active ASC` | Composite | `list_grants_by_connection` |
| `chats` (group) | `firebase_uid ASC`, `updated_at DESC` | Composite | `GET /chat/recent` |
| `messages` (group) | `firebase_uid ASC`, `role ASC`, `created_at DESC` | Composite | `GET /query/history` |
| `messages` (group) | `firebase_uid ASC`, `role ASC`, `favourited ASC`, `created_at DESC` | Composite | `GET /query/history?favourites_only=true` |
| `audits` (group) | `firebase_uid ASC`, `created_at DESC` | Composite | `GET /query/audits` |
| `messages` | `seq ASC` | Single field | `GET .../messages` (per-chat) |
| `audits` | `created_at DESC` | Single field | `GET .../audits` (per-connection) |

> Firestore will print the index creation URL in the server terminal on first call if an index is missing. Open the URL and click **Create Index**. Build takes 1–3 minutes.

---

## Schema Change Log

| Version | Date | Changes |
|---|---|---|
| v1 | 2025-12 | Initial schema — users, connections, user_db_access, query_audit (root) |
| v2 | 2026-01 | Added sessions sub-collection; Redis cache keys documented |
| v3 | 2026-03-09 | • `query_audit` moved to `database_connections/{id}/audits/{id}` <br> • `schema_cache` sub-collection added to `database_connections` <br> • Message IDs changed from UUID to zero-padded hex (`0001`, `0002`, …) <br> • `msg_count` counter field added to chat docs <br> • Assistant messages now store flat fields: `sql_query`, `summary`, `total_records`, `numerical_insights`, `data`, `error_message` <br> • `firebase_uid` + `connection_id` added as fields to chat docs for collection group query |
| v3.1 | 2026-03-16 | • Message IDs changed from plain hex to role-prefixed turn IDs: `u_0001`/`a_0001` <br> • `msg_count` renamed to `turn_count` on chat docs (increments +1 per turn, not +2) <br> • `title` field added to assistant messages (LLM-generated, 5–8 words) <br> • `query_type` (`SELECT`/`INSERT`/…), `status` (`success`/`error`), `favourited` fields added to assistant messages <br> • `firebase_uid`, `connection_id`, `connection_name`, `chat_id` stored on every message doc for collection group queries <br> • Schema cache served with stale-while-revalidate (instant response + background refresh) <br> • New endpoints: `POST/DELETE .../favourite`, `GET /query/history`, `GET /query/audits`, `GET /connections/{id}/stats`, `POST /auth/admin/logout/{uid}` <br> • All Firestore `.where()` calls updated to `FieldFilter` API |
| v3.2 | 2026-03-17 | • `DELETE /users/{uid}` changed from hard-delete to soft-delete (sets `is_active=False`, preserves all Firestore data and audit history) <br> • `POST /auth/logout-all` (self logout-all) removed — use `POST /auth/logout` with no session_id <br> • `GET /query/audits` now accepts `?uid=` for admin/db_manager to view any user's logs <br> • `_tables` schema cache doc now stores `column_count` per table entry <br> • `GET /api/v1/schema/{conn_id}` response includes `columns` count on each `SchemaTable` |
| v3.3 | 2026-03-18 | • Fixed `GET /query/audits` crash: `status` query param renamed to `status_filter` internally (URL stays `?status=`) — parameter was shadowing the `fastapi.status` module causing `AttributeError` on 500 errors <br> • Redis app-level timeout increased from 0.5s → 1.0s to reduce false-positive timeout warnings on local Redis <br> • Firestore composite index confirmed required: `audits` collection group — `firebase_uid ASC` + `created_at DESC` |
| v3.4 | 2026-03-28 | • `narrative_insights` field added to assistant messages: `{ key_finding, business_insight, analyst_note }` — generated by Gemini LLM in Phase 2 (parallel with `numerical_insights`); `null` if Phase 2 did not run <br> • `numerical_insights` on assistant messages is now populated by Gemini LLM (Phase 2) instead of pure Python; field semantics unchanged <br> • `POST /query/stream` now emits a second SSE event `event: insights` ~3s after `event: result` carrying both `numerical_insights` and `narrative_insights` <br> • New endpoints added: `POST /query/insights` (re-generate insights on demand), `GET /query/suggestions` (LLM schema-based suggestions, Redis cached 24h) <br> • Schema cache column map updated: `is_nullable` (string) replaced by `nullable` (boolean); `constraint_type`/`column_default` replaced by sparse `primary_key`/`default`/`references` fields (omitted when not applicable) — reduces token usage in LLM prompts |
| v3.5 | 2026-03-30 | • `sample_values` field added to schema_cache column map: populated for string-type columns (VARCHAR, CHAR, TEXT, ENUM, NVARCHAR, etc.) that are not PKs or FKs and have ≤ 20 distinct values — sampled via `SELECT DISTINCT` at cache-fill time <br> • Fixes NL2SQL enum value blindness: LLM previously guessed filter values (e.g. `WHERE status = 'Leave'`) causing zero-row results; now uses exact stored values (e.g. `'On Leave'`) <br> • `sample_values` stored in both Firestore schema_cache and Redis — no repeated DB queries within the 1-hour TTL <br> • System prompt updated: LLM explicitly instructed to use `sample_values` values verbatim in WHERE clauses and never guess <br> • Schema cache Redis keys added: `schema:tables:{conn_id}` (TTL 1h) and `schema:def:{conn_id}:{schema}:{table}` (TTL 1h) |
