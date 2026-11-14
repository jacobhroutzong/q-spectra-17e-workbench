"""
Q-SPECTRA // 17E Quantum CEMA Workbench
Turnkey Google Colab GPU Backend & Tunnel Launcher

Usage inside a Google Colab GPU runtime:
    !git clone <repo-url> && cd q-spectra-17e-workbench
    !pip install -r backend/requirements.txt
    !python colab/colab_live_backend.py --model qwen-17e-cema --tunnel cloudflared

Or with ngrok (requires NGROK_AUTHTOKEN env var or --ngrok-token):
    !NGROK_AUTHTOKEN=... python colab/colab_live_backend.py --tunnel ngrok
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"


def ensure_ollama_running(model_name: str) -> None:
    """Start `ollama serve` if not already listening and verify the target model."""
    if shutil.which("ollama") is None:
        print("[WARN] `ollama` binary not found. Skipping local LLM server startup.")
        print("       Install on Colab via: curl -fsSL https://ollama.com/install.sh | sh")
        return

    # Probe local Ollama port
    try:
        urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=2)
        print("[OK] Ollama server already running on http://127.0.0.1:11434")
    except Exception:
        print("[INFO] Starting `ollama serve` in background...")
        subprocess.Popen(
            ["ollama", "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        for _ in range(15):
            time.sleep(1)
            try:
                urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=1)
                print("[OK] Ollama server is ready.")
                break
            except Exception:
                continue

    if model_name:
        res = subprocess.run(["ollama", "list"], capture_output=True, text=True)
        if model_name not in res.stdout:
            print(f"[INFO] Model '{model_name}' not found in `ollama list`.")
            print(f"       If using a GGUF Modelfile, run: ollama create {model_name} -f Modelfile")
        else:
            print(f"[OK] Ollama model '{model_name}' is available.")


def ensure_cloudflared() -> str:
    """Locate or download the Linux `cloudflared` binary for Colab quick tunnels."""
    existing = shutil.which("cloudflared")
    if existing:
        return existing

    target = Path("/tmp/cloudflared")
    if not target.exists():
        print("[INFO] Downloading cloudflared quick-tunnel binary...")
        url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
        urllib.request.urlretrieve(url, target)
        target.chmod(0o755)
    return str(target)


def start_uvicorn(port: int) -> subprocess.Popen:
    """Launch the FastAPI physics, SDR, and OSINT backend."""
    env = os.environ.copy()
    env.setdefault("PYTHONUNBUFFERED", "1")
    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "main:app",
        "--host",
        "0.0.0.0",
        "--port",
        str(port),
    ]
    print(f"[INFO] Starting FastAPI backend on http://0.0.0.0:{port} ...")
    return subprocess.Popen(cmd, cwd=str(BACKEND_DIR), env=env)


def wait_for_backend(port: int, timeout_s: int = 30) -> bool:
    """Poll `/api/health` until FastAPI is ready."""
    url = f"http://127.0.0.1:{port}/api/health"
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    print(f"[OK] FastAPI health check passed: {url}")
                    return True
        except Exception:
            time.sleep(0.75)
    return False


def launch_cloudflared_tunnel(port: int) -> subprocess.Popen:
    """Start a Cloudflare quick tunnel and print the public HTTPS URL."""
    binary = ensure_cloudflared()
    proc = subprocess.Popen(
        [binary, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{port}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
    public_url = None
    start = time.time()
    while time.time() - start < 30 and proc.stdout is not None:
        line = proc.stdout.readline()
        if not line:
            break
        match = url_pattern.search(line)
        if match:
            public_url = match.group(0)
            break

    if public_url:
        print("\n" + "=" * 68)
        print("  Q-SPECTRA 17E LIVE COLAB BACKEND READY")
        print(f"  Public HTTPS Bridge URL : {public_url}")
        print(f"  Health Endpoint         : {public_url}/api/health")
        print("  Paste this URL into Q-SPECTRA -> Inference Hub -> Backend URL")
        print("=" * 68 + "\n")
    else:
        print("[WARN] Timed out waiting for trycloudflare.com URL; check tunnel logs.")

    return proc


def launch_ngrok_tunnel(port: int, auth_token: str | None) -> str:
    """Start an ngrok HTTPS tunnel using `pyngrok`."""
    try:
        from pyngrok import ngrok
    except ImportError as exc:
        raise RuntimeError("pyngrok is not installed. Run: pip install pyngrok") from exc

    token = auth_token or os.environ.get("NGROK_AUTHTOKEN")
    if token:
        ngrok.set_auth_token(token)

    tunnel = ngrok.connect(addr=port, proto="http")
    public_url = tunnel.public_url.replace("http://", "https://")
    print("\n" + "=" * 68)
    print("  Q-SPECTRA 17E LIVE COLAB BACKEND READY (NGROK)")
    print(f"  Public HTTPS Bridge URL : {public_url}")
    print(f"  Health Endpoint         : {public_url}/api/health")
    print("  Paste this URL into Q-SPECTRA -> Inference Hub -> Backend URL")
    print("=" * 68 + "\n")
    return public_url


def main() -> None:
    parser = argparse.ArgumentParser(description="Launch Q-SPECTRA 17E FastAPI + Ollama + Tunnel on Colab")
    parser.add_argument("--port", type=int, default=8000, help="FastAPI port (default: 8000)")
    parser.add_argument(
        "--tunnel",
        choices=["cloudflared", "ngrok", "none"],
        default="cloudflared",
        help="Tunnel provider (default: cloudflared)",
    )
    parser.add_argument("--ngrok-token", default=None, help="Optional ngrok authtoken")
    parser.add_argument("--model", default="qwen-17e-cema", help="Ollama model tag to verify")
    parser.add_argument("--skip-ollama", action="store_true", help="Skip Ollama server startup")
    args = parser.parse_args()

    if not args.skip_ollama:
        ensure_ollama_running(args.model)

    uvicorn_proc = start_uvicorn(args.port)
    tunnel_proc = None

    def cleanup(_signum=None, _frame=None):
        print("\n[INFO] Shutting down Q-SPECTRA Colab backend...")
        if tunnel_proc and tunnel_proc.poll() is None:
            tunnel_proc.terminate()
        if uvicorn_proc and uvicorn_proc.poll() is None:
            uvicorn_proc.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    if not wait_for_backend(args.port):
        print("[ERROR] FastAPI failed to pass /api/health within 30s.")
        cleanup()

    if args.tunnel == "cloudflared":
        tunnel_proc = launch_cloudflared_tunnel(args.port)
    elif args.tunnel == "ngrok":
        launch_ngrok_tunnel(args.port, args.ngrok_token)
    else:
        print(f"[OK] Tunnel disabled. Backend running locally on http://127.0.0.1:{args.port}")

    try:
        uvicorn_proc.wait()
    except KeyboardInterrupt:
        cleanup()


if __name__ == "__main__":
    main()
