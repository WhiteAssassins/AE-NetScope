@echo off
setlocal

pushd "%~dp0" >nul

echo.
echo [AE NetScope] Running API lint...
call api\.venv\Scripts\python.exe -m ruff check api
if errorlevel 1 goto failed

echo.
echo [AE NetScope] Running API tests...
call api\.venv\Scripts\python.exe -m pytest api
if errorlevel 1 goto failed

echo.
echo [AE NetScope] Running web lint...
call npm run lint
if errorlevel 1 goto failed

echo.
echo [AE NetScope] Running web build...
call npm run build
if errorlevel 1 goto failed

echo.
echo [AE NetScope] All checks passed.
if not "%AE_NETSCOPE_TEST_NO_PAUSE%"=="1" pause
popd >nul
exit /b 0

:failed
echo.
echo [AE NetScope] Checks failed.
if not "%AE_NETSCOPE_TEST_NO_PAUSE%"=="1" pause
popd >nul
exit /b 1
