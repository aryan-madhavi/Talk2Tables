# 🎓 Talk2Tables

> **Project**: Talk2Tables — AI-Powered Conversational SQL Assistant  
> **Stack**: FastAPI + LangGraph (Backend) · React + TypeScript (Frontend) · Firebase · Redis  
> **Diploma Final Year Project — Mumbai, 2025–26**

---

## 📌 WHAT IS TALK2TABLES?

Talk2Tables is a **Natural Language to SQL** web application. A user types a question in plain English (e.g., _"Show me top 5 customers by revenue"_) and the AI automatically:

1. Understands which database tables to use
2. Writes the correct SQL query
3. Executes it safely
4. Returns results, a chart, and business insights

**Key Features:**

- Multi-database support: MySQL, PostgreSQL, MSSQL, Oracle, MariaDB
- Role-Based Access Control (RBAC) — 4 roles: `analyst`, `power_user`, `db_manager`, `admin`
- Multi-tenant organizations (each company's data is isolated)
- Real-time streaming responses (SSE)
- Two-tier caching: Redis (fast) → Firestore (persistent)
- SQL injection protection & DDL blocking
- Business document upload for context enrichment

---

## 🏗️ HIGH-LEVEL ARCHITECTURE

```
User (Browser)
    │
    ▼
[React Frontend] — src/
    │  ← Firebase Auth (ID Token as Bearer)
    ▼
[FastAPI Backend] — main.py  (port 8080)
    │
    ├── /api/v1/auth/*           ← Login, Signup, Logout
    ├── /api/v1/connections/*    ← Manage DB connections
    ├── /api/v1/access-grants/*  ← Grant/revoke user access to DBs
    ├── /api/v1/users/*          ← User management
    ├── /api/v1/query            ← THE CORE — NL → SQL → Results
    └── /api/v1/chat/*           ← Chat history
         │
         ▼
    [LangGraph AI Agent]
         │
         ├── entry_node          → fetch DB credentials from Firestore
         ├── react_agent_node    → LLM calls tools to write+run SQL
         │       ├── get_schema_list       (tool)
         │       ├── get_table_definitions (tool)
         │       └── execute_sql           (tool)
         └── output_parser_node → parse JSON response, retry if bad
              │
              ▼
         [Parallel Phase 2]
              ├── Gemini → numerical_insights (stats per column)
              └── Gemini → narrative_insights (3 plain-English cards)
         │
         ▼
    Storage: Firebase Firestore  (all data, NO PostgreSQL)
    Cache:   Redis               (optional, 2-tier fallback)
```

---

## 📂 FULL FILE-BY-FILE BREAKDOWN

---

### 🔷 BACKEND ROOT

---

#### `backend/main.py` — Application Entry Point

**What it does:** Creates and starts the FastAPI app.

| Function/Section             | What it does                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `lifespan(app)`              | Startup/shutdown hook. Initialises Firebase Admin SDK → Firestore → Redis → LangGraph agent in order |
| `limit_request_body()`       | Middleware: rejects requests > 1 MB (100 MB for doc uploads)                                         |
| `add_security_headers()`     | Middleware: adds X-Frame-Options, X-XSS-Protection etc.                                              |
| `add_response_time()`        | Middleware: adds `X-Response-Time` header to every response                                          |
| `global_exception_handler()` | Catches any unhandled exception and returns 500 JSON                                                 |
| `health()`                   | GET `/health` — returns `{"status": "ok"}`                                                           |
| `health_redis()`             | GET `/health/redis` — pings Redis and reports latency                                                |

**Router registration (what URL prefix each handles):**

```
auth_router       → /api/v1/auth/*
connections_router→ /api/v1/connections/*
docs_router       → /api/v1/connections/*/docs
users_router      → /api/v1/users/*
access_router     → /api/v1/access-grants/*
query_router      → /api/v1/query, /api/v1/schema/*
chat_router       → /api/v1/chat/*
```

**Rate limiting:** Uses `slowapi` keyed on the user's IP address.

---

### 🔷 MODULE: `auth/`

This module handles **everything authentication-related**.

---

#### `auth/routes/dependencies.py` — FastAPI Dependency Injection

**Purpose:** Every protected route uses one of these dependencies to verify a request.

| Function                 | What it does                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `get_current_user()`     | Extracts Bearer token from `Authorization` header → calls `verify_request_token()` → returns user dict |
| `require_role(*roles)`   | Exact whitelist check — user's role must be in the list                                                |
| `require_min_role(role)` | Hierarchy check — user's level must be ≥ the given role                                                |

**Role hierarchy (numbers are levels):**

```
analyst    (0) — SELECT only, assigned DBs only
power_user (1) — SELECT + write, assigned DBs
db_manager (2) — manages connections & grants
admin      (3) — full control
```

**Shortcut aliases used in routes:**

```python
require_admin      = require_role("admin")
require_db_manager = require_min_role("db_manager")  # db_manager + admin
require_power_user = require_min_role("power_user")  # power_user + db_manager + admin
require_analyst    = require_min_role("analyst")     # all authenticated users
```

**Auth flow per request:**

1. Extract `Authorization: Bearer <token>` header
2. Call `verify_request_token()` in a thread (Firebase SDK is sync)
3. Redis cache check → return immediately if hit (55-min TTL)
4. Firestore user check (cache miss only)
5. Firestore session check (cache miss only)

---

#### `auth/services/auth_service.py` — Auth Business Logic

| Function                                        | What it does                                                                                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `login(id_token, device_info, ip)`              | Verifies Firebase ID token → upserts user in Firestore → creates custom token with role claims → creates session doc → returns `{custom_token, session_id, user}` |
| `signup(id_token, display_name, org_name, ...)` | Registers a new admin user; creates Organization + user doc in Firestore; returns same shape as `login()`                                                         |
| `check_token_active(id_token)`                  | Checks if token is valid + session exists. Redis fast-path → Firestore fallback                                                                                   |
| `logout(uid, session_id)`                       | Revokes specific Firestore session + Firebase refresh tokens                                                                                                      |
| `logout_all(uid)`                               | Revokes ALL sessions + Firebase tokens                                                                                                                            |
| `update_profile(uid, display_name)`             | Updates display name in Firestore + busts Redis cache                                                                                                             |
| `revoke_single_session(uid, session_id)`        | Revokes one session without affecting other devices; invalidates token cache immediately                                                                          |
| `get_all_sessions(uid)`                         | Returns all active sessions for a user                                                                                                                            |

**Key design decisions:**

- No PostgreSQL — all auth data is in Firestore
- `login()` returns a **custom token** (not the raw Firebase token). The frontend calls `signInWithCustomToken(token)` — this embeds `role` and `org_id` claims so every subsequent request carries them.
- Firebase tokens live 1 hour, but our session can be up to 8 hours. Redis caches the decoded token for 55 minutes.

---

### 🔷 MODULE: `connections/`

Manages database connection credentials. Password stored encrypted in Firestore.

---

#### `connections/services/connection_service.py`

| Function                                       | What it does                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `create_connection(body, uid, org_id)`         | Encrypts password, writes to Firestore with `org_id` for tenant isolation; invalidates list cache       |
| `get_connection_by_id(id, org_id)`             | Redis → Firestore. Validates `org_id` to prevent cross-tenant access. Never returns `password_enc`      |
| `get_connection_with_password(id)`             | Internal-only. Fetches from Firestore + decrypts password. **NOT cached** — passwords never go in Redis |
| `list_connections(org_id, active_only)`        | Lists all connections scoped to one org. Redis → Firestore                                              |
| `update_connection(id, body, org_id)`          | Partial update. Re-encrypts password if provided. Validates org ownership                               |
| `delete_connection(id, org_id)`                | Hard delete from Firestore. Validates org ownership                                                     |
| `test_connection(id, org_id)`                  | Executes `SELECT 1` via SQLAlchemy to confirm connectivity. Updates `last_tested_at` in Firestore       |
| `set_connection_active(id, is_active, org_id)` | Enables/disables a connection                                                                           |

**Security design:**

- `_safe_connection()` strips `password_enc` before any response
- Passwords are encrypted with AES/Fernet (`connections/core/encryption.py`)
- Org boundary is validated on every read/write to prevent tenant data leakage

---

### 🔷 MODULE: `access/`

Controls which user can query which database, and with what permission.

---

#### `access/services/access_service.py`

**Firestore collection:** `user_db_access/{access_id}`

| Function                                 | What it does                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `create_access_grant(body, uid, org_id)` | Grants a user access to a DB. Validates org membership for both the user AND the connection. Blocks duplicates     |
| `get_grant_by_id(access_id)`             | Fetch single grant. Redis → Firestore                                                                              |
| `list_grants_by_user(uid, active_only)`  | All grants for a user. Redis → Firestore                                                                           |
| `list_grants_by_connection(conn_id)`     | All users who can query a DB. Not cached                                                                           |
| `update_access_grant(id, body)`          | Changes permission, expiry, or note. Invalidates cache                                                             |
| `revoke_access_grant(id, uid)`           | **Soft delete** — sets `is_active=False` and `revoked_at`. Cache invalidated IMMEDIATELY (security critical)       |
| `verify_access(uid, conn_id)`            | THE HOTTEST PATH. Called before every single query. Redis → Firestore. Returns `(True, "ok")` or `(False, reason)` |

**`verify_access()` return codes:**

```
(True,  "ok")                  → access allowed
(False, "no_grant")            → no grant exists at all
(False, "revoked")             → grant.is_active == False
(False, "expired")             → grant.expires_at is in the past
(False, "write_not_permitted") → write required but only "read" granted
```

**Expiry check (`_is_expired()`):** Compares `expires_at` (ISO string on the grant doc) against the current UTC time.

---

### 🔷 MODULE: `ai_agent/` — THE CORE ENGINE

This is the most important module. It converts natural language to SQL using a **LangGraph state machine**.

---

#### `ai_agent/state.py` — Shared State

`AgentState` is a `TypedDict` passed between all nodes in the graph:

| Field                    | Set by               | Purpose                             |
| ------------------------ | -------------------- | ----------------------------------- |
| `natural_language_query` | Route handler        | User's question                     |
| `connection_id`          | Route handler        | Which database                      |
| `firebase_uid`           | Route handler        | Who is querying                     |
| `user_role`              | Route handler        | RBAC role                           |
| `chat_id`                | Route handler        | Conversation ID                     |
| `chat_history`           | Route handler        | Previous messages for context       |
| `db_connection_string`   | `entry_node`         | Built SQLAlchemy URL                |
| `db_dialect`             | `entry_node`         | mysql / postgresql / mssql / oracle |
| `agent_output`           | `react_agent_node`   | Raw JSON string from LLM            |
| `response_type`          | `output_parser_node` | "results" or "error"                |
| `final_response`         | `output_parser_node` | Structured dict for the frontend    |
| `retry_count`            | `output_parser_node` | Number of retries so far            |
| `error_message`          | Any node             | Set on failure to route to END      |

---

#### `ai_agent/graph.py` — LangGraph Outer Graph

**The graph flow:**

```
START
  → entry_node
      ↓ success           ↓ error
  react_agent_node     →  END
      ↓ success           ↓ error
  output_parser_node   →  END
      ↓ success  ↓ retry (max 3 times)
      END      react_agent_node
```

| Function                           | What it does                                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `build_agent_graph()`              | Assembles the `StateGraph` with 3 nodes + conditional edges                                                                                                                                |
| `get_agent()`                      | Singleton — compiles the graph once, reuses it forever                                                                                                                                     |
| `node_react_agent(state)`          | Runs the inner ReAct agent. Builds tool list, builds message history with chat context, calls `agent.ainvoke()`. **Caches** the compiled inner agent per `(connection_id, user_role)` pair |
| `route_after_entry(state)`         | If `error_message` is set → END, else → `react_agent`                                                                                                                                      |
| `route_after_react_agent(state)`   | If `error_message` → END, else → `output_parser`                                                                                                                                           |
| `route_after_output_parser(state)` | If parse succeeded → END; if `retry_count > 0` and no final response → loop back to `react_agent`                                                                                          |
| `run_agent(...)`                   | Public entry point. Runs guards → invokes graph → runs Phase 2 (parallel Gemini insights)                                                                                                  |
| `run_agent_stream(...)`            | Streaming version using `astream_events()`. Yields SSE progress events and finally the result                                                                                              |

**Two safety guards in `run_agent()`:**

1. **Write-intent pre-flight:** Regex checks if a read-only `analyst` is asking for INSERT/UPDATE/DELETE — blocks immediately without calling the LLM
2. **In-flight deduplication:** Prevents the same user from having two concurrent queries running (saves LLM tokens, prevents errors)

**Phase 2 (parallel insights):** After `run_agent` gets the data rows back, it calls two Gemini functions in **parallel** using `asyncio.gather()`:

- `_generate_numerical_insights()` — column stats (min, max, avg, sum, categories)
- `_generate_narrative_insights()` — 3 business sentences (key_finding, business_insight, analyst_note)

---

#### `ai_agent/nodes/entry.py` — Entry Node

**Responsibilities (runs before any LLM call):**

1. **Access grant check** — calls `verify_access()`. Skipped for `admin`/`db_manager` roles.
2. **Fetch DB credentials** — calls `get_connection_with_password()` from Firestore with decrypted password
3. **Build SQLAlchemy URL** — maps `db_type` to driver string (e.g., `mysql+pymysql://...`)
4. **Detect dialect** — from URL prefix (mysql/postgresql/mssql/oracle)

| Function                         | What it does                                                                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_build_connection_string(conn)` | Maps `{db_type, host, port, database_name, username, password}` to a SQLAlchemy URL. Calls `quote_plus()` to safely encode special chars in passwords |
| `node_entry(state)`              | Main entry node function. Returns updated state with `db_connection_string`, `db_dialect`, `db_type` — or sets `error_message` and routes to END      |

**Supported DB types → SQLAlchemy drivers:**

```
mysql     → mysql+pymysql://
mariadb   → mysql+pymysql://
postgresql→ postgresql+psycopg2://
postgres  → postgresql+psycopg2://
mssql     → mssql+pyodbc://
oracle    → oracle+oracledb://
```

---

#### `ai_agent/nodes/output_parser.py` — Output Parser Node

**Purpose:** Parses the LLM's raw string output into a structured `final_response` dict.

| Function                                              | What it does                                                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_extract_json(text)`                                 | Strips markdown code fences (` ```json ``` `) if the LLM wrapped its JSON; falls back to regex to find the JSON object                                |
| `_serialize(value)`                                   | Converts Python types to JSON-safe: `datetime` → ISO string, `Decimal` → float, `bytes` → UTF-8 string                                                |
| `_fetch_full_data(conn_str, sql)`                     | Re-executes SQL synchronously to get ALL rows (up to 10,000). Called via `asyncio.to_thread`                                                          |
| `_generate_rich_summary(data, insights, llm_summary)` | Builds a data-driven summary string from computed stats (used as fallback)                                                                            |
| `_generate_numerical_insights(question, data)`        | Calls Gemini to compute column statistics. Falls back to `{total_records, aggregations: {}}` if Gemini fails                                          |
| `_generate_narrative_insights(question, data)`        | Calls Gemini to produce 3 business insight sentences                                                                                                  |
| `node_output_parser(state)`                           | Parses `agent_output` → if success: sets `response_type="results"`. If fail: increments `retry_count` (loops back) or returns error after max retries |

**Full data cache trick:**

- The `execute_sql` tool fetches ALL rows but only sends 3 rows preview to the LLM (to save tokens)
- The full rows are stored in `_full_result_cache` (in-memory dict keyed by MD5 of conn+sql)
- The `output_parser` pops from this cache to get the full dataset without re-executing SQL

**Conversational response detection:**

- If `sql_query` is empty AND `data` is `[]` AND cache miss → it's a conversational response (e.g., "explain the query")
- In this case, the parser does NOT re-execute SQL and preserves the empty data intentionally

---

#### `ai_agent/tools/schema_tools.py` — Schema Inspection Tools

Two LangChain `@tool` functions the LLM can call:

| Tool                                              | Args                        | What it does                                                             |
| ------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| `get_schema_list()`                               | none                        | Returns all table names and schemas in the DB as JSON array              |
| `get_table_definitions(table_names, schema_name)` | comma-separated table names | Returns column definitions, data types, PKs, FKs, and sample enum values |

**Two-tier cache strategy (fastest first):**

```
1. Redis   (~1ms)   — TTL 1 hour
2. Firestore (~80ms) — source of truth
3. Live DB  (~?ms)  — on full cache miss, writes back to both caches
```

**Firestore cache paths:**

```
database_connections/{id}/schema_cache/_tables          → list of tables
database_connections/{id}/schema_cache/{schema}__{table} → column definitions
```

| Function                               | What it does                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detect_dialect(conn_str)`             | Returns `mysql`/`postgresql`/`mssql`/`oracle` from URL prefix                                                                                                     |
| `_get_engine(conn_str)`                | Returns cached SQLAlchemy engine (pool reuse — avoids reconnect overhead)                                                                                         |
| `_is_fresh(cached_at_iso)`             | Returns `True` if the cache entry is < 1 hour old                                                                                                                 |
| `_sample_enum_values(...)`             | Runs `SELECT DISTINCT` on string columns. If ≤ 20 distinct values, returns them as `sample_values`. This prevents the LLM from guessing wrong WHERE clause values |
| `_enrich_schema_list(tables, conn_id)` | Merges business document descriptions into the table list                                                                                                         |
| `_enrich_table_def(columns, ...)`      | Merges business doc context and column descriptions                                                                                                               |
| `invalidate_schema_cache(conn_id)`     | Deletes all Redis + Firestore cache entries for a connection (called by schema refresh API)                                                                       |
| `warm_schema_cache(conn_id)`           | Background task: pre-populates the whole schema cache for a connection — so first user query hits cache                                                           |
| `make_schema_tools(conn_str, conn_id)` | Factory: returns `[get_schema_list, get_table_definitions]` bound to the connection                                                                               |

**Enum sampling:** For `VARCHAR`/`TEXT`/`CHAR` columns that have ≤ 20 distinct values, the tool runs `SELECT DISTINCT` and returns real stored values. Example: column `status` might return `["Active", "On Leave", "Terminated"]`. The system prompt then tells the LLM: _you MUST use ONLY these exact values in WHERE clauses_.

---

#### `ai_agent/tools/query_tools.py` — SQL Execution Tool

One LangChain `@tool`:

| Tool                     | Args       | What it does                                  |
| ------------------------ | ---------- | --------------------------------------------- |
| `execute_sql(sql_query)` | SQL string | Validates → executes → returns JSON with rows |

**4-layer safety pipeline (in order):**

1. **Injection guard** (`_check_injection`) — regex-blocks: `; statement`, `xp_cmdshell`, `EXEC(`, `INTO OUTFILE`, `SLEEP()`, `pg_sleep()`, `WAITFOR DELAY`, `BENCHMARK()`, and more
2. **DDL guard** — blocks: `DROP`, `TRUNCATE`, `CREATE`, `ALTER`, `RENAME`, `GRANT`, `REVOKE`
3. **RBAC write check** — if query is INSERT/UPDATE/DELETE/MERGE, user's role must be in `{admin, power_user, db_manager}`
4. **Auto-LIMIT** — SELECT queries without a LIMIT get `LIMIT 1000` appended automatically

**Result handling:**

- Fetches up to 10,000 rows
- Sends only **3 rows preview** back to the LLM (saves tokens)
- Caches the **full result** in `_full_result_cache` (in-memory, keyed by MD5)
- The `output_parser` picks up the full result from cache → avoids a second DB roundtrip

---

#### `ai_agent/prompts.py` — System Prompt Builder

| Function                                  | What it does                                                    |
| ----------------------------------------- | --------------------------------------------------------------- |
| `build_system_prompt(dialect, user_role)` | Builds the complete system prompt injected into the ReAct agent |

**System prompt sections:**

1. **Identity** — "You are a Database Query Assistant..."
2. **Tools Available** — explains `get_schema_list`, `get_table_definitions`, `execute_sql`
3. **Execution Workflow** — Step 1-5 mandatory order
4. **Response Format** — exact JSON schema the LLM must return
5. **Rules** — never guess column names, always use `sample_values`, never skip execute_sql, etc.
6. **User Permissions** (appended based on role) — analyst gets read-only instructions; power_user gets write-with-confirmation instructions

**Key rules enforced in the prompt:**

- Always call `get_schema_list` first
- Always call `get_table_definitions` before querying
- NEVER fabricate data — `data` array must come from `execute_sql`
- For write operations: show query to user and wait for `yes`/`confirm` before executing
- For conversational questions: return `data: []` without calling any tools
- Out-of-scope queries (server config, env vars, etc.) → reject immediately

---

#### `ai_agent/providers/` — LLM Provider Factory

| File            | Provider                            |
| --------------- | ----------------------------------- |
| `openrouter.py` | OpenRouter (aggregates many models) |
| `groq.py`       | Groq (fast inference)               |
| `gemini.py`     | Google Gemini                       |
| `ollama.py`     | Ollama (local models)               |

**Priority order:** `openrouter → groq → gemini → ollama`  
Override with `LLM_PROVIDER` env var.

| Function             | What it does                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `get_llm(preferred)` | Returns the singleton LangChain `ChatModel`. Tries each provider in order until one works |
| `LLMDebugLogHandler` | Async callback that logs every message sent to the LLM (for debugging)                    |

---

#### `ai_agent/services/chat_service.py` — Chat History Storage

**Firestore structure:**

```
users/{uid}/workspaces/{connection_id}/
    chats/{chat_id}/
        messages/u_0001   ← user message (turn 1)
        messages/a_0001   ← assistant message (turn 1)
        messages/u_0002   ← user message (turn 2)
        messages/a_0002   ← assistant message (turn 2)
```

| Function                                         | What it does                                                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ensure_workspace(uid, conn_id)`                 | Creates workspace doc if it doesn't exist                                                                                          |
| `create_chat(uid, conn_id, first_message)`       | Creates a new chat doc with UUID. Title = first 60 chars of first_message                                                          |
| `get_or_create_chat(uid, conn_id, chat_id, msg)` | Returns existing `chat_id` or creates a new chat                                                                                   |
| `get_messages(uid, conn_id, chat_id, limit=12)`  | Fetches last 12 messages (6 turns) ordered by `seq` field                                                                          |
| `append_messages(uid, conn_id, chat_id, ...)`    | **Atomic transaction**: increments `turn_count` on chat doc + writes user message + assistant message in one Firestore transaction |
| `_detect_query_type(sql)`                        | Returns `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CONVERSATIONAL`, or `OTHER`                                                       |

**Message IDs are turn-prefixed:**

- User messages: `u_0001`, `u_0002`, …
- Assistant messages: `a_0001`, `a_0002`, …
- Ordering is by the integer `seq` field (`user_seq = turn*2 - 1`, `ai_seq = turn*2`)

---

#### `ai_agent/suggestions.py` — Query Suggestion Generator

| Function                            | What it does                                                                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_get_table_names(conn_id)`         | Gets table list from Redis → Firestore schema cache                                                                                                                         |
| `get_suggestions(conn_id, count=6)` | Returns N natural-language query suggestions. Redis cache (24h TTL) → LLM call. LLM gets table names and generates varied questions (counts, filters, trends, aggregations) |

---

### 🔷 MODULE: `core/`

---

#### `core/redis_client.py` — Redis Client

**Why no singleton pool:** On Windows with `uvicorn --reload`, the event loop is replaced — any persistent connection holds a reference to the OLD loop → `RuntimeError`. Solution: create a fresh `redis.asyncio.Redis` per call.

| Function                        | What it does                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `init_redis()`                  | Startup check — pings Redis at startup to verify connectivity                              |
| `close_redis()`                 | Shutdown hook — no-op since no persistent pool                                             |
| `redis_get(key)`                | JSON-decode a cached value. Returns `None` on miss, error, or 3-second timeout             |
| `redis_set(key, value, ttl)`    | JSON-encode and SET with TTL. Returns `True` on success                                    |
| `redis_delete(*keys)`           | Delete one or more exact keys                                                              |
| `redis_delete_pattern(pattern)` | Delete all keys matching a glob pattern using `SCAN` (production-safe — won't block Redis) |
| `redis_health()`                | Ping Redis and return a status dict with latency_ms                                        |

---

#### `core/cache_keys.py` — Cache Key Registry

**Central file defining ALL Redis keys and TTLs:**

| Key pattern                              | TTL      | What it stores                   |
| ---------------------------------------- | -------- | -------------------------------- |
| `token:{uid}`                            | 55 min   | Decoded Firebase token claims    |
| `user:{uid}`                             | 5 min    | User profile dict                |
| `users:list:{org_id}`                    | 2 min    | All users in an org              |
| `connection:{id}`                        | 2 min    | Single connection doc            |
| `connections:list:{org_id}`              | 2 min    | All connections for an org       |
| `access:{uid}:{conn_id}`                 | 2 min    | Access grant for verify_access() |
| `access:user:{uid}`                      | 2 min    | All grants for a user            |
| `schema:{conn_id}:_tables`               | 1 hour   | Table list from schema tools     |
| `schema:{conn_id}:{schema}__{table}`     | 1 hour   | Column definitions               |
| `suggestions:{conn_id}`                  | 24 hours | AI-generated query suggestions   |
| `history:{uid}`                          | 2 min    | Query history list               |
| `docs:index:{conn_id}`                   | 1 hour   | Business doc summary index       |
| `docs:table:{conn_id}:{schema}__{table}` | 1 hour   | Full table business context      |

---

### 🔷 FRONTEND

---

#### `frontend/src/main.tsx`

Bootstraps the React app: wraps `<App>` in `<AuthProvider>` and `<RouterProvider>`.

---

#### `frontend/src/app/routes.tsx` — Routing

Uses `createHashRouter` (hash-based for Electron/desktop compatibility).

| Route       | Component        | Access                                      |
| ----------- | ---------------- | ------------------------------------------- |
| `/login`    | `Login`          | Public                                      |
| `/signup`   | `Signup`         | Public                                      |
| `/`         | `Dashboard`      | Protected (any auth user)                   |
| `/query`    | `QueryInterface` | Protected                                   |
| `/history`  | `History`        | Protected                                   |
| `/schema`   | `SchemaBrowser`  | Protected                                   |
| `/settings` | `Settings`       | Protected                                   |
| `/reports`  | `Reports`        | Protected                                   |
| `/admin`    | `AdminPanel`     | Protected + requires `db_manager` or higher |

---

#### `frontend/src/context/AuthContext.tsx` — Global Auth State

**Boot sequence (runs on every page load/refresh):**

1. `loading = true` — spinner shown, NO redirect yet
2. Firebase `onAuthStateChanged` fires (0–2s)
3. If `fbUser` exists → check backend session via `GET /me` → set user
4. If `fbUser` is null → set `user = null`
5. `loading = false` → ProtectedRoute now decides: allow or redirect to `/login`

| State       | Meaning                                                                |
| ----------- | ---------------------------------------------------------------------- |
| `loading`   | TRUE during boot — ProtectedRoute MUST NOT redirect while this is true |
| `authReady` | TRUE after first onAuthStateChanged cycle — gate API calls behind this |
| `user`      | Full user profile from Firestore. `null` = not logged in               |
| `error`     | Last login error string                                                |

**Role helper booleans (computed from `user.role`):**

```
isAdmin      → role === "admin"
isDbManager  → role === "admin" OR "db_manager"
isPowerUser  → role === "admin" OR "db_manager" OR "power_user"
isAnalyst    → any logged-in user
```

---

#### `frontend/src/lib/queryService.ts` — Query API Service

**Two modes of query execution:**

| Function                                 | Endpoint                    | How it works                                                                                 |
| ---------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| `executeQuery(payload)`                  | `POST /api/v1/query`        | Standard request-response. Waits for full result                                             |
| `executeQueryStream(payload, callbacks)` | `POST /api/v1/query/stream` | SSE streaming. Fires `onProgress` events while agent works, then `onResult` and `onInsights` |

**SSE event types (streaming):**

```
event: progress  → { stage, message }  (e.g., "Inspecting table structure...")
event: result    → full QueryResponse with data
event: insights  → { numerical_insights, narrative_insights } (Phase 2, after result)
event: error     → { message }
```

**Other functions:**
| Function | Endpoint | What it does |
|---|---|---|
| `getSuggestions(connId)` | `GET /api/v1/query/suggestions` | Fetches AI-generated query suggestions |
| `generateInsights(data, question)` | `POST /api/v1/query/insights` | On-demand insights for existing data |
| `getQueryHistory(params)` | `GET /api/v1/query/history` | Paginated query history |

---

#### `frontend/src/lib/authService.ts`

Handles Firebase Auth calls + backend session management:

- `login(email, password)` → signInWithEmailAndPassword → POST `/api/v1/auth/login` → signInWithCustomToken
- `logout()` → POST `/api/v1/auth/logout` → Firebase signOut
- `getMe()` → GET `/api/v1/auth/me` → returns full user profile
- `hasSession()` → checks localStorage for a session cookie marker

#### `frontend/src/lib/connectionService.ts`

CRUD API calls for managing database connections.

#### `frontend/src/lib/accessService.ts`

API calls for granting/revoking/listing database access grants.

#### `frontend/src/lib/schemaService.ts`

Functions to fetch schema browser data and trigger schema refresh.

#### `frontend/src/lib/chatService.ts`

API calls for listing chats and loading chat history.

---

## 🔑 KEY CONCEPTS

---

### ❓ Q1: What is LangGraph and why did you use it?

**A:** LangGraph is a framework for building **stateful, multi-step AI workflows** as directed graphs. We use it because:

- It manages the flow `entry → react_agent → output_parser` with conditional routing
- It supports **retry loops** — if the LLM returns invalid JSON, the graph automatically loops back to the `react_agent` (up to 3 times)
- The `StateGraph` pattern makes error states explicit — any node can set `error_message` and the graph routes to END immediately
- It's built on LangChain, which gives us tool-calling abstraction

---

### ❓ Q2: What is the ReAct pattern?

**A:** ReAct = **Reasoning + Acting**. The LLM alternates between:

1. **Thought** — decides what to do
2. **Action** — calls a tool (e.g., `get_schema_list`, `execute_sql`)
3. **Observation** — reads the tool's output
4. Repeats until it has enough information to answer

In our system, `create_react_agent(llm, tools)` implements this loop internally. The LLM autonomously decides when to call which tool.

---

### ❓ Q3: How does the two-tier cache work?

**A:**

```
Request
  │
  ▼
Redis (~1ms) ──HIT──→ return cached value
  │
  MISS
  │
  ▼
Firestore (~80ms) ──HIT──→ populate Redis → return value
  │
  MISS
  │
  ▼
Live DB (variable) → populate Redis + Firestore → return value
```

Cache TTLs are short (2 min) for security-sensitive data (access grants) and long (1 hour) for stable data (schema). Cache is **invalidated immediately** on write — revoked access takes effect instantly.

---

### ❓ Q4: How is SQL injection prevented?

**A:** Three layers:

1. **Input-level regex** in `_check_injection()` — blocks `EXEC(`, `xp_cmdshell`, `SLEEP()`, `INTO OUTFILE`, semicolons followed by other statements, etc.
2. **DDL blocking** — `DROP`, `CREATE`, `ALTER`, `TRUNCATE`, etc. are always blocked
3. **Parameterized execution** — SQLAlchemy uses `text()` with bound parameters, never string concatenation

Additionally, `LIMIT 1000` is auto-added to any SELECT without a limit.

---

### ❓ Q5: What is the Role-Based Access Control (RBAC) system?

**A:** Four hierarchical roles:

```
analyst    (0) — read-only SELECT on explicitly granted DBs
power_user (1) — SELECT + write on granted DBs
db_manager (2) — manage connections and grants; restricted user management
admin      (3) — unrestricted access to everything
```

RBAC is enforced at three levels:

1. **FastAPI dependency** (`require_min_role`) — checks the JWT claim at the HTTP layer
2. **Agent prompt** — the system prompt tells the LLM what the user can/cannot do
3. **Tool layer** — `execute_sql` independently re-checks the role before any write operation

---

### ❓ Q6: How does multi-tenancy (organization isolation) work?

**A:** Every resource document in Firestore has an `org_id` field. All Firestore queries filter by `org_id`:

- Users belong to one org
- Database connections belong to one org
- Access grants validate that both the target user AND the target connection belong to the requesting admin's org
- Redis cache keys are scoped: `connections:list:{org_id}` (so Org A never sees Org B's connections)

---

### ❓ Q7: How does streaming (SSE) work?

**A:** When the frontend calls `/api/v1/query/stream`:

1. FastAPI returns a `StreamingResponse` with content-type `text/event-stream`
2. The backend iterates `agent.astream_events(...)` from LangGraph
3. On `on_chain_start → entry`: yields `event: progress` "Connecting to database..."
4. On `on_tool_start → get_schema_list`: yields `event: progress` "Loading schema..."
5. On `on_tool_start → execute_sql`: yields `event: progress` "Executing SQL..."
6. On `on_chain_end → LangGraph`: yields `event: result` with full data
7. Finally, Phase 2 insights are yielded as `event: insights`

The frontend's `executeQueryStream()` reads the `ReadableStream` body, splits on `\n\n`, parses each event block, and fires callbacks (`onProgress`, `onResult`, `onInsights`).

---

### ❓ Q8: What is the system prompt and why is it important?

**A:** The system prompt is the instruction set injected into the LLM at the start of every conversation. It:

- Tells the LLM which tools are available and how to use them in **mandatory order**
- Specifies the **exact JSON schema** the LLM must return (title, sql_query, summary, total_records, data)
- Enforces that the LLM MUST call `execute_sql` (never fabricate results)
- Contains dialect-specific SQL syntax hints (MySQL's `NOW()` vs PostgreSQL's `NOW()` + INTERVAL)
- Injects the user's role permissions (analyst = read-only, power_user = write with confirmation)
- Handles edge cases: conversational questions (no tools needed), out-of-scope queries (reject), write confirmations (ask before DML)

---

### ❓ Q9: How does the output parser retry mechanism work?

**A:**

1. `node_output_parser` tries to `json.loads()` the LLM's output
2. If parsing fails (e.g., LLM returned plain text instead of JSON):
   - If `retry_count < max_retries (3)`: increments `retry_count` and returns state WITHOUT `final_response`
   - The graph router sees no `final_response` + `retry_count > 0` → routes back to `react_agent`
   - A nudge message is added: _"Your previous response was not formatted correctly. Return ONLY valid JSON..."_
3. If `retry_count >= max_retries`: returns error response

---

### ❓ Q10: Explain the chat/conversation memory system.

**A:** Each user has a **workspace** per database connection. Within each workspace, they can have multiple **chats**. Each chat stores **messages** as a Firestore sub-collection.

Before each query, `get_messages()` fetches the last 12 messages (6 conversation turns) from Firestore. These are injected as `HumanMessage`/`AIMessage` objects into the LangGraph agent's initial state — giving it conversational context ("what did I ask before?").

After each query, `append_messages()` writes both the user's question and the AI's full response (including SQL, data, insights, status) atomically in a Firestore transaction.

Message IDs use a turn-prefix system: `u_0001`, `a_0001`, `u_0002`, `a_0002`, ... ensuring predictable ordering.

---

### ❓ Q11: What happens behind the scenes when a user types a question?

**A (step-by-step):**

1. Frontend calls `executeQueryStream()` with `{connection_id, chat_input, chat_id}`
2. Backend route handler calls `get_or_create_chat()` + `get_messages()` for history
3. `run_agent_stream()` is called. Two pre-flight guards run (write-intent check, in-flight dedup)
4. `entry_node` verifies access grant → fetches decrypted DB credentials → builds SQLAlchemy URL
5. `react_agent_node` builds system prompt + chat history → calls `create_react_agent(llm, tools)`
6. LLM calls `get_schema_list` → gets list of all tables
7. LLM calls `get_table_definitions` → gets column definitions + sample values for relevant tables
8. LLM constructs SQL → calls `execute_sql` → gets results (3-row preview + full in cache)
9. LLM returns JSON string: `{title, sql_query, summary, total_records, data}`
10. `output_parser_node` parses JSON, pops full data from cache, yields `event: result`
11. Phase 2: `asyncio.gather()` calls two Gemini functions in parallel → yields `event: insights`
12. `append_messages()` writes both messages to Firestore in one atomic transaction
13. Frontend renders: data table, chart tab, insights tab, history item

---

## 📋 QUICK REFERENCE: TECH STACK

| Layer               | Technology                            | Why                                           |
| ------------------- | ------------------------------------- | --------------------------------------------- |
| Backend Framework   | FastAPI (Python)                      | Async, fast, auto-generates Swagger UI        |
| AI Orchestration    | LangGraph                             | Stateful multi-step agent with retry loops    |
| LLM                 | Groq / Gemini / OpenRouter / Ollama   | Cascading fallback; Gemini for insights       |
| Database            | MySQL, PostgreSQL, MSSQL, Oracle      | Multi-DB support via SQLAlchemy               |
| Auth + DB           | Firebase Admin SDK + Firestore        | No PostgreSQL — all app data in Firestore     |
| Cache               | Redis (optional) + Firestore          | Two-tier: fast Redis → persistent Firestore   |
| Frontend            | React + TypeScript + Vite             | Modern SPA                                    |
| Routing             | React Router (Hash)                   | Works in Electron/desktop                     |
| Auth (frontend)     | Firebase Client SDK                   | `getIdToken()` → Bearer header                |
| Deployment          | Uvicorn (backend), Netlify (frontend) | ASGI server for async Python                  |
| Password Encryption | Fernet (AES-128-CBC)                  | Symmetric encryption for DB passwords at rest |

---

## 🔒 SECURITY SUMMARY

| Threat                   | How mitigated                                                  |
| ------------------------ | -------------------------------------------------------------- |
| SQL Injection            | Regex pattern guards + SQLAlchemy parameterized queries        |
| DDL attacks (DROP TABLE) | First-keyword check blocks DDL always                          |
| Unauthorized DB access   | `verify_access()` called before every query                    |
| Cross-tenant data leak   | All Firestore queries filtered by `org_id`                     |
| Privilege escalation     | Role checked at HTTP layer + prompt layer + tool layer         |
| Password exposure        | AES encrypted at rest; never cached in Redis                   |
| Token replay             | Firebase token verified via RS256 signature; session revocable |
| DDoS / spam              | Rate limiting (slowapi) + in-flight dedup per user             |
| XSS / Clickjacking       | Security headers middleware (X-Frame-Options, CSP)             |
| Large payload attacks    | Request body size limit (1 MB default, 100 MB doc upload)      |

---
