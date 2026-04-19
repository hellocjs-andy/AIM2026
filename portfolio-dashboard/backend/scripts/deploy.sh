#!/bin/bash
# =============================================================================
# deploy.sh — Run after every `git pull` on the server
# Usage:  cd portfolio-dashboard/backend && bash scripts/deploy.sh
# =============================================================================
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BACKEND_DIR"

echo "=============================="
echo " Portfolio Backend Deploy"
echo " Dir: $BACKEND_DIR"
echo "=============================="

# 1. Install / update dependencies (includes devDeps for build)
echo ""
echo "[1/4] Installing dependencies..."
npm install

# 2. Conditional seed — creates tables + populates data if Holding table is empty
echo ""
echo "[2/4] Checking seed state..."
mkdir -p data
HOLDING_COUNT=$(node -e "
try {
  const db = require('better-sqlite3')('data/portfolio.db');
  // Check if table exists first
  const tableExists = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='Holding'\").get();
  if (!tableExists) { console.log(0); db.close(); return; }
  const row = db.prepare('SELECT COUNT(*) as cnt FROM Holding').get();
  console.log(row.cnt);
  db.close();
} catch(e) { console.log(0); }
" 2>/dev/null || echo 0)
if [ "$HOLDING_COUNT" -eq "0" ] 2>/dev/null; then
  echo "  -> DB is empty or new, running seed..."
  node prisma/seed.js
else
  echo "  -> DB has $HOLDING_COUNT holdings, skipping seed"
fi

# 3. Build TypeScript
echo ""
echo "[3/4] Building TypeScript..."
npm run build

# 4. Restart PM2 (start if not running)
echo ""
echo "[4/4] Restarting PM2 process..."
if pm2 describe portfolio-backend > /dev/null 2>&1; then
  pm2 restart portfolio-backend
else
  echo "  -> Starting new PM2 process..."
  mkdir -p logs
  pm2 start ecosystem.config.js
fi
pm2 save

echo ""
echo "=============================="
echo " Deploy complete!"
echo "=============================="
pm2 list
