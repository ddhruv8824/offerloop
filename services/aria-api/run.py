#!/usr/bin/env python3
"""
Aria API launcher (used by pnpm dev and the single-server orchestrator).

    python run.py                 # dev: default port 8000
    python run.py --port 8000
    python run.py --no-reload     # production
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
AI = ROOT / "ai"
WINDOWS = sys.platform == "win32"


def venv_python() -> Path:
    candidates = [
        BACKEND / ".venv" / ("Scripts/python.exe" if WINDOWS else "bin/python"),
        BACKEND / "venv" / ("Scripts/python.exe" if WINDOWS else "bin/python"),
        ROOT.parent.parent / "Aria-AI-Interviewer" / "backend" / "venv" / ("Scripts/python.exe" if WINDOWS else "bin/python"),
    ]
    for p in candidates:
        if p.exists():
            return p
    return candidates[0]


def port_in_use(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0


def ensure_venv() -> Path:
    py = venv_python()
    if not py.exists():
        print("[aria-api] creating virtualenv and installing requirements...", flush=True)
        subprocess.check_call([sys.executable, "-m", "venv", str(BACKEND / ".venv")])
        subprocess.check_call([str(py), "-m", "pip", "install", "-q", "-r", "requirements.txt"], cwd=BACKEND)
    return py


def start(python: Path, host: str, port: int, reload: bool) -> subprocess.Popen:
    env = {
        **os.environ,
        "PYTHONPATH": os.pathsep.join(filter(None, [str(BACKEND), str(AI), os.environ.get("PYTHONPATH", "")])),
    }
    cmd = [
        str(python),
        "-m",
        "uvicorn",
        "api.app:app",
        "--host",
        host,
        "--port",
        str(port),
        "--log-level",
        "warning",
    ]
    if reload:
        cmd.append("--reload")
    return subprocess.Popen(cmd, cwd=BACKEND, env=env)


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


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Aria API")
    parser.add_argument("--host", default=os.getenv("ARIA_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("ARIA_PORT", "8000")))
    parser.add_argument("--no-reload", action="store_true", help="don't restart on code changes")
    parser.add_argument("--system", action="store_true", help="use system python instead of .venv")
    args = parser.parse_args()

    if port_in_use(args.host, args.port):
        sys.exit(f"[aria-api] port {args.port} is already in use.")

    python = Path(sys.executable) if args.system else ensure_venv()
    proc = start(python, args.host, args.port, reload=not args.no_reload)
    print(f"[aria-api] listening on http://{args.host}:{args.port} (internal)", flush=True)

    def shutdown(*_: object) -> None:
        stop(proc)
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    while True:
        time.sleep(1)
        if proc.poll() is not None:
            sys.exit(f"[aria-api] stopped with exit code {proc.returncode}")


if __name__ == "__main__":
    main()
