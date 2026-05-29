@echo off
setlocal

cd /d "%~dp0api"

if not exist ".venv\Scripts\python.exe" (
  echo API virtual environment is missing. Run start-dev.cmd first.
  exit /b 1
)

.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
