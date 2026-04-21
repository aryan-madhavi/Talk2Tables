#!/usr/bin/env python3
"""
run_backend.py — Talk2Tables Production Runner
===============================================
Zero dependencies. Works on Linux, macOS, Windows.
Starts MongoDB + Redis containers, then runs the backend binary in background.

Usage:
    python run_backend.py start
    python run_backend.py stop
    python run_backend.py restart
    python run_backend.py status
    python run_backend.py logs
    python run_backend.py health
"""

from __future__ import annotations

import os
import sys
import time
import signal
import platform
import subprocess

# ── Config ────────────────────────────────────────────────────────────────────
if getattr(sys, 'frozen', False):
    # Running as PyInstaller binary — use the binary's actual location
    PROJECT_ROOT = os.path.dirname(sys.executable)
else:
    # Running as plain Python script
    PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

SYSTEM       = platform.system()   # "Linux" | "Darwin" | "Windows"

# Binary path (PyInstaller output)
if SYSTEM == "Windows":
    BINARY = os.path.join(PROJECT_ROOT, "dist", "backend-api", "backend-api.exe")
else:
    BINARY = os.path.join(PROJECT_ROOT, "dist", "backend-api", "backend-api")

PID_FILE = os.path.join(PROJECT_ROOT, "backend.pid")
LOG_FILE = os.path.join(PROJECT_ROOT, "backend_run.log")

# Container runtime — prefer podman, fallback to docker
def _container_runtime() -> str:
    for rt in ("podman", "docker"):
        if subprocess.run(
            [rt, "--version"],
            capture_output=True
        ).returncode == 0:
            return rt
    return None

RUNTIME = _container_runtime()

# Containers derived from docker-compose.yml
CONTAINERS = [
    {
        "name":  "t2t-mongo",
        "image": "docker.io/library/mongo:latest",
        "port":  "27017:27017",
        "vol":   "t2t_mongo_data:/data/db",
    },
    {
        "name":  "t2t-redis",
        "image": "docker.io/library/redis:alpine",
        "port":  "6379:6379",
        "vol":   None,
    },
]

# ── Pretty print ──────────────────────────────────────────────────────────────

RESET  = "\033[0m"
BOLD   = "\033[1m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"

def ok(msg):   print(f"{GREEN}✅  {msg}{RESET}", flush=True)
def warn(msg): print(f"{YELLOW}⚠️   {msg}{RESET}", flush=True)
def err(msg):  print(f"{RED}❌  {msg}{RESET}", flush=True)
def info(msg): print(f"{CYAN}ℹ️   {msg}{RESET}", flush=True)
def log(msg):  print(msg, flush=True)

# ── Container helpers ─────────────────────────────────────────────────────────

def ensure_containers():
    if RUNTIME is None:
        warn("Neither podman nor docker found — skipping container startup.")
        warn("Make sure MongoDB (27017) and Redis (6379) are running manually.")
        return

    info(f"Container runtime: {RUNTIME}")

    for c in CONTAINERS:
        name  = c["name"]
        image = c["image"]
        port  = c["port"]
        vol   = c["vol"]

        # Try resuming existing container first
        result = subprocess.run(
            [RUNTIME, "start", name],
            capture_output=True
        )

        if result.returncode == 0:
            ok(f"Resumed container: {name}")
        else:
            # Container doesn't exist — create it
            cmd = [RUNTIME, "run", "-d",
                   "--name", name,
                   "--restart", "always",
                   "-p", port]
            if vol:
                cmd += ["-v", vol]
            cmd.append(image)

            run_result = subprocess.run(cmd, capture_output=True, text=True)

            if run_result.returncode == 0:
                ok(f"Started new container: {name}")
            else:
                err(f"Failed to start container {name}:\n    {run_result.stderr.strip()}")

    # Give containers a moment to initialize
    time.sleep(2)


def stop_containers():
    if RUNTIME is None:
        return
    for c in CONTAINERS:
        result = subprocess.run(
            [RUNTIME, "stop", c["name"]],
            capture_output=True
        )
        if result.returncode == 0:
            ok(f"Stopped container: {c['name']}")


# ── Process helpers ───────────────────────────────────────────────────────────

def read_pid() -> int | None:
    if os.path.exists(PID_FILE):
        try:
            return int(open(PID_FILE).read().strip())
        except (ValueError, OSError):
            return None
    return None

def write_pid(pid: int):
    with open(PID_FILE, "w") as f:
        f.write(str(pid))

def remove_pid():
    if os.path.exists(PID_FILE):
        os.remove(PID_FILE)

def is_running(pid: int | None) -> bool:
    if pid is None:
        return False
    try:
        if SYSTEM == "Windows":
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}"],
                capture_output=True, text=True
            )
            return str(pid) in result.stdout
        else:
            os.kill(pid, 0)
            return True
    except (ProcessLookupError, PermissionError, OSError):
        return False

def check_binary():
    if not os.path.exists(BINARY):
        err(f"Binary not found: {BINARY}")
        err("Run 'python build_exe.py' first to build the backend.")
        sys.exit(1)
    if SYSTEM != "Windows":
        os.chmod(BINARY, 0o755)

# ── Commands ──────────────────────────────────────────────────────────────────

def start():
    check_binary()

    pid = read_pid()
    if is_running(pid):
        warn(f"Backend is already running  (PID: {pid})")
        info("Use 'python run_backend.py restart' to restart.")
        return

    log(f"\n{BOLD}▶  Talk2Tables — Starting up{RESET}")
    log("─" * 45)

    # 1. Start containers
    ensure_containers()

    # 2. Launch binary in background
    info(f"Launching backend binary...")
    info(f"Logs → {LOG_FILE}\n")

    log_handle = open(LOG_FILE, "a")

    if SYSTEM == "Windows":
        DETACHED          = 0x00000008
        NEW_PROCESS_GROUP = 0x00000200
        process = subprocess.Popen(
            [BINARY],
            stdout=log_handle,
            stderr=log_handle,
            cwd=os.path.dirname(BINARY),
            creationflags=DETACHED | NEW_PROCESS_GROUP,
            close_fds=True,
        )
    else:
        process = subprocess.Popen(
            [BINARY],
            stdout=log_handle,
            stderr=log_handle,
            cwd=os.path.dirname(BINARY),
            start_new_session=True,
            close_fds=True,
        )

    write_pid(process.pid)

    # Wait and confirm it's alive
    time.sleep(2)
    if is_running(process.pid):
        ok(f"Backend running!  PID: {process.pid}")
        log("")
        log(f"  Stop     →  python run_backend.py stop")
        log(f"  Restart  →  python run_backend.py restart")
        log(f"  Logs     →  python run_backend.py logs")
        log(f"  Status   →  python run_backend.py status")
        log(f"  Health   →  python run_backend.py health")
        log("")
    else:
        err("Backend failed to start. Check logs:")
        err(f"  {LOG_FILE}")
        remove_pid()
        sys.exit(1)


def stop():
    pid = read_pid()

    if not is_running(pid):
        warn("Backend is not running.")
        remove_pid()
        return

    info(f"Stopping backend  (PID: {pid})...")

    try:
        if SYSTEM == "Windows":
            subprocess.run(["taskkill", "/F", "/PID", str(pid)], check=True)
        else:
            os.kill(pid, signal.SIGTERM)

        # Wait up to 10s for graceful shutdown
        for _ in range(10):
            if not is_running(pid):
                break
            time.sleep(1)

        # Force kill if still alive
        if is_running(pid):
            warn("Graceful shutdown timed out — force killing...")
            if SYSTEM == "Windows":
                subprocess.run(["taskkill", "/F", "/PID", str(pid)])
            else:
                os.kill(pid, signal.SIGKILL)

        remove_pid()
        ok("Backend stopped.")

    except Exception as e:
        err(f"Failed to stop backend: {e}")
        sys.exit(1)


def restart():
    log(f"\n{BOLD}🔄  Restarting Talk2Tables...{RESET}")
    stop()
    time.sleep(1)
    start()


def status():
    pid = read_pid()
    log("")
    if is_running(pid):
        ok(f"Backend is RUNNING  |  PID: {pid}")
        info(f"Log file: {LOG_FILE}")
        if SYSTEM != "Windows":
            subprocess.run(["ps", "-p", str(pid), "-o", "pid,etime,cmd"],
                           capture_output=False)
    else:
        err("Backend is STOPPED")
        remove_pid()

    # Container status
    if RUNTIME:
        log("")
        info("Container status:")
        for c in CONTAINERS:
            result = subprocess.run(
                [RUNTIME, "inspect", "--format",
                 "{{.State.Status}}", c["name"]],
                capture_output=True, text=True
            )
            state = result.stdout.strip() if result.returncode == 0 else "not found"
            symbol = "🟢" if state == "running" else "🔴"
            log(f"  {symbol}  {c['name']:20s} → {state}")
    log("")


def logs():
    if not os.path.exists(LOG_FILE):
        warn(f"No log file found at: {LOG_FILE}")
        return

    info(f"Tailing {LOG_FILE}  (Ctrl+C to exit)\n")

    try:
        if SYSTEM == "Windows":
            subprocess.run([
                "powershell", "-Command",
                f"Get-Content '{LOG_FILE}' -Wait -Tail 50"
            ])
        else:
            subprocess.run(["tail", "-f", "-n", "50", LOG_FILE])
    except KeyboardInterrupt:
        log("\n👋  Stopped tailing logs.")


def health():
    import urllib.request
    import urllib.error

    url = "http://127.0.0.1:8000/health"
    info(f"Checking {url} ...")
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            body = resp.read().decode()
            ok(f"HTTP {resp.status}  →  {body}")
    except urllib.error.URLError as e:
        err(f"Health check failed: {e.reason}")
        err("Is the backend running?  →  python run_backend.py status")
        sys.exit(1)


# ── Entry ─────────────────────────────────────────────────────────────────────

COMMANDS = {
    "start":   start,
    "stop":    stop,
    "restart": restart,
    "status":  status,
    "logs":    logs,
    "health":  health,
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        log(f"\n{BOLD}Talk2Tables — Production Runner{RESET}")
        log("─" * 35)
        log("  python run_backend.py start    — start backend + containers")
        log("  python run_backend.py stop     — stop backend")
        log("  python run_backend.py restart  — restart everything")
        log("  python run_backend.py status   — check what's running")
        log("  python run_backend.py logs     — tail live logs")
        log("  python run_backend.py health   — hit /health endpoint")
        log("")
        sys.exit(1)

    COMMANDS[sys.argv[1]]()
