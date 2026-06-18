@echo off
echo.
echo ============================================================
echo   Data Doctor - Dataset Quality ^& ML Readiness Analyzer
echo ============================================================
echo.

REM Add Node.js path to ensure npm commands work
set PATH=%PATH%;C:\Program Files\nodejs

REM Starting Python backend
echo [1/2] Starting Python FastAPI backend on http://localhost:8000 ...
cd backend
start "Data Doctor Backend" /B venv\Scripts\uvicorn.exe main:app --host 0.0.0.0 --port 8000
cd ..

REM Wait for backend to initialize
timeout /t 2 /nobreak >nul

REM Starting React frontend
echo [2/2] Starting React frontend on http://localhost:5173 ...
cd frontend
echo.
echo   Open http://localhost:5173 in your browser.
echo   Press Ctrl+C in this terminal to stop.
echo.
npm run dev
