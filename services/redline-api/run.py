#!/usr/bin/env python3
"""
Redline API launcher (used by `pnpm dev` and the Docker image).

    python run.py                 # dev: restarts when backend/app or ai/ change
    python run.py --no-reload     # production
    python run.py --port 8100

Creates backend/.venv and installs requirements on first run (unless --system,
which uses the current interpreter — the Docker image does that).
Listens on 127.0.0.1 only: the platform proxies /api/redline/* to it, so the API
is never exposed on its own.
"""

from __future__ import annotations

import argparse
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
WATCH_DIRS = [BACKEND / "app", ROOT / "ai"]
WATCH_SUFFIXES = {".py", ".md", ".json"}
WINDOWS = sys.platform == "win32"


def venv_python() -> Path:
    return BACKEND / ".venv" / ("Scripts/python.exe" if WINDOWS else "bin/python")


def port_in_use(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0


def ensure_venv() -> Path:
    py = venv_python()
    if not py.exists():
        print("[redline-api] creating virtualenv and installing requirements (first run only)...", flush=True)
        subprocess.check_call([sys.executable, "-m", "venv", str(BACKEND / ".venv")])
        subprocess.check_call([str(py), "-m", "pip", "install", "-q", "-r", "requirements.txt"], cwd=BACKEND)
    return py


def start(python: Path, host: str, port: int) -> subprocess.Popen:
    # The backend imports `app` (from backend/) and `ai` (from this folder).
    env = {**os.environ, "PYTHONPATH": os.pathsep.join(filter(None, [str(ROOT), os.environ.get("PYTHONPATH", "")]))}
    return subprocess.Popen(
        [str(python), "-m", "uvicorn", "app.main:app", "--host", host, "--port", str(port), "--log-level", "warning"],
        cwd=BACKEND,
        env=env,
    )


def stop(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    if WINDOWS:
        subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True)
    else:
        proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def snapshot() -> dict[Path, int]:
    return {
        f: f.stat().st_mtime_ns
        for folder in WATCH_DIRS
        for f in folder.rglob("*")
        if f.suffix in WATCH_SUFFIXES and "__pycache__" not in f.parts and "tests" not in f.parts
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Redline API")
    parser.add_argument("--host", default=os.getenv("REDLINE_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("REDLINE_PORT", "8100")))
    parser.add_argument("--no-reload", action="store_true", help="don't restart on code changes")
    parser.add_argument("--system", action="store_true", help="use the current Python instead of backend/.venv")
    args = parser.parse_args()

    if port_in_use(args.host, args.port):
        sys.exit(f"[redline-api] port {args.port} is already in use. Stop the other process (e.g. an old `python redline/start.py`).")

    python = Path(sys.executable) if args.system else ensure_venv()
    proc = start(python, args.host, args.port)
    print(f"[redline-api] listening on http://{args.host}:{args.port} (internal; the platform proxies /api/redline)", flush=True)

    stopping = False

    def shutdown(*_: object) -> None:
        nonlocal stopping
        stopping = True
        stop(proc)
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    seen = snapshot()
    while not stopping:
        time.sleep(1)
        if proc.poll() is not None:
            sys.exit(f"[redline-api] stopped with exit code {proc.returncode}")
        if args.no_reload:
            continue
        now = snapshot()
        if now != seen:
            seen = now
            print("[redline-api] code changed, restarting...", flush=True)
            stop(proc)
            proc = start(python, args.host, args.port)


if __name__ == "__main__":
    main()
