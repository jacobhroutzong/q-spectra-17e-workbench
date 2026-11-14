#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[Q-SPECTRA] Starting FastAPI Physics & OSINT Bridge on :8000..."
(
  cd "$ROOT_DIR/backend"
  if [ ! -d ".venv" ]; then
    python3 -m venv .venv
  fi
  source .venv/bin/activate
  pip install -q -r requirements.txt
  uvicorn main:app --host 0.0.0.0 --port 8000
) &
BACKEND_PID=$!

trap "kill $BACKEND_PID 2>/dev/null || true" EXIT

echo "[Q-SPECTRA] Starting Vite Frontend Workbench on :5173..."
cd "$ROOT_DIR"
if [ ! -d "node_modules" ]; then
  npm install
fi
npm run dev
