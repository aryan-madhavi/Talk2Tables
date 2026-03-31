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
        "--follow-imports",
        "--jobs=1",
        "--low-memory",
        "--lto=no",
        "--assume-yes-for-downloads",
        "--include-package-data=limits",
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
