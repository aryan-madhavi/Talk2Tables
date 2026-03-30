# Talk2Tables — Developer README

> **AI-Powered Conversational SQL Assistant for Industrial Databases**
> Fully On-Premise | Secure Source Code (Nuitka) | Local AI (Ollama)
> UX4G (Government of India Design System) Compliant

---

## 1. On-Premise Architecture

Talk2Tables has been migrated to a fully on-premise architecture to ensure data privacy and air-gapped security.

- **Authentication**: Local JWT + MongoDB (Replaced Firebase).
- **Database**: MongoDB for user profiles, chat history, and audit logs.
- **Cache**: Redis for session revocation and schema caching.
- **AI Inference**: Ollama (Local) for SQL generation (Replaced cloud APIs).
- **Source Protection**: Compiled into a machine-code binary using **Nuitka**.

---

## 2. Requirements & Setup

### Recommended Environment
- **Python Version**: **3.12.x** (Highly Recommended for stability with Nuitka).
- **OS**: Linux (Arch/Debian preferred) or Windows.
- **Tools**: Docker + Docker Compose (for infrastructure).

### Step 1: Infrastructure
Start the required local databases using Docker:
```bash
docker compose up -d
```
OR
```bash
podman-compose up -d
```
*This launches MongoDB (27017) and Redis (6379).*

### Step 2: Virtual Environment (Python 3.12)
If your system default is higher (e.g., Arch Linux with 3.14), force 3.12:
```bash
# Recreate venv with 3.12
rm -rf venv
python3.12 -m venv venv

# Activate
source venv/bin/activate.fish  # Fish shell
source venv/bin/activate       # Bash/Zsh

# Install dependencies
./venv/bin/python -m pip install -r requirements.txt
```

---

## 3. Build & Protection Commands

To hide the source code and LangGraph logic before shipping to production, compile the project into a standalone binary.

### Build the Binary
```bash
# Run the automated Nuitka build script
python build.py
```
*This will create a `dist/main.bin` file.*

### Run the Compiled Backend
The binary is standalone and does not require Python to run on the production server.
```bash
cd dist
cp ../.env .  # Ensure secrets are present
./main.bin
```

---

## 4. Development Commands

For active development (no compilation):
```bash
# Run the FastAPI server normally
uvicorn main:app --reload --port 8000
```

---

## 5. Environment Configuration (.env)

| Variable | Value | Description |
|---|---|---|
| `JWT_SECRET_KEY` | `<secure_token>` | Generate with `secrets.token_urlsafe(32)` |
| `MONGO_URI` | `mongodb://localhost:27017` | Local MongoDB instance |
| `REDIS_URL` | `redis://localhost:6379/0` | Local Redis instance |
| `LLM_PROVIDER` | `ollama` | Pinned to local Ollama |
| `OLLAMA_MODEL` | `qwen2.5-coder:7b` | Local model name |
| `DB_ENCRYPTION_KEY`| `<hex_key>` | 64-char key for DB passwords |

---

## 6. Project Structure

```text
/Talk2Tables
├── build.py              # Nuitka compilation configuration
├── docker-compose.yml    # MongoDB & Redis infrastructure
├── main.py               # FastAPI entry point
├── auth/                 # JWT & MongoDB Auth logic
├── ai_agent/             # LangGraph SQL Agent (Compiled)
├── connections/          # DB Connection management
├── core/                 # Shared Redis & Config utilities
└── dist/                 # Production binaries (Created after build)
```

---

*Talk2Tables — Secure On-Premise Industrial AI | Mumbai, 2025–26*
