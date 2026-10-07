@echo off
color 0A
echo ===================================================
echo   Hermes / Aura Privacy Engine - Launcher
echo ===================================================
echo.

:: Check for python
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo [ERROR] Python is not installed or not in PATH. 
    echo Please install Python 3.
    echo.
    pause
    exit /b 1
)

python setup.py
pause
