/**
 * Seed script — creates tables (if needed) then populates SQLite from seed-data/ JSON files.
 * Run: node prisma/seed.js
 * Safe to re-run (DELETE + INSERT).
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH  = path.join(__dirname, '../data/portfolio.db');
const DATA_DIR = path.join(__dirname, '../../seed-data');   // ../seed-data relative to backend/

// Also copy JSON files to backend/data/ so the server can read them at runtime
const RUNTIME_DATA_DIR = path.join(__dirname, '../data');

function readJson(file) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) { console.warn(`  ⚠️  ${file} not found, skipping`); return []; }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function copyToRuntime(file) {
  const src = path.join(DATA_DIR, file);
  const dst = path.join(RUNTIME_DATA_DIR, file);
  if (fs.existsSync(src)) fs.copyFileSync(src, dst);
}

// Ensure runtime data dir exists
fs.mkdirSync(RUNTIME_DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── Create tables if they don't exist ─────────────────────────────────────────
console.log('🏗️   Initialising schema...');
db.exec(`
  CREATE TABLE IF NOT EXISTS Holding (
    code             TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    type             TEXT NOT NULL DEFAULT 'fund',
    value            REAL NOT NULL DEFAULT 0,
    todayPnL         REAL NOT NULL DEFAULT 0,
    todayPnLRate     REAL NOT NULL DEFAULT 0,
    holdingPnL       REAL NOT NULL DEFAULT 0,
    holdingPnLRate   REAL NOT NULL DEFAULT 0,
    totalPnL         REAL NOT NULL DEFAULT 0,
    weeklyPnL        REAL NOT NULL DEFAULT 0,
    monthlyPnL       REAL NOT NULL DEFAULT 0,
    yearlyPnL        REAL NOT NULL DEFAULT 0,
    positionRatio    REAL NOT NULL DEFAULT 0,
    quantity         REAL NOT NULL DEFAULT 0,
    holdingDays      INTEGER,
    latestChange     REAL NOT NULL DEFAULT 0,
    latestPrice      REAL NOT NULL DEFAULT 0,
    costPerUnit      REAL NOT NULL DEFAULT 0,
    breakEvenChange  REAL,
    monthReturn      REAL,
    threeMonthReturn REAL,
    sixMonthReturn   REAL,
    yearReturn       REAL,
    priceTime        TEXT,
    priceSource      TEXT,
    updatedAt        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS Trade (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tradeDate   TEXT NOT NULL,
    tradeTime   TEXT,
    code        TEXT NOT NULL,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,
    quantity    REAL NOT NULL DEFAULT 0,
    price       REAL,
    amount      REAL NOT NULL DEFAULT 0,
    dealAmount  REAL NOT NULL DEFAULT 0,
    fee         REAL NOT NULL DEFAULT 0,
    note        TEXT,
    createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ClosedPosition (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    closeDate   TEXT NOT NULL,
    code        TEXT NOT NULL,
    name        TEXT NOT NULL,
    totalPnL    REAL NOT NULL DEFAULT 0,
    yearlyPnL   REAL,
    pnLRate     REAL NOT NULL DEFAULT 0,
    marketPnL   REAL NOT NULL DEFAULT 0,
    outperform  REAL NOT NULL DEFAULT 0,
    buyAvg      REAL NOT NULL DEFAULT 0,
    sellAvg     REAL NOT NULL DEFAULT 0,
    daysAgo     INTEGER NOT NULL DEFAULT 0,
    holdingDays INTEGER NOT NULL DEFAULT 0,
    tradeFee    REAL NOT NULL DEFAULT 0,
    buildDate   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS DailySnapshot (
    date               TEXT PRIMARY KEY,
    totalValue         REAL NOT NULL DEFAULT 0,
    todayPnL           REAL NOT NULL DEFAULT 0,
    todayPnLRate       REAL NOT NULL DEFAULT 0,
    stockTodayPnL      REAL NOT NULL DEFAULT 0,
    fundTodayPnL       REAL NOT NULL DEFAULT 0,
    stockTodayPnLRate  REAL NOT NULL DEFAULT 0,
    fundTodayPnLRate   REAL NOT NULL DEFAULT 0,
    ytdPnL             REAL NOT NULL DEFAULT 0,
    ytdPnLRate         REAL NOT NULL DEFAULT 0,
    stockYtdPnL        REAL NOT NULL DEFAULT 0,
    fundYtdPnL         REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS BenchmarkPrice (
    date        TEXT PRIMARY KEY,
    sh000001    REAL NOT NULL DEFAULT 0,
    sh000001Chg REAL NOT NULL DEFAULT 0,
    cy399006    REAL NOT NULL DEFAULT 0,
    cy399006Chg REAL NOT NULL DEFAULT 0,
    kc000680    REAL NOT NULL DEFAULT 0,
    kc000680Chg REAL NOT NULL DEFAULT 0,
    hs000300    REAL NOT NULL DEFAULT 0,
    hs000300Chg REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS Setting (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);
console.log('  ✅  Schema ready');

console.log('🌱  Seeding database from seed-data/ ...');

// ── Holdings ──────────────────────────────────────────────────────────────────
const holdings = readJson('holdings.json');
copyToRuntime('holdings.json');
db.prepare('DELETE FROM Holding').run();
const insertHolding = db.prepare(`
  INSERT OR REPLACE INTO Holding
  (code,name,type,value,todayPnL,todayPnLRate,holdingPnL,holdingPnLRate,
   totalPnL,weeklyPnL,monthlyPnL,yearlyPnL,positionRatio,quantity,holdingDays,
   latestChange,latestPrice,costPerUnit,breakEvenChange,monthReturn,threeMonthReturn,
   sixMonthReturn,yearReturn,priceTime,priceSource,updatedAt)
  VALUES
  (@code,@name,@type,@value,@todayPnL,@todayPnLRate,@holdingPnL,@holdingPnLRate,
   @totalPnL,@weeklyPnL,@monthlyPnL,@yearlyPnL,@positionRatio,@quantity,@holdingDays,
   @latestChange,@latestPrice,@costPerUnit,@breakEvenChange,@monthReturn,@threeMonthReturn,
   @sixMonthReturn,@yearReturn,@priceTime,@priceSource,@updatedAt)
`);
db.transaction(items => {
  for (const h of items) insertHolding.run({
    code: h.code, name: h.name, type: h.type ?? 'fund',
    value: h.value ?? 0, todayPnL: h.todayPnL ?? 0, todayPnLRate: h.todayPnLRate ?? 0,
    holdingPnL: h.holdingPnL ?? 0, holdingPnLRate: h.holdingPnLRate ?? 0,
    totalPnL: h.totalPnL ?? 0, weeklyPnL: h.weeklyPnL ?? 0,
    monthlyPnL: h.monthlyPnL ?? 0, yearlyPnL: h.yearlyPnL ?? 0,
    positionRatio: h.positionRatio ?? 0, quantity: h.quantity ?? 0,
    holdingDays: h.holdingDays ?? null, latestChange: h.latestChange ?? 0,
    // If latestPrice not set, derive from value÷quantity (avoids ¥0.000 display)
    latestPrice: (h.latestPrice && h.latestPrice > 0)
      ? h.latestPrice
      : (h.quantity > 0 ? (h.value ?? 0) / h.quantity : 0),
    costPerUnit: h.costPerUnit ?? 0,
    breakEvenChange: h.breakEvenChange ?? null, monthReturn: h.monthReturn ?? null,
    threeMonthReturn: h.threeMonthReturn ?? null, sixMonthReturn: h.sixMonthReturn ?? null,
    yearReturn: h.yearReturn ?? null, priceTime: h.priceTime ?? null,
    priceSource: h.priceSource ?? null, updatedAt: new Date().toISOString(),
  });
})(holdings);
console.log(`  ✅  Holdings: ${holdings.length}`);

// ── Trades ────────────────────────────────────────────────────────────────────
const trades = readJson('trades.json');
copyToRuntime('trades.json');
db.prepare('DELETE FROM Trade').run();
const insertTrade = db.prepare(`
  INSERT INTO Trade (tradeDate,tradeTime,code,name,type,quantity,price,amount,dealAmount,fee,note,createdAt,updatedAt)
  VALUES (@tradeDate,@tradeTime,@code,@name,@type,@quantity,@price,@amount,@dealAmount,@fee,@note,@createdAt,@updatedAt)
`);
db.transaction(items => {
  for (const t of items) insertTrade.run({
    tradeDate: t.tradeDate, tradeTime: t.tradeTime ?? null,
    code: t.code, name: t.name, type: t.type,
    quantity: t.quantity ?? 0, price: t.price ?? null,
    amount: t.amount ?? 0, dealAmount: t.dealAmount ?? 0,
    fee: t.fee ?? 0, note: t.note ?? null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
})(trades);
console.log(`  ✅  Trades: ${trades.length}`);

// ── Closed Positions ──────────────────────────────────────────────────────────
const closed = readJson('closed_positions.json');
copyToRuntime('closed_positions.json');
db.prepare('DELETE FROM ClosedPosition').run();
const insertClosed = db.prepare(`
  INSERT INTO ClosedPosition
  (closeDate,code,name,totalPnL,yearlyPnL,pnLRate,marketPnL,outperform,buyAvg,sellAvg,daysAgo,holdingDays,tradeFee,buildDate)
  VALUES (@closeDate,@code,@name,@totalPnL,@yearlyPnL,@pnLRate,@marketPnL,@outperform,@buyAvg,@sellAvg,@daysAgo,@holdingDays,@tradeFee,@buildDate)
`);
db.transaction(items => {
  for (const c of items) insertClosed.run({
    closeDate: c.closeDate, code: c.code, name: c.name,
    totalPnL: c.totalPnL ?? 0, yearlyPnL: c.yearlyPnL ?? null,
    pnLRate: c.pnLRate ?? 0, marketPnL: c.marketPnL ?? 0,
    outperform: c.outperform ?? 0, buyAvg: c.buyAvg ?? 0,
    sellAvg: c.sellAvg ?? 0, daysAgo: c.daysAgo ?? 0,
    holdingDays: c.holdingDays ?? 0, tradeFee: c.tradeFee ?? 0,
    buildDate: c.buildDate,
  });
})(closed);
console.log(`  ✅  Closed positions: ${closed.length}`);

// ── Daily Snapshots ───────────────────────────────────────────────────────────
const snapshots = readJson('daily_snapshots.json');
copyToRuntime('daily_snapshots.json');
db.prepare('DELETE FROM DailySnapshot').run();
const insertSnap = db.prepare(`
  INSERT OR REPLACE INTO DailySnapshot
  (date,totalValue,todayPnL,todayPnLRate,stockTodayPnL,fundTodayPnL,
   stockTodayPnLRate,fundTodayPnLRate,ytdPnL,ytdPnLRate,stockYtdPnL,fundYtdPnL)
  VALUES (@date,@totalValue,@todayPnL,@todayPnLRate,@stockTodayPnL,@fundTodayPnL,
   @stockTodayPnLRate,@fundTodayPnLRate,@ytdPnL,@ytdPnLRate,@stockYtdPnL,@fundYtdPnL)
`);
db.transaction(items => {
  for (const s of items) insertSnap.run({
    date: s.date, totalValue: s.totalValue ?? 0,
    todayPnL: s.todayPnL ?? 0, todayPnLRate: s.todayPnLRate ?? 0,
    stockTodayPnL: s.stockTodayPnL ?? 0, fundTodayPnL: s.fundTodayPnL ?? 0,
    stockTodayPnLRate: s.stockTodayPnLRate ?? 0, fundTodayPnLRate: s.fundTodayPnLRate ?? 0,
    ytdPnL: s.ytdPnL ?? 0, ytdPnLRate: s.ytdPnLRate ?? 0,
    stockYtdPnL: s.stockYtdPnL ?? 0, fundYtdPnL: s.fundYtdPnL ?? 0,
  });
})(snapshots);
console.log(`  ✅  Daily snapshots: ${snapshots.length}`);

// ── Benchmark Prices ──────────────────────────────────────────────────────────
const benchmarks = readJson('benchmark_prices.json');
copyToRuntime('benchmark_prices.json');
if (benchmarks.length > 0) {
  db.prepare('DELETE FROM BenchmarkPrice').run();
  const insertBench = db.prepare(`
    INSERT OR REPLACE INTO BenchmarkPrice
    (date,sh000001,sh000001Chg,cy399006,cy399006Chg,kc000680,kc000680Chg,hs000300,hs000300Chg)
    VALUES (@date,@sh000001,@sh000001Chg,@cy399006,@cy399006Chg,@kc000680,@kc000680Chg,@hs000300,@hs000300Chg)
  `);
  db.transaction(items => {
    for (const b of items) insertBench.run({
      date: b.date,
      sh000001: b.sh000001?.close ?? 0, sh000001Chg: b.sh000001?.changeRate ?? 0,
      cy399006: b.cy399006?.close ?? 0, cy399006Chg: b.cy399006?.changeRate ?? 0,
      kc000680: b.kc000680?.close ?? 0, kc000680Chg: b.kc000680?.changeRate ?? 0,
      hs000300: b.hs000300?.close ?? 0, hs000300Chg: b.hs000300?.changeRate ?? 0,
    });
  })(benchmarks);
  console.log(`  ✅  Benchmarks: ${benchmarks.length}`);
}

// ── Settings ──────────────────────────────────────────────────────────────────
const settingsPath = path.join(DATA_DIR, 'settings.json');
copyToRuntime('settings.json');
if (fs.existsSync(settingsPath)) {
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  db.prepare('DELETE FROM Setting').run();
  const insertSetting = db.prepare('INSERT OR REPLACE INTO Setting (key,value) VALUES (@key,@value)');
  db.transaction(entries => {
    for (const [key, value] of entries)
      insertSetting.run({ key, value: typeof value === 'string' ? value : JSON.stringify(value) });
  })(Object.entries(settings));
  console.log(`  ✅  Settings: ${Object.keys(settings).length} keys`);
}

db.close();
console.log('🎉  Seed complete!');
