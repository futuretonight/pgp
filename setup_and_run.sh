#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}===================================================${NC}"
echo -e "${GREEN}  Hermes / Aura Privacy Engine - Auto Setup Script ${NC}"
echo -e "${GREEN}===================================================${NC}"
echo ""

# 1. Check for Node.js
echo "[*] Checking for Node.js..."
if ! command -v node &> /dev/null
then
    echo -e "${RED}[ERROR] Node.js is not installed or not in PATH.${NC}"
    echo "Please install Node.js from https://nodejs.org/ (LTS version) or via Homebrew (brew install node)."
    echo ""
    exit 1
fi
echo "[OK] Node.js found."
echo ""

# 2. Check for Rust / Cargo
echo "[*] Checking for Rust compiler..."
if ! command -v cargo &> /dev/null
then
    echo -e "${RED}[ERROR] Rust is not installed.${NC}"
    echo "Please install Rust by running: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo ""
    exit 1
fi
echo "[OK] Rust found."
echo ""

# 3. Install NPM dependencies
echo "[*] Installing frontend dependencies..."
cd pgp-ui || exit 1
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR] npm install failed.${NC}"
    exit 1
fi
echo "[OK] Dependencies installed."
echo ""

# 4. Launch Tauri Dev Server
echo -e "${GREEN}===================================================${NC}"
echo "[*] Launching Hermes..."
echo "    Note: The very first launch will take a few "
echo "    minutes while it compiles the heavy Rust cryptography."
echo -e "${GREEN}===================================================${NC}"
npm run tauri dev
