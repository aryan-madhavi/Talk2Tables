# build.py
import os
import subprocess
import sys

def build_executable():
    print("Starting Nuitka compilation...")
    
    # Nuitka compilation command
    cmd = [
        sys.executable, "-m", "nuitka",
        "--standalone",
        "--onefile",
        "--assume-yes-for-downloads",
        "--include-package=fastapi",
        "--include-package=uvicorn",
        "--include-package=pydantic",
        "--include-package=pydantic_settings",
        "--include-package=langgraph",
        "--include-package=langchain_core",
        "--include-package=motor",
        "--include-package=jwt",
        "--include-package=argon2",
        "--include-package=dotenv",
        "--include-package=slowapi",
        "--include-package=redis",
        "--include-package=sqlalchemy",
        "--include-package=cryptography",
        "--include-package-data=limits",    # Fix for slowapi/limits FileNotFoundError
        # ── Local Project Folders ──
        "--include-package=core",
        "--include-package=auth",
        "--include-package=ai_agent",
        "--include-package=connections",
        "--include-package=users",
        "--include-package=access",
        "--include-package=query",
        "--include-package=chat",
        "--output-dir=dist",
        "main.py"
    ]
    
    try:
        subprocess.run(cmd, check=True)
        print("Compilation successful. Executable is in the 'dist' directory.")
    except subprocess.CalledProcessError as e:
        print(f"Compilation failed: {e}")

if __name__ == "__main__":
    build_executable()
