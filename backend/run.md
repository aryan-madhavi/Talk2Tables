# Project Setup Guide

## 1. Get Firebase Service Account Key

1. Go to **Firebase Console**.
2. Navigate to **Project Settings → Service Accounts**.
3. Click **Generate new private key**.
4. Download the file and save it in your **project root** as:

```
firebase-credentials.json
```

---

# 2. Setup Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and set your Firebase project ID:

```env
FIREBASE_PROJECT_ID=your-actual-project-id
```

---

# 3. Install Python Dependencies

Create a virtual environment:

```bash
python -m venv venv
```

Activate the virtual environment.

### Linux / Mac

```bash
source venv/bin/activate
```

### Windows

```bash
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

---

# 4. Run the FastAPI Server

Start the development server:

```bash
uvicorn main:app --reload --port 8000
```

Open API docs:

```
http://localhost:8000/docs
```

---

# 5. Setup Redis (Docker + Persistent Volume)

## Pull Redis Alpine Image

```bash
docker pull redis:alpine
```

---

## Create a Persistent Docker Volume

```bash
docker volume create redis-data
```

This ensures **Redis data survives container restarts**.

---

## Run Redis Container

```bash
docker run -d \
  --name redis-server \
  -p 6379:6379 \
  -v redis-data:/data \
  redis:alpine \
  redis-server --appendonly yes
```

### Explanation

- `-d` → run container in background  
- `--name redis-server` → container name  
- `-p 6379:6379` → expose Redis port  
- `-v redis-data:/data` → persistent storage  
- `--appendonly yes` → enables Redis persistence (AOF)

---

## Verify Redis is Running

```bash
docker ps
```

You should see a container named:

```
redis-server
```

---

## Access Redis CLI

```bash
docker exec -it redis-server redis-cli MONITOR
```

Test Redis:

```redis
SET test "hello"
GET test
```

Expected output:

```
"hello"
```

---

# Quick Start (Everything Together)

```bash
cp .env.example .env

python -m venv venv
source venv/bin/activate

pip install -r requirements.txt

docker pull redis:alpine
docker volume create redis-data

docker run -d \
  --name redis-server \
  -p 6379:6379 \
  -v redis-data:/data \
  redis:alpine \
  redis-server --appendonly yes

uvicorn main:app --reload --port 8000
```

Open:

```
http://localhost:8000/docs
```