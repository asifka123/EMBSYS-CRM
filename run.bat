@echo off
title Starting EMPSYS CRM
echo ===================================================
echo Starting EMPSYS CRM (Backend + Frontend)
echo ===================================================

echo Starting FastAPI Backend on http://localhost:8000 ...
start "EMPSYS CRM - Backend" cmd /k "cd /d "%~dp0backend" && C:\Users\LENOVO\miniconda3\envs\empsys\python.exe -m uvicorn main:app --reload --port 8000"

echo Starting React Frontend on http://localhost:5173 ...
start "EMPSYS CRM - Frontend" cmd /k "cd /d "%~dp0frontend" && set PATH=C:\Users\LENOVO\miniconda3\envs\empsys;C:\Users\LENOVO\miniconda3\envs\empsys\Scripts;%PATH% && npm run dev"

echo ===================================================
echo Both services launched in separate windows!
echo - Frontend: http://localhost:5173
echo - Backend:  http://localhost:8000
echo - API Docs: http://localhost:8000/docs
echo ===================================================
pause
