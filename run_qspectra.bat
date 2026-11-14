@echo off
setlocal
set "ROOT_DIR=%~dp0"

echo [Q-SPECTRA] Starting FastAPI Physics & OSINT Bridge on :8000...
start "Q-SPECTRA Backend" cmd /k "cd /d "%ROOT_DIR%backend" && pip install -q -r requirements.txt && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

echo [Q-SPECTRA] Starting Vite Frontend Workbench on :5173...
cd /d "%ROOT_DIR%"
if not exist "node_modules" (
  call npm install
)
call npm run dev
