import os
import shutil
import subprocess
import sys

def main():
    print("🚀 Starting Backend Build Process (PyArmor PACK Strategy)...")
    
    # Paths
    project_root = os.path.dirname(os.path.abspath(__file__))
    dist_dir = os.path.join(project_root, "dist")
    build_dir = os.path.join(project_root, "build")
    obf_dir = os.path.join(project_root, "obfuscated")
    spec_file = os.path.join(project_root, "backend-api.spec")
    
    # Cleanup previous builds
    for d in [dist_dir, build_dir, obf_dir]:
        if os.path.exists(d):
            shutil.rmtree(d)
            print(f"🧹 Cleaned up {d}/")
            
    # 1. Generate PyInstaller Spec file
    print("\n📝 Generating PyInstaller Spec file...")
    makespec_cmd = [
        "pyi-makespec", "--onedir", "--console", "--name", "backend-api",
        "--exclude-module", "numpy",
        "--collect-all", "fastapi", "--collect-all", "uvicorn", 
        "--collect-all", "pydantic", "--collect-all", "pydantic_settings",
        "--collect-all", "motor", "--collect-all", "redis", 
        "--collect-all", "argon2", "--collect-all", "jwt", 
        "--collect-all", "slowapi", "--collect-all", "cryptography",
        "--hidden-import", "uvicorn.logging",
        "main.py"
    ]
    try:
        subprocess.run(makespec_cmd, check=True)
        print("✅ Spec file generated.")
    except subprocess.CalledProcessError as e:
        print(f"❌ Spec generation failed: {e}")
        sys.exit(1)

    # 2. Obfuscate and Package with PyArmor PACK
    print("\n🔒 Obfuscating and Packaging with PyArmor...")
    pack_cmd = [
        "pyarmor", "gen", 
        "-O", obf_dir,
        "-r", 
        "--pack", spec_file,
        "main.py", "auth", "access", "ai_agent", "chat", "connections", "core", "query", "users"
    ]
    try:
        subprocess.run(pack_cmd, check=True)
        src_dist = os.path.join(obf_dir, "backend-api")
        if os.path.exists(src_dist):
            os.makedirs(dist_dir, exist_ok=True)
            shutil.move(src_dist, os.path.join(dist_dir, "backend-api"))
            print(f"✅ Backend binary built: dist/backend-api/")
        else:
            print(f"❌ Build failed: Output not found at {src_dist}")
            sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"❌ PyArmor Pack failed: {e}")
        sys.exit(1)

    # 3. Build the runner binary
    print("\n📦 Building runner binary (run_backend)...")
    runner_spec_cmd = [
        "pyi-makespec", "--onefile", "--console", "--name", "run_backend",
        "run_backend.py"
    ]
    try:
        subprocess.run(runner_spec_cmd, check=True)
        print("✅ Runner spec generated.")
    except subprocess.CalledProcessError as e:
        print(f"❌ Runner spec failed: {e}")
        sys.exit(1)

    runner_build_cmd = [
        "pyinstaller", "run_backend.spec",
        "--distpath", project_root,
        "--workpath", os.path.join(build_dir, "runner"),
    ]
    try:
        subprocess.run(runner_build_cmd, check=True)
        print("✅ Runner binary built!")
        print("\n" + "="*50)
        print("📌 Deployment — copy these to target machine:")
        print("   1. dist/backend-api/   ← backend binary + deps")
        print("   2. run_backend         ← zero-dep launcher")
        print("\n📌 On target machine:")
        print("   ./run_backend start    ← starts everything")
        print("   ./run_backend stop")
        print("   ./run_backend restart")
        print("   ./run_backend status")
        print("   ./run_backend logs")
        print("   ./run_backend health")
        print("="*50)
    except subprocess.CalledProcessError as e:
        print(f"❌ Runner build failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
