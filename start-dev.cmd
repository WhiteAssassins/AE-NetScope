@echo off
setlocal

cd /d "%~dp0"

if not exist "api\.venv" (
  echo Creating API virtual environment...
  py -3.12 -m venv api\.venv
  if errorlevel 1 (
    python -m venv api\.venv
    if errorlevel 1 exit /b 1
  )
)

echo Installing API dependencies...
call api\.venv\Scripts\python.exe -m pip install --upgrade pip
if errorlevel 1 exit /b 1

call api\.venv\Scripts\python.exe -m pip install -e "api[dev,worker]"
if errorlevel 1 exit /b 1

echo Preparing local API database...
pushd api
call .venv\Scripts\python.exe -m alembic upgrade head
if errorlevel 1 (
  popd
  exit /b 1
)

call .venv\Scripts\python.exe -m app.cli
if errorlevel 1 (
  popd
  exit /b 1
)
popd

if not exist "web\package-lock.json" (
  echo Missing web\package-lock.json.
  exit /b 1
)

if not exist "web\node_modules" (
  echo Installing web dependencies...
  call npm --prefix web ci
  if errorlevel 1 exit /b 1
)

echo Starting AE NetScope...
echo.
echo Web: http://127.0.0.1:5173
echo API: http://127.0.0.1:8000/api/health
echo.

start "AE NetScope API" cmd /k call "%~dp0start-api.cmd"
start "AE NetScope Web" cmd /k call "%~dp0start-web.cmd"
