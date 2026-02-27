# Talk2Tables — Developer README

> **AI-Powered Conversational SQL Assistant for Industrial Databases**
> Diploma Final Year Project | 3rd Year Computer Engineering | Mumbai, 2025–26
> UX4G (Government of India Design System) Compliant

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [What Has Been Built](#3-what-has-been-built)
4. [File-by-File Code Documentation](#4-file-by-file-code-documentation)
   - [state.py](#41-statepy)
   - [llm_provider.py](#42-llm_providerpy)
   - [prompts.py](#43-promptspy)
   - [schema_manager.py](#44-schema_managerpy)
   - [sql_validator.py](#45-sql_validatorpy)
   - [graph.py](#46-graphpy)
   - [routes_query.py](#47-routes_querypy)
   - [__init__.py](#48-__init__py)
   - [main.py](#49-mainpy)
   - [requirements.txt](#410-requirementstxt)
   - [.env.example](#411-envexample)
5. [How a Query Flows Through the System](#5-how-a-query-flows-through-the-system)
6. [LLM Provider Strategy](#6-llm-provider-strategy)
7. [SQL Safety Pipeline](#7-sql-safety-pipeline)
8. [Multi-Turn Conversation Memory](#8-multi-turn-conversation-memory)
9. [What To Do Next](#9-what-to-do-next)
10. [Task Distribution — Team of 3](#10-task-distribution--team-of-3)
11. [How to Run the Project Locally](#11-how-to-run-the-project-locally)
12. [Environment Variables Reference](#12-environment-variables-reference)
13. [API Endpoint Reference](#13-api-endpoint-reference)
14. [Database Support Matrix](#14-database-support-matrix)

---

## 1. Project Overview

### What is Talk2Tables?

Talk2Tables is a web application that lets **non-technical users** — plant floor technicians, operations managers, supervisors — query and modify complex industrial databases using **plain English (or Hindi)**, without knowing any SQL.

A user types something like:

> *"Show me all sensors in Zone A that are overdue for calibration"*

And Talk2Tables:
1. Understands the intent using an AI language model
2. Generates the correct SQL query for the connected database
3. Executes it safely
4. Returns the results as a formatted table, with an optional chart

For write operations (UPDATE, DELETE, INSERT), the system shows a **preview with a warning** and requires explicit user confirmation before executing — this is the core safety mechanism.

### Problem Being Solved

In manufacturing and engineering environments, databases contain massive interconnected datasets (sensor readings, calibration records, maintenance logs, equipment data). Accessing this data requires skilled SQL developers, which creates:

- A knowledge barrier for non-technical staff
- IT teams overloaded with routine data requests
- Risk when performing writes without schema expertise

Talk2Tables eliminates this bottleneck.

### Tech Stack at a Glance

| Layer | Technology |
|---|---|
| Frontend | React.js + Vite + UX4G Design System |
| Backend API | Python 3.11 + FastAPI |
| AI Agent | LangGraph + LangChain Core |
| Primary LLM | OpenRouter → Qwen2.5-Coder-32B |
| Fallback LLMs | Groq → Gemini Flash → Ollama (local) |
| Database ORM | SQLAlchemy 2.0 |
| SQL Validation | sqlparse + custom pipeline |
| Auth | JWT (PyJWT) + bcrypt |
| Databases Supported | MySQL, PostgreSQL, SQLite, SQL Server, Oracle, MariaDB |

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    LAYER 1: PRESENTATION                        │
│         React.js Web App  (UX4G Design System)                  │
│                                                                 │
│   Chat UI  │  SQL Viewer  │  Charts  │  Export  │  Auth        │
└─────────────────────────┬───────────────────────────────────────┘
                          │  HTTPS / REST API (JSON)
┌─────────────────────────▼───────────────────────────────────────┐
│                    LAYER 2: APPLICATION                         │
│              Python FastAPI  (main.py)                          │
│                                                                 │
│  ┌──────────────────┐    ┌──────────────────────────────────┐   │
│  │  Auth + RBAC     │    │     AI SQL Agent (LangGraph)     │   │
│  │  JWT / bcrypt    │    │                                  │   │
│  └──────────────────┘    │  load_schema                     │   │
│                          │      ↓                           │   │
│  ┌──────────────────┐    │  generate_sql (LLMProvider)      │   │
│  │  Query History   │    │      ↓                           │   │
│  │  Audit Logger    │    │  classify_and_validate           │   │
│  └──────────────────┘    │      ↓                           │   │
│                          │  execute_query / preview / retry │   │
│                          └──────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────────┘
                          │  SQLAlchemy
┌─────────────────────────▼───────────────────────────────────────┐
│                    LAYER 3: DATA                                │
│                                                                 │
│  Target DB (MySQL/PG)  │  System DB (PostgreSQL/SQLite)        │
│  Industrial data that  │  Users, roles, connections,           │
│  users query           │  query history, schema docs           │
└─────────────────────────────────────────────────────────────────┘
```

### LangGraph Agent State Machine

The AI agent is modelled as a state machine. Each box is a **node** (a Python function), and the arrows show how the agent decides what to do next:

```
[START]
   │
   ▼
[load_schema]
   Reflects live DB schema via SQLAlchemy.
   Also fetches any uploaded schema docs (PDFs, Word files).
   │
   ▼
[generate_sql]
   Calls the active LLM provider (OpenRouter / Groq / Gemini / Ollama).
   On retry, sends back the error reason so the LLM can self-correct.
   │
   ▼
[classify_and_validate]
   Runs the 10-stage SQL safety pipeline.
   │
   ├── "CLARIFY:"  ──► [return_clarification]
   │                   Sends LLM's question back to user.
   │                   User answers → next turn resolves it.
   │
   ├── "WRITE_OP:" ──► [return_preview]
   │                   Returns SQL + risk level to frontend.
   │                   User must click Confirm before execution.
   │
   ├── INVALID     ──► [retry_generate]  (max 2 retries)
   │                   Increments retry counter.
   │                   Feeds error reason back into generate_sql.
   │                   After 2 failures → returns error response.
   │
   └── SELECT      ──► [execute_query]
                       Runs the SQL against the target database.
                       Hard cap: 10,000 rows returned.
                       │
                       ▼
                   [format_results]
                       Builds final response: results + summary.
                       Appends turn to conversation history.
                       │
                       ▼
                      [END]
```

---

## 3. What Has Been Built

The following files make up the complete **AI SQL Agent backend core**. They live in `backend/ai_agent/`.

| File | Lines | Status | What it does |
|---|---|---|---|
| `state.py` | 139 | ✅ Complete | Defines `AgentState` — the shared data object passed between all LangGraph nodes |
| `llm_provider.py` | 441 | ✅ Complete | All 4 LLM providers with cascading fallback (OpenRouter → Groq → Gemini → Ollama) |
| `prompts.py` | 161 | ✅ Complete | System prompt template v2.0 with dual-context injection (schema + docs) |
| `schema_manager.py` | 297 | ✅ Complete | SQLAlchemy schema reflection for 6 database dialects + schema doc context fetcher |
| `sql_validator.py` | 276 | ✅ Complete | 10-stage SQL safety validation pipeline |
| `graph.py` | 742 | ✅ Complete | LangGraph StateGraph — 8 nodes, all routing logic, `run_agent()` public API |
| `routes_query.py` | 322 | ✅ Complete | FastAPI route handlers for `/api/query`, `/api/query/execute`, `/api/schema/tables` |
| `__init__.py` | 51 | ✅ Complete | Package exports — clean public API for the rest of the backend |
| `main.py` | 201 | ✅ Complete | FastAPI app bootstrap — CORS, middleware, route registration, health check |
| `requirements.txt` | — | ✅ Complete | All Python dependencies with pinned versions |
| `.env.example` | — | ✅ Complete | All environment variables documented |
| **Total** | **~2,630** | | |

---

## 4. File-by-File Code Documentation

This section explains every file in plain language. Read this instead of the code when you need to understand what something does.

---

### 4.1 `state.py`

**What it is:** A Python `TypedDict` called `AgentState`. Think of it as the **memory** of the AI agent — a dictionary that all nodes read from and write to as a query moves through the pipeline.

**Why it exists:** LangGraph requires a shared state object to be passed between nodes. Instead of using loose variables or globals, everything the agent knows about a query lives in this one typed dictionary. This makes the code predictable and easy to debug.

**Key fields and what they mean:**

| Field | Type | Purpose |
|---|---|---|
| `natural_language_query` | `str` | The raw text the user typed |
| `db_connection_string` | `str` | SQLAlchemy URL for the target database |
| `db_dialect` | `str` | Database type: `mysql`, `postgresql`, `sqlite`, `mssql`, `oracle`, `mariadb` |
| `user_id` | `str` | Who is making this request (from JWT) |
| `user_role` | `str` | `admin`, `power_user`, or `viewer` — controls write access |
| `connection_id` | `str` | UUID of the DB connection record in the system DB |
| `chat_history` | `list[ChatMessage]` | All previous turns in this conversation session |
| `schema_context` | `str` | Live DB schema as DDL text (populated by `load_schema` node) |
| `doc_context` | `str` | Text extracted from uploaded schema docs (populated by `load_schema` node) |
| `generated_sql` | `str` | SQL returned by the LLM (populated by `generate_sql` node) |
| `llm_provider_used` | `str` | Which LLM actually generated the SQL (for transparency in UI) |
| `clarification_question` | `str` | If the LLM couldn't understand the query, this is the question it asks the user |
| `validation_result` | `ValidationResult` | Structured output from the SQL safety pipeline |
| `retry_count` | `int` | How many times SQL generation has been retried (max 2) |
| `retry_error_context` | `str` | The error message from the last failed validation — passed back to LLM on retry |
| `query_results` | `list[dict]` | Rows returned from the database (max 10,000) |
| `execution_time_ms` | `float` | How long the query took to run |
| `response_type` | `str` | `results`, `preview`, `clarification`, or `error` — tells the frontend what kind of response this is |
| `final_response` | `dict` | The complete structured response sent back to the API route |

`ChatMessage` is a separate TypedDict with just `role` (`user` or `assistant`) and `content` (the text).

`ValidationResult` is a TypedDict with `is_valid`, `operation_type`, `error`, `sanitized_sql`, and `risk_level`.

---

### 4.2 `llm_provider.py`

**What it is:** The LLM abstraction layer — four provider classes behind one interface, with automatic cascading fallback.

**Why it exists:** The architecture specification requires that switching LLM providers requires zero code changes — only an environment variable. This file achieves that by making all providers implement the same `LLMProvider` abstract base class with a single `generate_sql()` method.

**The four providers:**

**`OpenRouterProvider` (PRIMARY)**
Calls the OpenRouter API (`openrouter.ai`), which is a gateway to 100+ models. The default model is `qwen/qwen-2.5-coder-32b-instruct` — a model specifically fine-tuned for code and SQL generation. Uses an OpenAI-compatible API format. Requires `OPENROUTER_API_KEY`.

**`GroqProvider` (SECONDARY)**
Calls the Groq API which runs models on specialised LPU (Language Processing Unit) hardware, delivering around 1.5 second response times. Default model: `qwen-2.5-coder-32b`. Also OpenAI-compatible. Requires `GROQ_API_KEY`.

**`GeminiProvider` (TERTIARY)**
Calls Google's Gemini API. Default model: `gemini-1.5-flash`. Uses a different request format from OpenAI (separate `systemInstruction` field, `model`/`user` roles instead of `assistant`/`user`). Notably supports Hindi language queries. Requires `GEMINI_API_KEY`.

**`OllamaProvider` (OPTIONAL — LOCAL)**
Calls a locally-running Ollama instance at `localhost:11434`. Default model: `qwen2.5-coder:7b` (quantized, runs on CPU). No API key needed. Ideal for air-gapped deployments where data cannot leave the network. Timeout is 120 seconds (CPU inference is slow). Requires Ollama to be running (`docker exec ollama ollama pull qwen2.5-coder:7b`).

**How the factory works (`get_llm_provider()`):**
The function reads `LLM_PROVIDER` from the environment. If set, it tries that provider first, then falls through the priority chain (openrouter → groq → gemini → ollama) if instantiation fails (e.g. because a key is missing). If no provider can be instantiated, it raises a `RuntimeError` with a helpful message.

**Key helper functions:**
- `_build_messages()` — assembles the OpenAI-compatible messages array (system prompt + trimmed chat history + current query). Trims history to the last `MAX_HISTORY_TURNS` turns to stay within token limits.
- `_build_gemini_contents()` — same but in Gemini's format.
- `_clean_llm_output()` — strips markdown code fences (` ```sql ... ``` `) that LLMs sometimes add despite being told not to.

**Temperature:** All providers use `temperature=0.1` — a low value that makes the LLM more deterministic and less creative, which is what you want for SQL generation.

---

### 4.3 `prompts.py`

**What it is:** The system prompt template for the NL2SQL LLM call, and a helper for building retry prompts.

**Why it exists:** The system prompt is the most important piece of the entire system — it's what tells the LLM how to behave. It's kept in a dedicated file so it's easy to iterate on without touching the agent logic.

**The master system prompt (`_MASTER_SYSTEM_PROMPT`):**

It has five sections injected via Python string formatting:

1. **Role definition** — tells the LLM it is an SQL assistant for an industrial database
2. **Database Information** — injects the `db_dialect` (mysql, postgresql, etc.) and the live `schema_context` (CREATE TABLE DDL from SQLAlchemy)
3. **Additional Context From Documentation** — injects `doc_context` (text extracted from user-uploaded PDFs, Word docs, Excel files). This section is what makes the LLM understand things like "the `val` column in `sensor_readings` means millivolts, not raw ADC" — business knowledge that can't be inferred from the schema alone
4. **Strict Rules** — 13 rules the LLM must follow: return only SQL, use LIMIT 1000, never DROP/TRUNCATE, prefix write ops with `WRITE_OP:`, use `CLARIFY:` for ambiguous queries, understand Hindi, etc.
5. **Output format examples** — shows the LLM exactly what correct and incorrect output looks like

**`build_system_prompt(db_dialect, schema_context, doc_context)`:**
The public function that assembles the full system prompt. Called by the `generate_sql` node in `graph.py` before every LLM call.

**`build_retry_user_message(original_query, failed_sql, error_reason)`:**
Builds a special user message for retry attempts. Instead of just sending the original query again, this gives the LLM the original query, the SQL it generated that failed, and a clear explanation of why it failed. This significantly improves retry success rates.

---

### 4.4 `schema_manager.py`

**What it is:** Two functions — one to reflect the live database schema, one to fetch schema doc text — plus dialect detection and a table-list utility.

**Why it exists:** The LLM needs to know what tables and columns exist in the database to generate correct SQL. SQLAlchemy's `inspect()` API can reflect this from any supported database automatically, without needing pre-written schema files.

**`get_schema_context(connection_string, db_dialect)`:**

Uses `sqlalchemy.inspect()` to walk every table in the database and build a human-readable DDL description like:

```
TABLE: sensors
  - sensor_id    VARCHAR(50)    PK
  - name         VARCHAR(200)   NOT NULL
  - location_id  INTEGER        FK → locations.location_id
  - unit         VARCHAR(20)    NOT NULL
  INDEX: (location_id)
```

For each table it collects: column names, types, nullability, primary key markers, foreign key relationships, and indexes. The output is truncated at 12,000 characters (roughly 3,000 tokens) if the schema is very large.

**`get_doc_context(connection_id, system_db_session)`:**

Queries the `connection_schema_docs` table in the system database to find any text that was extracted from uploaded schema documentation for this connection. Multiple documents are concatenated and truncated to 8,000 characters. Returns `None` if no docs have been uploaded. This is an `async` function because it uses SQLAlchemy's async session from FastAPI's dependency injection.

**`detect_dialect(connection_string)`:**

Reads the prefix of the connection string to detect the database dialect. For example, `mysql+pymysql://...` → `mysql`, `postgresql+psycopg2://...` → `postgresql`. Returns `mysql` as a safe default.

**`get_table_list(connection_string)`:**

Returns a lightweight list of `{"table": name, "columns": count}` dicts for the frontend schema explorer sidebar. Does not include column details — just names and counts for a quick overview.

---

### 4.5 `sql_validator.py`

**What it is:** A 10-stage SQL safety pipeline that every piece of LLM-generated SQL must pass through before being executed.

**Why it exists:** LLMs can generate syntactically valid but dangerous SQL. They can also return special directives (`CLARIFY:`, `WRITE_OP:`) that need to be detected and routed differently. This pipeline handles both.

**The 10 stages (in order):**

| Stage | What it checks | On failure |
|---|---|---|
| 1. LLM Directive Check | Does the SQL start with `CLARIFY:` or `WRITE_OP:`? | Returns the directive type — not a failure |
| 2. Empty SQL Check | Is the SQL empty? | Returns `is_valid=False` |
| 3. Injection Guard | Scans for 14 regex patterns: stacked queries (`;`), `EXEC()`, `xp_cmdshell`, `sp_executesql`, `mysql.user`, `pg_shadow`, `INTO OUTFILE`, `LOAD_FILE`, `SLEEP()`, `WAITFOR DELAY`, `BENCHMARK()`, bypass comments | Returns `is_valid=False` |
| 4. sqlparse Parsing | Can sqlparse parse the SQL? | Returns `is_valid=False` |
| 5. Multi-statement Block | Are there multiple statements? | Returns `is_valid=False` |
| 6. Operation Type Detection | What is the first SQL keyword? SELECT / INSERT / UPDATE / DELETE / DDL? | Used for routing |
| 7. DDL Guard | Is it DROP, TRUNCATE, CREATE, ALTER, RENAME, GRANT, REVOKE? | Returns `is_valid=False` |
| 8. RBAC Check | Is it a write op? Does the user have `admin` or `power_user` role? | Returns `is_valid=False` for viewers |
| 9. Row Limit Enforcement | Does the SELECT have a LIMIT clause? | Auto-appends `LIMIT 1000` if missing |
| 10. Risk Assessment | Is there a WHERE clause on UPDATE/DELETE? | Returns `risk_level`: `safe` / `moderate` / `high` |

**`validate_sql(raw_sql, user_role, db_dialect)`:**
The main entry point. Returns `(ValidationResult, clarification_question)`. The `clarification_question` is only populated when the LLM returned a `CLARIFY:` directive.

**`validate_confirmed_write(confirmed_sql, user_role)`:**
A lighter re-validation called when the user clicks "Confirm" on a write operation preview. Ensures the SQL hasn't been tampered with between preview and execution.

**Risk levels explained:**
- `safe` — any SELECT query
- `moderate` — INSERT (non-bulk), UPDATE/DELETE with a WHERE clause
- `high` — UPDATE/DELETE without a WHERE clause (would affect all rows), bulk INSERT via SELECT

---

### 4.6 `graph.py`

**What it is:** The core of the entire AI agent. Defines all 8 LangGraph nodes, 6 edge routing functions, assembles the `StateGraph`, and exposes `run_agent()` — the single function that FastAPI routes call.

**Why LangGraph:** A plain function chain can't handle branching logic like "if the LLM asks for clarification, return that; if it's a write op, return a preview; if it fails validation, retry up to 2 times; if it fails twice, return an error." LangGraph makes these conditional flows explicit, readable, and testable.

**The 8 nodes:**

**`node_load_schema`**
Detects the database dialect from the connection string. Calls `get_schema_context()` to reflect the live schema. Optionally calls `get_doc_context()` to fetch schema doc text. If schema loading fails completely (e.g. wrong credentials), immediately sets `response_type=error` and the graph jumps to END.

The `system_db_session` (for fetching doc context) is injected via `RunnableConfig.configurable` — a LangGraph mechanism for passing runtime dependencies into nodes without hardcoding them.

**`node_generate_sql`**
Calls `build_system_prompt()` to assemble the full system prompt. On retry attempts, calls `build_retry_user_message()` instead of using the raw query. Gets an LLM provider via `get_llm_provider()` (with cascading fallback). Calls `provider.generate_sql()`. Stores the result and the provider name in state.

**`node_classify_and_validate`**
Calls `validate_sql()` from `sql_validator.py`. Stores the full `ValidationResult` in state and any clarification question separately.

**`node_execute_query`**
Creates a SQLAlchemy engine from the connection string. Executes the sanitized SQL. Fetches up to 10,000 rows. Serializes rows to JSON-safe dicts (handles `datetime`, `Decimal`, `bytes`). Records execution time.

**`node_format_results`**
Builds the `final_response` dict that gets returned to the frontend: SQL, results, column metadata, a human-readable summary ("Found 42 records with columns: sensor_id, name, next_due..."), row count, execution time, and LLM provider name. Appends the user query and generated SQL to `chat_history` for multi-turn memory.

**`node_return_preview`**
Builds the write operation preview response: the SQL, operation type, estimated affected rows, risk level, and a warning message. The estimated affected row count is calculated by running a `SELECT COUNT(*)` with the same WHERE clause — if that fails, it returns `-1` which signals the frontend to show "all rows" as a warning.

**`node_return_clarification`**
Packages the LLM's clarification question into `final_response`. Appends to chat history so the user's answer in the next turn has proper context.

**`node_retry_generate`**
Increments `retry_count`. Copies the validation error into `retry_error_context`. The router then sends the graph back to `node_generate_sql`.

**The routing functions:**

- `route_after_schema_load` — error → END, otherwise → generate_sql
- `route_after_generate` — error → END, otherwise → classify_and_validate
- `route_after_validation` — CLARIFY → return_clarification | WRITE_OP → return_preview | invalid + retries left → retry_generate | invalid + max retries → END | valid SELECT → execute_query
- `route_after_retry` — always → generate_sql
- `route_after_execute` — error → END, otherwise → format_results

**`build_agent_graph()`:**
Assembles the StateGraph by registering nodes, setting START → load_schema, and wiring all conditional edges. Compiles the graph. Called once at startup.

**`get_agent()`:**
Returns the singleton compiled agent graph. The graph is compiled once when first called and reused for every request.

**`run_agent()`:**
The public API. Called by `routes_query.py`. Builds the initial `AgentState` with all input fields, calls `agent.ainvoke()` (async), and returns a clean dict with `response_type`, `final_response`, updated `chat_history`, and `llm_provider`.

---

### 4.7 `routes_query.py`

**What it is:** Three FastAPI route handlers that connect the HTTP API to the AI agent.

**`POST /api/query`**
Accepts a natural language query + database connection ID + chat history. Looks up the DB connection details (connection string, dialect) from the system database. Runs `run_agent()`. Returns a unified `QueryResponse` with `response_type` and `final_response`.

⚠️ **Contains stubs:** `get_current_user()`, `get_system_db()`, and `get_connection_info()` are placeholder implementations with `TODO` comments. Member 3 needs to replace these with real implementations.

**`POST /api/query/execute`**
Called when the user clicks "Confirm" on a write operation preview. First checks RBAC (viewers are rejected with 403). Re-validates the confirmed SQL (prevents tampering). Executes inside a `engine.begin()` transaction (auto-rollback on error). Logs to audit trail. Returns success with affected row count.

**`GET /api/schema/tables/{db_id}`**
Returns the list of tables and column counts for the schema explorer sidebar in the UI. Calls `get_table_list()` from `schema_manager.py`.

**Request/Response models (Pydantic):**
- `QueryRequest` — `natural_language` (string, 1–2000 chars), `db_id` (string), `chat_history` (list of dicts)
- `ExecuteWriteRequest` — `confirmed_sql`, `db_id`, `session_token`
- `QueryResponse` — `response_type`, `final_response`, `chat_history`, `llm_provider`

---

### 4.8 `__init__.py`

**What it is:** The package's public API. Explicitly lists everything that should be importable from `ai_agent` as a module.

**Why it matters:** Without this, other parts of the backend would need to import from deep internal paths like `from ai_agent.graph import run_agent`. With it, they can write `from ai_agent import run_agent`. Also makes refactoring easier — internal file names can change without affecting importers.

**Exports:** `run_agent`, `get_agent`, `AgentState`, `ChatMessage`, `ValidationResult`, `get_llm_provider`, `LLMProvider`, `get_schema_context`, `get_doc_context`, `detect_dialect`, `get_table_list`, `validate_sql`, `validate_confirmed_write`, `build_system_prompt`.

---

### 4.9 `main.py`

**What it is:** The FastAPI application entry point. Every FastAPI app has exactly one of these.

**`lifespan` context manager:**
Runs startup code before the server begins accepting requests. Pre-compiles the LangGraph agent (so the first user request doesn't hit a compilation delay), logs which LLM provider is configured, and logs the Swagger docs URL. On shutdown, logs a graceful shutdown message.

**CORS Middleware:**
Allows the React frontend (running on port 3000 or 5173 during development) to make API calls to the backend (port 8000). CORS origins are read from the `CORS_ORIGINS` environment variable, comma-separated.

**Request Timing Middleware:**
Wraps every request. Measures wall-clock time from first byte to last byte of response. Adds an `X-Response-Time: <ms>ms` header to every response. Useful for monitoring whether the system is hitting the <3 second AI target from the spec.

**Global Exception Handler:**
Catches any unhandled Python exception and returns a consistent JSON error shape: `{"error": "...", "message": "...", "path": "..."}`. This prevents stack traces from leaking to the frontend and ensures the React app always gets parseable JSON.

**Route Registration:**
`query_router` from `routes_query.py` is registered. Commented-out lines show where `auth_router`, `admin_router`, `schema_docs_router`, and `connections_router` should be added as they're built.

**Health Check (`GET /health`):**
Returns `{"status": "ok"}`. Used by Docker Compose `healthcheck:` and Kubernetes readiness probes to know when the container is ready to serve traffic.

---

### 4.10 `requirements.txt`

All Python dependencies with pinned versions, organised by category: web framework (FastAPI + Uvicorn), AI/LangGraph (langgraph, langchain-core, httpx), SQL/Database (SQLAlchemy, sqlparse, DB drivers), Auth (PyJWT, passlib), Data/Export (pandas, openpyxl), Schema Doc Extraction (pdfplumber, python-docx), Validation (pydantic), Utilities (python-dotenv), and Testing (pytest, pytest-asyncio).

**Install with:** `pip install -r requirements.txt`

DB drivers (pyodbc for SQL Server, cx-Oracle for Oracle) are commented out because they require system-level dependencies and should only be installed if those databases are needed.

---

### 4.11 `.env.example`

Template for the `.env` file. Contains every environment variable the system uses, with comments explaining each one. **Never commit the actual `.env` file to Git** — only this example file.

---

## 5. How a Query Flows Through the System

Here's a concrete walkthrough of what happens when a user submits a query:

**User types:** *"Show sensors overdue for calibration in the next 30 days"*

**Step 1 — Frontend → API**
React sends `POST /api/query` with:
```json
{
  "natural_language": "Show sensors overdue for calibration in the next 30 days",
  "db_id": "conn-abc123",
  "chat_history": []
}
```

**Step 2 — Auth Middleware**
FastAPI extracts the JWT from the `Authorization` header. Decodes it to get `user_id` and `user_role`. If invalid → 401.

**Step 3 — Route Handler**
`routes_query.py` fetches the connection string for `conn-abc123` from the system DB. Calls `run_agent()`.

**Step 4 — `node_load_schema`**
SQLAlchemy connects to the target MySQL database. Reflects all tables: `sensors`, `calibrations`, `locations`, `technicians`, `sensor_readings`, `equipment`. Builds DDL text. Checks for uploaded schema docs — none found.

**Step 5 — `node_generate_sql`**
Builds the system prompt with the reflected schema injected. Calls OpenRouter (Qwen2.5-Coder-32B). The LLM returns:
```sql
SELECT s.sensor_id, s.name, c.next_due, l.zone_name
FROM sensors s
JOIN calibrations c ON s.sensor_id = c.sensor_id
JOIN locations l ON s.location_id = l.location_id
WHERE c.next_due <= DATE_ADD(NOW(), INTERVAL 30 DAY)
  AND c.status != 'completed'
ORDER BY c.next_due ASC
LIMIT 1000
```

**Step 6 — `node_classify_and_validate`**
No CLARIFY/WRITE_OP prefix → proceed to validation.
No injection patterns found. sqlparse parses it successfully. Operation type: SELECT. No DDL keywords. RBAC: SELECT is allowed for all roles. Already has LIMIT. Risk: safe. ✅ Valid.

**Step 7 — `node_execute_query`**
SQLAlchemy executes the query. Returns 12 rows. Execution time: 47ms.

**Step 8 — `node_format_results`**
Builds response: SQL, 12 rows, column metadata, summary ("Found 12 records with columns: sensor_id, name, next_due, zone_name"), execution time: 47ms, LLM provider: openrouter/qwen-2.5-coder-32b-instruct. Appends turn to `chat_history`.

**Step 9 — API → Frontend**
Returns `QueryResponse` with `response_type: "results"` and the full payload. React renders the table, shows the SQL in the SQL Viewer, and since all 4 columns are present and `next_due` is a date, the chart component auto-generates a bar chart.

---

## 6. LLM Provider Strategy

The system uses a cascade — it tries each provider in order and falls back automatically if a key is missing or a provider throws an error.

```
Priority: OpenRouter → Groq → Gemini → Ollama
```

| Provider | Speed | Cost | Best for |
|---|---|---|---|
| OpenRouter | ~1.5s | Free tier available | Primary — widest model choice |
| Groq | ~1.5s | Free tier | Backup — very fast LPU hardware |
| Gemini Flash | ~2.5s | Free tier | Fallback — good Hindi support |
| Ollama (local) | 10–30s | Free | Air-gapped / offline deployments |

All providers use `temperature=0.1` for deterministic output and `max_tokens=1024` — enough for SQL but not so much that the LLM rambles.

**To switch providers**, set `LLM_PROVIDER=groq` in `.env`. No code changes needed.

---

## 7. SQL Safety Pipeline

Every piece of AI-generated SQL goes through these checks before any database interaction:

```
Raw LLM output
     │
     ▼
[1] Directive check → CLARIFY: or WRITE_OP: prefix?
     │
     ▼
[2] Empty check → is the SQL empty?
     │
     ▼
[3] Injection guard → 14 regex patterns for known attacks
     │
     ▼
[4] sqlparse → is the SQL syntactically valid?
     │
     ▼
[5] Multi-statement → more than one statement?
     │
     ▼
[6] Operation type → SELECT / INSERT / UPDATE / DELETE / DDL
     │
     ▼
[7] DDL guard → DROP, TRUNCATE, CREATE, ALTER etc?
     │
     ▼
[8] RBAC → write op but user is viewer?
     │
     ▼
[9] Row limit → SELECT without LIMIT? → auto-append LIMIT 1000
     │
     ▼
[10] Risk assessment → high / moderate / safe
     │
     ▼
Sanitized SQL + ValidationResult
```

Write operations (INSERT/UPDATE/DELETE) that pass all checks are not executed immediately. They trigger the **Preview → Confirm → Execute** workflow where the user must explicitly click Confirm in the UI.

---

## 8. Multi-Turn Conversation Memory

The agent maintains conversation history across query turns within a session. This allows queries like:

> Turn 1: *"Show sensors in Zone A"*
> Turn 2: *"Which of those are overdue for calibration?"* ← refers to "those"

The `chat_history` list (a list of `ChatMessage` dicts with `role` and `content`) is passed into the LLM prompt on every request. The system keeps the last `MAX_HISTORY_TURNS` pairs (default: 6 pairs = 12 messages) to avoid exceeding token limits.

After each successful query, the user's question and the generated SQL are appended to `chat_history` and returned to the frontend. The frontend is responsible for storing this and sending it back with the next request.

---

## 9. What To Do Next

### Immediate (Week 3–4) — Member 3 Priority

These stubs in `routes_query.py` must be replaced with real implementations before the agent can be tested end-to-end:

**1. Implement `get_current_user()`**
```python
# Replace the stub with real JWT verification:
from fastapi.security import HTTPBearer
from jose import jwt

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    return {"user_id": payload["sub"], "role": payload["role"]}
```

**2. Implement `get_system_db()`**
```python
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

engine = create_async_engine(os.getenv("DATABASE_URL"))
async_session_maker = async_sessionmaker(engine)

async def get_system_db():
    async with async_session_maker() as session:
        yield session
```

**3. Implement `get_connection_info()`**
```python
async def get_connection_info(db_id: str, user_id: str, system_db: AsyncSession) -> dict:
    result = await system_db.execute(
        select(Connection).where(Connection.id == db_id, Connection.user_id == user_id)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    return {
        "connection_string": decrypt(conn.connection_string),  # decrypt from vault
        "dialect": conn.dialect,
    }
```

### Phase 2 — Core Backend (Weeks 4–6)

| Task | File to create | Owner |
|---|---|---|
| User registration & login | `api/routes/auth.py` | Member 3 |
| JWT token generation | `services/auth_service.py` | Member 3 |
| DB connection CRUD | `api/routes/connections.py` | Member 3 |
| SQLAlchemy ORM models | `models/` directory | Member 3 |
| Alembic migrations | `database/migrations/` | Member 3 |
| Audit logger service | `services/audit.py` | Member 1 |
| Query history storage | Inside `routes_query.py` | Member 1 |
| Schema doc upload endpoint | `api/routes/schema_docs.py` | Member 1 |
| PDF/Word/Excel text extractor | `services/doc_extractor.py` | Member 1 |
| Object storage integration | `services/storage.py` | Member 1 |

### Phase 3 — Frontend (Weeks 4–8) — Member 2

| Task | Component |
|---|---|
| UX4G base setup + routing | `App.jsx`, layout components |
| Login / Register page | `pages/Login.jsx` |
| Chat UI with message bubbles | `components/ChatWindow.jsx` |
| SQL Viewer (syntax highlighted) | `components/SqlViewer.jsx` |
| Results table with pagination | `components/ResultsTable.jsx` |
| Write preview confirmation modal | `components/WritePreviewModal.jsx` |
| Auto-chart generation | `components/ResultChart.jsx` (Recharts) |
| CSV/Excel export button | Inside ResultsTable |
| Voice input (Web Speech API) | `components/VoiceInput.jsx` |
| Schema explorer sidebar | `components/SchemaExplorer.jsx` |
| Connection manager page | `pages/Connections.jsx` |
| Query history sidebar | `components/QueryHistory.jsx` |

### Phase 4 — Testing & Polish (Weeks 9–10)

- Unit tests for `sql_validator.py` — test all 10 stages with edge cases
- Integration tests for `run_agent()` — test all response types
- E2E test with the sample industrial dataset
- Docker Compose setup (all services)
- Performance testing against the <3s AI target
- UX4G accessibility audit

---

## 10. Task Distribution — Team of 3

### Member 1 — Backend Lead (AI Engine + API)

**Already done (this session):**
- ✅ Complete AI SQL Agent (`ai_agent/` — all 10 files)
- ✅ FastAPI app bootstrap (`main.py`)
- ✅ LangGraph state machine (`graph.py`)
- ✅ All 4 LLM providers with cascading fallback (`llm_provider.py`)
- ✅ SQL safety validation pipeline (`sql_validator.py`)
- ✅ Schema reflection for 6 databases (`schema_manager.py`)
- ✅ System prompt v2.0 with dual-context injection (`prompts.py`)
- ✅ Query, execute, and schema API routes (`routes_query.py`)

**Still to build:**
- [ ] Audit logger service (`services/audit.py`) — log all write operations immutably
- [ ] Schema doc upload endpoint (`api/routes/schema_docs.py`)
- [ ] PDF/Word/Excel text extractor service (`services/doc_extractor.py`)
- [ ] Object storage integration for schema docs (`services/storage.py`)
- [ ] Query history save/retrieve (inside routes)
- [ ] Wire up real `get_current_user()` and `get_system_db()` dependencies

---

### Member 2 — Frontend Developer (React + UX4G)

**Still to build (entire frontend):**
- [ ] Project setup: `npm create vite@latest frontend -- --template react`, install UX4G (`ux4g_min.js`, `ux4g-min.css`), install Axios, Recharts, Zustand
- [ ] Routing setup with React Router
- [ ] Login / Register pages (UX4G form components)
- [ ] Chat window component — user bubbles on right, AI responses on left
- [ ] SQL Viewer — syntax-highlighted SQL display under each AI response
- [ ] Results table — paginated, sortable, column-typed
- [ ] Write preview modal — shows SQL in a warning box, Confirm/Cancel buttons
- [ ] Auto-chart — detects if results have numeric data and renders Recharts chart
- [ ] Export button — CSV download (client-side), Excel (call API)
- [ ] Voice input — Web Speech API integration
- [ ] Schema explorer sidebar — tree view of tables from `GET /api/schema/tables/{db_id}`
- [ ] Connection manager page — add/edit/delete database connections
- [ ] Query history sidebar — load a past query back into the chat
- [ ] Axios interceptor for JWT — attach token to every request header automatically
- [ ] Error alert component — UX4G `alert-danger` for API errors
- [ ] Loading skeletons — UX4G-styled loading states during AI generation

**Key UX4G components to use:**
- `.btn .btn-primary` / `.btn-danger` for confirm/cancel
- `.alert .alert-warning` for write operation previews
- `.table .table-striped .table-bordered` for results
- `.card` for chat bubbles and panels
- `.badge` for risk level indicators

---

### Member 3 — DB & DevOps (Database + Auth + Infrastructure)

**Still to build:**

**Database (Priority 1):**
- [ ] Design SQLAlchemy ORM models: `User`, `Connection`, `QueryHistory`, `AuditLog`, `ConnectionSchemaDoc`
- [ ] Write Alembic migrations for all tables
- [ ] Create sample industrial dataset SQL seed files (sensors, calibrations, locations, technicians, equipment, sensor_readings tables from the spec)

**Auth (Priority 2):**
- [ ] `api/routes/auth.py` — `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`
- [ ] `services/auth_service.py` — JWT generation, bcrypt password hashing
- [ ] Replace stubs in `routes_query.py`: `get_current_user()`, `get_system_db()`, `get_connection_info()`

**Connections API (Priority 3):**
- [ ] `api/routes/connections.py` — CRUD for database connections
- [ ] Credential encryption at rest (Fernet symmetric encryption from `cryptography` library)

**DevOps (Priority 4):**
- [ ] `docker-compose.yml` — FastAPI backend + React frontend + PostgreSQL system DB + MySQL demo DB
- [ ] `Dockerfile` for backend (python:3.11-slim base)
- [ ] `Dockerfile` for frontend (node:20-alpine + nginx)
- [ ] `.github/workflows/` — basic CI pipeline (lint + test on push)
- [ ] Admin user management screen API (`api/routes/admin.py`)

---

## 11. How to Run the Project Locally

### Prerequisites

- Python 3.11+
- Node.js 20+ (for frontend, when ready)
- Docker + Docker Compose (optional but recommended)
- At least one of: OpenRouter API key, Groq API key, Gemini API key, or local Ollama

### Backend Setup

```bash
# 1. Clone the repo
git clone https://github.com/your-team/talk2tables.git
cd talk2tables/backend

# 2. Create and activate virtual environment
python -m venv venv
source venv/bin/activate          # Linux/Mac
# venv\Scripts\activate           # Windows

# 3. Install dependencies
pip install -r ai_agent/requirements.txt

# 4. Set up environment
cp ai_agent/.env.example .env
# Edit .env and add your API keys

# 5. Run the development server
uvicorn main:app --reload --port 8000
```

### Verify it's working

```bash
# Health check
curl http://localhost:8000/health
# Expected: {"status":"ok","service":"talk2tables-backend","version":"2.0.0"}

# Swagger UI
# Open http://localhost:8000/docs in your browser
```

### With Docker Compose (when Dockerfiles are ready)

```bash
# From the project root
docker compose up --build

# Frontend: http://localhost:3000
# Backend:  http://localhost:8000
# Docs:     http://localhost:8000/docs
```

---

## 12. Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_PROVIDER` | No | `openrouter` | Active LLM provider: `openrouter`, `groq`, `gemini`, `ollama` |
| `OPENROUTER_API_KEY` | Yes* | — | OpenRouter API key |
| `OPENROUTER_MODEL` | No | `qwen/qwen-2.5-coder-32b-instruct` | Model to use via OpenRouter |
| `GROQ_API_KEY` | Yes* | — | Groq API key |
| `GROQ_MODEL` | No | `qwen-2.5-coder-32b` | Model to use on Groq |
| `GEMINI_API_KEY` | Yes* | — | Google Gemini API key |
| `GEMINI_MODEL` | No | `gemini-1.5-flash` | Gemini model to use |
| `OLLAMA_BASE_URL` | No | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | No | `qwen2.5-coder:7b` | Local Ollama model |
| `DATABASE_URL` | Yes | — | SQLAlchemy URL for system DB |
| `SECRET_KEY` | Yes | — | JWT signing secret |
| `ALGORITHM` | No | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `60` | JWT expiry in minutes |
| `MAX_HISTORY_TURNS` | No | `6` | Conversation turns to keep in LLM context |
| `MAX_QUERY_ROWS` | No | `10000` | Hard cap on SELECT result rows |
| `CORS_ORIGINS` | No | `http://localhost:3000,http://localhost:5173` | Allowed frontend origins |
| `LOG_LEVEL` | No | `INFO` | Logging verbosity: `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `DEBUG` | No | `false` | Enable debug mode |

*At least one LLM provider key is required. The system tries them in order and uses the first one that works.

---

## 13. API Endpoint Reference

### `POST /api/query`
Submit a natural language query.

**Request:**
```json
{
  "natural_language": "Show sensors overdue for calibration",
  "db_id": "conn-uuid-abc123",
  "chat_history": [
    {"role": "user", "content": "Show all sensors"},
    {"role": "assistant", "content": "[SQL] SELECT * FROM sensors LIMIT 1000"}
  ]
}
```

**Response (results):**
```json
{
  "response_type": "results",
  "final_response": {
    "sql": "SELECT s.sensor_id, ... LIMIT 1000",
    "results": [{"sensor_id": "S-201", "name": "Pressure Sensor 1", ...}],
    "columns": [{"name": "sensor_id", "type": "string"}, ...],
    "summary": "Found 12 records with columns: sensor_id, name, next_due, zone_name.",
    "row_count": 12,
    "execution_time": "47ms",
    "llm_provider": "openrouter/qwen-2.5-coder-32b-instruct",
    "is_truncated": false
  },
  "chat_history": [...],
  "llm_provider": "openrouter/qwen-2.5-coder-32b-instruct"
}
```

**Response (clarification):**
```json
{
  "response_type": "clarification",
  "final_response": {
    "question": "Do you want sensors overdue in all zones, or a specific zone like Zone A?"
  }
}
```

**Response (write preview):**
```json
{
  "response_type": "preview",
  "final_response": {
    "sql": "UPDATE calibrations SET status = 'completed' WHERE sensor_id = 'S-201'",
    "operation_type": "WRITE_OP",
    "affected_rows": 1,
    "risk_level": "moderate",
    "warning_message": "⚠️ CAUTION: This write operation will modify data...",
    "requires_confirmation": true
  }
}
```

---

### `POST /api/query/execute`
Execute a confirmed write operation. Requires `admin` or `power_user` role.

**Request:**
```json
{
  "confirmed_sql": "UPDATE calibrations SET status = 'completed' WHERE sensor_id = 'S-201'",
  "db_id": "conn-uuid-abc123",
  "session_token": "preview-token-xyz"
}
```

**Response:**
```json
{
  "response_type": "write_success",
  "final_response": {
    "message": "Operation completed successfully.",
    "affected_rows": 1,
    "sql": "UPDATE calibrations SET status = 'completed' WHERE sensor_id = 'S-201'",
    "execution_time": "23ms"
  }
}
```

---

### `GET /api/schema/tables/{db_id}`
List tables for the schema explorer sidebar.

**Response:**
```json
{
  "db_id": "conn-uuid-abc123",
  "tables": [
    {"table": "sensors", "columns": 8},
    {"table": "calibrations", "columns": 7},
    {"table": "locations", "columns": 5}
  ],
  "table_count": 3
}
```

---

### `GET /health`
Liveness probe.

**Response:** `{"status": "ok", "service": "talk2tables-backend", "version": "2.0.0"}`

---

## 14. Database Support Matrix

| Database | Driver (pip package) | Connection String Format | Status |
|---|---|---|---|
| MySQL 8 | `pymysql` | `mysql+pymysql://user:pass@host:3306/db` | ✅ Supported |
| MariaDB | `pymysql` | `mariadb+pymysql://user:pass@host:3306/db` | ✅ Supported |
| PostgreSQL 15 | `psycopg2-binary` | `postgresql+psycopg2://user:pass@host:5432/db` | ✅ Supported |
| SQLite | built-in | `sqlite:///./path/to/file.db` | ✅ Supported |
| SQL Server | `pyodbc` | `mssql+pyodbc://user:pass@host/db?driver=ODBC+Driver+17` | ✅ Supported |
| Oracle | `cx-Oracle` | `oracle+cx_oracle://user:pass@host:1521/service` | ✅ Supported |
| BigQuery | `sqlalchemy-bigquery` | `bigquery://project/dataset` | 🔜 Future |
| Snowflake | `snowflake-sqlalchemy` | `snowflake://user:pass@account/db` | 🔜 Future |

---

*Talk2Tables — Built with ❤️ in Mumbai | Diploma Final Year Project 2025–26*