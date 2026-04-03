# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development server (auto-reload)
uvicorn main:app --reload --port 8000

# Production server
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4

# Generate a DB_ENCRYPTION_KEY
python -c "import secrets; print(secrets.token_hex(32))"
```

Swagger UI is available at `http://localhost:8000/docs` when running.

## Environment Setup

Copy `ai_agent/.env.example` to `.env` in the project root. Required variables:

| Variable | Purpose |
|---|---|
| `FIREBASE_CREDENTIALS_JSON` | Full service-account JSON as a single-line string (required) |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `DB_ENCRYPTION_KEY` | 64-char hex string (32 bytes) for AES-256-GCM |
| `OPENROUTER_API_KEY` | Primary LLM provider |
| `GROQ_API_KEY` | Secondary LLM provider |
| `GEMINI_API_KEY` | Tertiary LLM provider |
| `REDIS_URL` | Optional: `redis://localhost:6379/0` |
| `CORS_ORIGINS` | Comma-separated allowed origins |

LLM provider selection is controlled by `LLM_PROVIDER` env var. Auto-fallback order: `openrouter → groq → gemini → ollama`.

## Architecture

### Storage (no PostgreSQL)
- **Firebase Auth** — identity, password hashing, token signing/verification
- **Firestore** — all persistent data: `users`, `database_connections`, `user_db_access` collections; sessions are a sub-collection under each user doc
- **Redis** — optional cache layer (TTL-based). Redis is never used to cache raw passwords. All writes go to Firestore first, then Redis is populated/invalidated.

### Module Layout

```
main.py                  — FastAPI app, lifespan, CORS, router registration
auth/
  core/
    firebase.py          — Firebase Admin SDK init, token verify/create, Firestore helpers
    security.py          — verify_request_token() — the auth hot path (Redis → Firestore)
    config.py            — pydantic-settings Settings class
  routes/
    auth_routes.py       — /api/v1/auth/* endpoints
    dependencies.py      — FastAPI Depends() helpers: get_current_user, RBAC shortcuts
connections/
  core/encryption.py     — AES-256-GCM encrypt/decrypt for DB passwords
  routes/connection_routes.py
  services/connection_service.py
users/
  routes/user_routes.py
  services/user_service.py
access/
  routes/access_routes.py
  services/access_service.py — verify_access() called before every query
core/
  redis_client.py        — stateless Redis helpers (fresh client per call — Windows event loop fix)
  cache_keys.py          — central registry of all cache key names and TTLs
ai_agent/
  state.py               — AgentState TypedDict (shared across all LangGraph nodes)
  graph.py               — LangGraph StateGraph assembly + run_agent() entry point
  llm_provider.py        — LLMProvider ABC + OpenRouter/Groq/Gemini/Ollama implementations
  schema_manager.py      — SQLAlchemy schema reflection + doc context fetch
  sql_validator.py       — multi-stage SQL safety pipeline (injection guard, DDL block, RBAC)
  prompts.py             — system prompt builder (includes sample_values usage rules)
  tools/
    schema_tools.py      — get_schema_list + get_table_definition LangChain tools;
                           get_table_definition runs SELECT DISTINCT on string columns
                           and attaches sample_values to low-cardinality categoricals
    query_tools.py       — execute_sql tool
  routes_query.py        — /api/v1/query/* endpoints (not yet wired into main.py)
```

### RBAC Role Hierarchy

```
analyst (0)     — SELECT queries on assigned DBs only
power_user (1)  — SELECT + write queries on assigned DBs (if granted)
db_manager (2)  — manages connections + grants; cannot manage users/roles
admin (3)       — full control
```

Use dependency aliases from `auth/routes/dependencies.py`:
- `Depends(require_analyst)` — any authenticated user
- `Depends(require_power_user)` — power_user, db_manager, admin
- `Depends(require_db_manager)` — db_manager, admin
- `Depends(require_admin)` — admin only (exact match)

### LangGraph AI Agent Pipeline (`ai_agent/`)

The NL2SQL pipeline is a compiled `StateGraph` singleton (`get_agent()`). All nodes share `AgentState`. Flow:

```
load_schema → generate_sql → classify_and_validate
    ├── CLARIFY   → return_clarification → END
    ├── WRITE_OP  → return_preview → END
    ├── INVALID   → retry_generate → generate_sql (max 2 retries, then END with error)
    └── SELECT    → execute_query → format_results → END
```

Entry point for routes: `await run_agent(...)` in `ai_agent/graph.py`. Returns a dict with `response_type` (`results | preview | clarification | error`) and `final_response`.

SELECT queries are hard-capped at 10,000 rows. Write operations return a preview (`requires_confirmation: True`) and are not executed until the frontend calls a separate `/execute` endpoint.

### Redis Cache Patterns

All cache key names are defined in `core/cache_keys.py`. Key patterns:
- `token:{firebase_uid}` — TTL 55 min
- `user:{firebase_uid}` — TTL 5 min
- `connection:{id}` — TTL 2 min; **passwords are never cached**
- `access:{uid}:{conn_id}` — TTL 2 min; invalidated immediately on revoke (security-critical)
- `schema:tables:{conn_id}` — TTL 1 h; list of all tables
- `schema:def:{conn_id}:{schema}:{table}` — TTL 1 h; column definitions **including `sample_values`**

Schema cache can be force-cleared via `POST /api/v1/connections/{id}/schema/refresh`.

Redis client is stateless (no singleton pool) to avoid Windows `uvicorn --reload` event loop issues.

### Firebase Token Flow

1. Client signs in via Firebase SDK → gets Firebase ID token
2. Client sends ID token to `POST /api/v1/auth/login`
3. Server verifies with `firebase_auth.verify_id_token()` → creates custom token with `{role}` claim
4. Client exchanges custom token → gets fresh ID token carrying the role
5. All subsequent requests use `Authorization: Bearer <fresh_id_token>`
6. Server verifies token → Redis cache check → Firestore user check on miss

New users are created with role `analyst` by default. Role changes require an admin via the users API.

### Enum Value Sampling in NL2SQL

The `get_table_definition` tool (`ai_agent/tools/schema_tools.py`) automatically runs
`SELECT DISTINCT` on string columns (VARCHAR, CHAR, TEXT, ENUM, NVARCHAR, etc.) that are
not primary keys or foreign keys. The distinct values are stored as `sample_values` on the
column definition and surfaced to the LLM.

**Why:** Without this, the LLM guesses filter values (e.g. `WHERE status = 'Leave'` instead
of the real value `'On Leave'`), causing queries to silently return zero rows.

**Design decisions:**
- Threshold: columns with **> 20 distinct values** are treated as free-text (names, emails,
  addresses) and are not sampled.
- Enabled on **all connections by default**.
- `sample_values` is stored in both **Redis** and **Firestore** as part of the schema cache,
  so `SELECT DISTINCT` only runs once per cache TTL (1 hour) per table.
- The helper `_sample_enum_values()` is always safe to call — any error (permissions,
  timeout, etc.) is silently caught and returns `[]`; schema loading never fails because of it.
- The system prompt (`prompts.py`) explicitly instructs the LLM:
  > *"NEVER guess column values — if a column has a `sample_values` list, use ONLY those
  > exact values in WHERE clause conditions."*

**Firestore schema cache path:**
```
database_connections/{connection_id}/schema_cache/{schema}__{table}
  → { columns: [..., { column_name, data_type, sample_values: [...] }], cached_at }
```

**To force a re-sample** (e.g. after adding new enum values to the DB):
```bash
POST /api/v1/connections/{id}/schema/refresh
```
