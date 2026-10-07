@echo off
color 0A
echo ===================================================
echo   Hermes / Aura Privacy Engine - Auto Setup Script
echo ===================================================
echo.

:: 1. Check for Node.js
echo [*] Checking for Node.js...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo [ERROR] Node.js is not installed or not in PATH. 
    echo Please install Node.js from https://nodejs.org/ (LTS version)
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js found.
echo.

:: 2. Check for Rust / Cargo
echo [*] Checking for Rust compiler...
where cargo >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo [ERROR] Rust is not installed. 
    echo Please install Rust by downloading rustup-init.exe from https://rustup.rs/
    echo.
    pause
    exit /b 1
)
echo [OK] Rust found.
echo.

:: 3. Install NPM dependencies
echo [*] Installing frontend dependencies...
cd pgp-ui
call npm install
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)
echo [OK] Dependencies installed.
echo.

:: 4. Launch Tauri Dev Server
echo ===================================================
echo [*] Launching Hermes...
echo     Note: The very first launch will take a few 
echo     minutes while it compiles the heavy Rust cryptography.
echo ===================================================
call npm run tauri dev

pause
