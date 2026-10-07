#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}===================================================${NC}"
echo -e "${GREEN}  Hermes / Aura Privacy Engine - Launcher ${NC}"
echo -e "${GREEN}===================================================${NC}"
echo ""

if ! command -v python3 &> /dev/null
then
    echo -e "${RED}[ERROR] Python 3 is not installed or not in PATH.${NC}"
    exit 1
fi

python3 setup.py
