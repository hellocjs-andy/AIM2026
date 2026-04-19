#!/bin/bash
# =============================================================================
# setup.sh — First-time server setup (run once after initial git clone)
# Usage:  cd portfolio-dashboard/backend && bash scripts/setup.sh
# =============================================================================
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BACKEND_DIR"

echo "=============================="
echo " Portfolio Backend First-Time Setup"
echo " Dir: $BACKEND_DIR"
echo "=============================="

# Check Node.js version (requires >= 18)
NODE_VER=$(node --version | cut -d. -f1 | tr -d 'v')
if [ "$NODE_VER" -lt 18 ]; then
  echo "ERROR: Node.js 18+ required (found $(node --version))"
  exit 1
fi
echo "Node.js: $(node --version)"

# 1. Install all dependencies
echo ""
echo "[1/4] Installing dependencies..."
npm install

# 2. Create tables + seed the database (seed.js creates tables if needed)
echo ""
echo "[2/4] Seeding database (creates tables + populates data)..."
mkdir -p data
node prisma/seed.js

# 3. Build TypeScript
echo ""
echo "[3/4] Building TypeScript..."
npm run build

# 4. Setup PM2
echo ""
echo "[4/4] Setting up PM2..."
if ! command -v pm2 &> /dev/null; then
  echo "  -> Installing PM2 globally..."
  npm install -g pm2
fi

mkdir -p logs
if pm2 describe portfolio-backend > /dev/null 2>&1; then
  echo "  -> PM2 process already exists, restarting..."
  pm2 restart portfolio-backend
else
  pm2 start ecosystem.config.js
fi
pm2 save
pm2 startup || true   # may require sudo — print the command if prompted

echo ""
echo "=============================="
echo " Setup complete!"
echo " API is running on port 8080"
echo "=============================="
pm2 list
