import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import Database from 'better-sqlite3';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3001;

// ── Database ──────────────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, '../data/portfolio.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: 'text/csv', limit: '10mb' }));

// ── Helpers ───────────────────────────────────────────────────────────────────
function getSettings(): Record<string, any> {
  const rows = db.prepare('SELECT key, value FROM Setting').all() as { key: string; value: string }[];
  const result: Record<string, any> = {};
  for (const r of rows) {
    try { result[r.key] = JSON.parse(r.value); } catch { result[r.key] = r.value; }
  }
  return result;
}

const HOLDING_UPSERT = `INSERT OR REPLACE INTO Holding
  (code,name,type,value,todayPnL,todayPnLRate,holdingPnL,holdingPnLRate,totalPnL,weeklyPnL,
   monthlyPnL,yearlyPnL,positionRatio,quantity,holdingDays,latestChange,latestPrice,costPerUnit,
   breakEvenChange,monthReturn,threeMonthReturn,sixMonthReturn,yearReturn,priceTime,priceSource,updatedAt)
  VALUES
  (@code,@name,@type,@value,@todayPnL,@todayPnLRate,@holdingPnL,@holdingPnLRate,@totalPnL,@weeklyPnL,
   @monthlyPnL,@yearlyPnL,@positionRatio,@quantity,@holdingDays,@latestChange,@latestPrice,@costPerUnit,
   @breakEvenChange,@monthReturn,@threeMonthReturn,@sixMonthReturn,@yearReturn,@priceTime,@priceSource,@updatedAt)`;

function holdingRow(h: any) {
  return {
    code: h.code, name: h.name, type: h.type ?? 'fund',
    value: h.value ?? 0, todayPnL: h.todayPnL ?? 0, todayPnLRate: h.todayPnLRate ?? 0,
    holdingPnL: h.holdingPnL ?? 0, holdingPnLRate: h.holdingPnLRate ?? 0,
    totalPnL: h.totalPnL ?? 0, weeklyPnL: h.weeklyPnL ?? 0,
    monthlyPnL: h.monthlyPnL ?? 0, yearlyPnL: h.yearlyPnL ?? 0,
    positionRatio: h.positionRatio ?? 0, quantity: h.quantity ?? 0,
    holdingDays: h.holdingDays ?? null, latestChange: h.latestChange ?? 0,
    latestPrice: h.latestPrice ?? 0, costPerUnit: h.costPerUnit ?? 0,
    breakEvenChange: h.breakEvenChange ?? null, monthReturn: h.monthReturn ?? null,
    threeMonthReturn: h.threeMonthReturn ?? null, sixMonthReturn: h.sixMonthReturn ?? null,
    yearReturn: h.yearReturn ?? null, priceTime: h.priceTime ?? null,
    priceSource: h.priceSource ?? null, updatedAt: h.updatedAt ?? new Date().toISOString(),
  };
}

// ── Price refresh ─────────────────────────────────────────────────────────────
/** Convert holding code to Tencent market prefix */
function toTencentCode(code: string): string {
  if (/^(51|50|11|13)/.test(code)) return 'sh' + code;   // Shanghai ETF / bond ETF
  if (/^(15|16|12)/.test(code)) return 'sz' + code;      // Shenzhen ETF
  if (/^6/.test(code)) return 'sh' + code;                // Shanghai stock
  return 'sz' + code;                                     // Shenzhen stock (0xx, 3xx)
}

/** Determine if a fund code should use stock API (exchange-traded ETF) */
function isExchangeTraded(code: string): boolean {
  return /^(51|50|15|16|11|12|13)/.test(code);
}

/** Fetch stock/ETF prices from Tencent API */
async function fetchStockPrices(codes: string[]): Promise<Map<string, { price: number; changeRate: number; priceTime: string }>> {
  const result = new Map();
  if (codes.length === 0) return result;
  const query = codes.map(toTencentCode).join(',');
  try {
    const { data } = await axios.get(`http://qt.gtimg.cn/q=${query}`, {
      timeout: 10000,
      headers: { Referer: 'http://finance.qq.com' },
    });
    const lines: string[] = data.split('\n');
    for (const line of lines) {
      const m = line.match(/v_[a-z]{2}(\d+)="([^"]+)"/);
      if (!m) continue;
      const code = m[1];
      const fields = m[2].split('~');
      const price = parseFloat(fields[3]);
      const prevClose = parseFloat(fields[4]);
      const changeRate = prevClose > 0 ? ((price - prevClose) / prevClose) : 0;
      const priceTime = fields[30] ?? new Date().toISOString();
      if (!isNaN(price) && price > 0) result.set(code, { price, changeRate, priceTime });
    }
  } catch (e) { console.error('fetchStockPrices error:', e); }
  return result;
}

/** Fetch fund NAV from EastMoney/1234567 */
async function fetchFundPrices(codes: string[]): Promise<Map<string, { price: number; changeRate: number; priceTime: string }>> {
  const result = new Map();
  await Promise.allSettled(codes.map(async (code) => {
    try {
      const { data } = await axios.get(`http://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`, {
        timeout: 8000,
        headers: { Referer: 'http://fund.eastmoney.com' },
      });
      const json = JSON.parse(data.replace(/^jsonpgz\(/, '').replace(/\)$/, ''));
      const price = parseFloat(json.gsz || json.dwjz);       // estimated or official NAV
      const changeRate = parseFloat(json.gszzl || '0') / 100;
      const priceTime = json.gztime || json.jzrq || '';
      if (!isNaN(price) && price > 0) result.set(code, { price, changeRate, priceTime });
    } catch { /* individual fund fetch failure is non-fatal */ }
  }));
  return result;
}

/** Refresh all holdings prices and update DB */
async function refreshPrices(): Promise<{ updated: any[]; failed: { code: string; name: string; type: string }[] }> {
  const holdings = db.prepare('SELECT * FROM Holding').all() as any[];
  const stockCodes = holdings.filter(h => h.type === 'stock' || (h.type === 'fund' && isExchangeTraded(h.code))).map(h => h.code);
  const fundCodes  = holdings.filter(h => h.type === 'fund' && !isExchangeTraded(h.code)).map(h => h.code);

  const [stockPrices, fundPrices] = await Promise.all([
    fetchStockPrices(stockCodes),
    fetchFundPrices(fundCodes),
  ]);
  const allPrices = new Map([...stockPrices, ...fundPrices]);

  const updated: any[] = [];
  const failed: { code: string; name: string; type: string }[] = [];
  const now = new Date().toISOString();

  const updateStmt = db.prepare(`UPDATE Holding SET
    latestPrice=@price, latestChange=@changeRate, priceTime=@priceTime,
    value=@value, todayPnL=@todayPnL, todayPnLRate=@changeRate, updatedAt=@updatedAt
    WHERE code=@code`);

  db.transaction(() => {
    for (const h of holdings) {
      const p = allPrices.get(h.code);
      if (!p) { failed.push({ code: h.code, name: h.name, type: h.type }); continue; }
      const value = h.quantity * p.price;
      // Use API's own changeRate (today vs yesterday's close) — not DB price diff
      const todayPnL = value * p.changeRate;
      updateStmt.run({ code: h.code, price: p.price, changeRate: p.changeRate,
        priceTime: p.priceTime, value, todayPnL, updatedAt: now });
      updated.push({ code: h.code, name: h.name, type: h.type, newPrice: p.price, changeRate: p.changeRate, priceTime: p.priceTime });
    }
  })();

  // Sync to JSON file (for compatibility with any legacy reads)
  syncHoldingsToJson();
  return { updated, failed };
}

/** Record today's snapshot into DailySnapshot */
function recordSnapshot() {
  const holdings = db.prepare('SELECT * FROM Holding').all() as any[];
  const settings = getSettings();
  const today = new Date().toISOString().split('T')[0];

  const stockCash = parseFloat(String(settings.stock_cash || '0'));
  const fundCash  = parseFloat(String(settings.fund_cash  || '0'));
  const stocks = holdings.filter(h => h.type === 'stock');
  const funds  = holdings.filter(h => h.type === 'fund');

  const stockValue = stocks.reduce((s, h) => s + (h.value || 0), 0);
  const fundValue  = funds.reduce((s, h) => s + (h.value || 0), 0);
  const totalValue = stockValue + fundValue + stockCash + fundCash;

  const todayPnL        = holdings.reduce((s, h) => s + (h.todayPnL || 0), 0);
  const stockTodayPnL   = stocks.reduce((s, h) => s + (h.todayPnL || 0), 0);
  const fundTodayPnL    = funds.reduce((s, h) => s + (h.todayPnL || 0), 0);

  const prevTotal      = totalValue - todayPnL;
  const todayPnLRate   = prevTotal > 0 ? todayPnL / prevTotal : 0;
  const prevStockTotal = (stockValue + stockCash) - stockTodayPnL;
  const prevFundTotal  = (fundValue  + fundCash)  - fundTodayPnL;
  const stockTodayPnLRate = prevStockTotal > 0 ? stockTodayPnL / prevStockTotal : 0;
  const fundTodayPnLRate  = prevFundTotal  > 0 ? fundTodayPnL  / prevFundTotal  : 0;

  const yearStart = db.prepare("SELECT totalValue FROM DailySnapshot WHERE date LIKE ? ORDER BY date ASC LIMIT 1")
    .get(new Date().getFullYear() + '%') as any;
  const yearStartVal = parseFloat(String(settings.year_start_value)) || yearStart?.totalValue || totalValue;
  const firstSnap = db.prepare("SELECT totalValue FROM DailySnapshot ORDER BY date ASC LIMIT 1").get() as any;
  const baseline = firstSnap?.totalValue || totalValue;

  // ytdPnL = current total value - year start value - (cash added - cash withdrawn) ≈ approximate
  const ytdPnL = totalValue - yearStartVal;
  const ytdPnLRate = yearStartVal > 0 ? ytdPnL / yearStartVal : 0;

  db.prepare(`INSERT OR REPLACE INTO DailySnapshot
    (date,totalValue,todayPnL,todayPnLRate,stockTodayPnL,fundTodayPnL,stockTodayPnLRate,fundTodayPnLRate,ytdPnL,ytdPnLRate,stockYtdPnL,fundYtdPnL)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(today, totalValue, todayPnL, todayPnLRate,
      stockTodayPnL, fundTodayPnL, stockTodayPnLRate, fundTodayPnLRate,
      ytdPnL, ytdPnLRate,
      stocks.reduce((s, h) => s + (h.yearlyPnL || 0), 0),
      funds.reduce((s, h) => s + (h.yearlyPnL || 0), 0));
}

/** Sync holdings from DB → JSON file (for legacy compatibility) */
function syncHoldingsToJson() {
  try {
    const holdings = db.prepare('SELECT * FROM Holding').all();
    const dataDir = path.join(__dirname, '../data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'holdings.json'), JSON.stringify(holdings, null, 2));
  } catch (e) { console.error('syncHoldingsToJson error:', e); }
}

// ── computeSummary ────────────────────────────────────────────────────────────
function computeSummary() {
  const holdings = db.prepare('SELECT * FROM Holding').all() as any[];
  const closed   = db.prepare('SELECT * FROM ClosedPosition').all() as any[];
  const settings = getSettings();

  const stocks = holdings.filter(h => h.type === 'stock');
  const funds  = holdings.filter(h => h.type === 'fund');

  const stockValue  = stocks.reduce((s, h) => s + (h.value || 0), 0);
  const fundValue   = funds.reduce((s, h)  => s + (h.value || 0), 0);
  const investValue = stockValue + fundValue;
  const stockCash   = parseFloat(String(settings.stock_cash || '0'));
  const fundCash    = parseFloat(String(settings.fund_cash  || '0'));
  const totalValue  = investValue + stockCash + fundCash;

  const todayPnL   = holdings.reduce((s, h) => s + (h.todayPnL   || 0), 0);
  const holdingPnL = holdings.reduce((s, h) => s + (h.holdingPnL || 0), 0);
  const totalPnL   = holdings.reduce((s, h) => s + (h.totalPnL   || 0), 0);

  const stockTodayPnL   = stocks.reduce((s, h) => s + (h.todayPnL   || 0), 0);
  const fundTodayPnL    = funds.reduce((s, h)  => s + (h.todayPnL   || 0), 0);
  const stockHoldingPnL = stocks.reduce((s, h) => s + (h.holdingPnL || 0), 0);
  const fundHoldingPnL  = funds.reduce((s, h)  => s + (h.holdingPnL || 0), 0);
  const stockTotalPnL   = stocks.reduce((s, h) => s + (h.totalPnL   || 0), 0);
  const fundTotalPnL    = funds.reduce((s, h)  => s + (h.totalPnL   || 0), 0);

  const yearHoldingPnL  = holdings.reduce((s, h) => s + (h.yearlyPnL || 0), 0);
  const stockYearHoldingPnL = stocks.reduce((s, h) => s + (h.yearlyPnL || 0), 0);
  const fundYearHoldingPnL  = funds.reduce((s, h)  => s + (h.yearlyPnL || 0), 0);

  const currentYear = new Date().getFullYear().toString();
  const yearClosedPnL = closed
    .filter(p => p.closeDate?.startsWith(currentYear))
    .reduce((s, p) => s + (p.yearlyPnL ?? p.totalPnL ?? 0), 0);

  const yearPnL      = yearHoldingPnL + yearClosedPnL;
  const stockYearPnL = stockYearHoldingPnL;
  const fundYearPnL  = fundYearHoldingPnL + yearClosedPnL;

  const yearStartValue  = parseFloat(String(settings.year_start_value)) || 0;
  const yearTargetRate  = parseFloat(String(settings.year_target_rate)) || 0.3;
  const yearReturnRate  = yearStartValue > 0 ? yearPnL / yearStartValue : 0;
  const yearTargetPnL   = yearStartValue * yearTargetRate;
  const yearGapRate     = yearTargetRate - yearReturnRate;
  const yearGapAmount   = yearStartValue * yearGapRate;

  const now         = new Date();
  const dayOfYear   = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const totalDaysInYear    = (now.getFullYear() % 4 === 0) ? 366 : 365;
  const expectedReturnRate = yearTargetRate * (dayOfYear / totalDaysInYear);

  const prevTotal      = totalValue - todayPnL;
  const todayPnLRate   = prevTotal > 0 ? todayPnL / prevTotal : 0;
  const costBasis      = investValue - holdingPnL;
  const holdingPnLRate = costBasis > 0 ? holdingPnL / costBasis : 0;

  const stockTotalValue   = stockValue + stockCash;
  const fundTotalValue    = fundValue  + fundCash;
  const pStock = stockTotalValue - stockTodayPnL;
  const pFund  = fundTotalValue  - fundTodayPnL;
  const stockTodayPnLRate = pStock > 0 ? stockTodayPnL / pStock : 0;
  const fundTodayPnLRate  = pFund  > 0 ? fundTodayPnL  / pFund  : 0;
  const stockYearPnLRate  = yearStartValue > 0 ? stockYearPnL / yearStartValue : 0;
  const fundYearPnLRate   = yearStartValue > 0 ? fundYearPnL  / yearStartValue : 0;

  const combinedTotal      = stockTotalValue + fundTotalValue;
  const stockPositionRatio = stockTotalValue > 0 ? stockValue / stockTotalValue : 0;
  const fundPositionRatio  = fundTotalValue  > 0 ? fundValue  / fundTotalValue  : 0;
  const totalPositionRatio = combinedTotal   > 0 ? investValue / combinedTotal  : 0;
  const stockRatioOfTotal  = combinedTotal   > 0 ? stockTotalValue / combinedTotal : 0;
  const fundRatioOfTotal   = combinedTotal   > 0 ? fundTotalValue  / combinedTotal : 0;

  return {
    totalValue, investValue, stockValue, fundValue, stockCash, fundCash,
    stockCount: stocks.length, fundCount: funds.length,
    todayPnL, todayPnLRate, holdingPnL, holdingPnLRate, totalPnL,
    yearStartValue, yearPnL, yearHoldingPnL, yearClosedPnL,
    yearReturnRate, yearTargetRate, yearTargetPnL, yearGapRate, yearGapAmount,
    dayOfYear, totalDaysInYear, expectedReturnRate,
    updatedAt: new Date().toISOString(),
    stockTotalValue, fundTotalValue,
    stockTodayPnL, fundTodayPnL, stockTodayPnLRate, fundTodayPnLRate,
    stockHoldingPnL, fundHoldingPnL, stockTotalPnL, fundTotalPnL,
    stockYearPnL, fundYearPnL, stockYearPnLRate, fundYearPnLRate,
    stockPositionRatio, fundPositionRatio, totalPositionRatio,
    stockRatioOfTotal, fundRatioOfTotal,
  };
}

// ── Utility ───────────────────────────────────────────────────────────────────
function buildWhere(filters: { col: string; op: string; val: any }[]) {
  const active = filters.filter(f => f.val !== undefined && f.val !== '');
  const where  = active.length ? ' WHERE ' + active.map(f => `${f.col} ${f.op} ?`).join(' AND ') : '';
  return { where, params: active.map(f => f.val) };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Dashboard ─────────────────────────────────────────────────────────────────
app.get('/api/dashboard/summary', (_req, res) => {
  try { res.json(computeSummary()); }
  catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── Holdings ──────────────────────────────────────────────────────────────────
app.get('/api/holdings', (_req, res) => {
  try { res.json(db.prepare('SELECT * FROM Holding ORDER BY value DESC').all()); }
  catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get('/api/holdings/:code', (req, res) => {
  try {
    const h = db.prepare('SELECT * FROM Holding WHERE code=?').get(req.params.code);
    if (!h) return res.status(404).json({ error: 'Not found' });
    res.json(h);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.put('/api/holdings/:code/price', (req, res) => {
  try {
    db.prepare('UPDATE Holding SET latestPrice=?,updatedAt=? WHERE code=?')
      .run(req.body.price, new Date().toISOString(), req.params.code);
    res.json(db.prepare('SELECT * FROM Holding WHERE code=?').get(req.params.code));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.put('/api/holdings/:code/type', (req, res) => {
  try {
    db.prepare('UPDATE Holding SET type=?,updatedAt=? WHERE code=?')
      .run(req.body.type, new Date().toISOString(), req.params.code);
    res.json(db.prepare('SELECT * FROM Holding WHERE code=?').get(req.params.code));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/holdings/refresh', async (_req, res) => {
  try {
    const { updated, failed } = await refreshPrices();
    recordSnapshot();
    res.json({
      updated: updated.map(h => ({ code: h.code, name: h.name, type: h.type,
        newPrice: h.newPrice, changeRate: h.changeRate, priceTime: h.priceTime })),
      unchanged: [], failed,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/holdings/import', (req, res) => {
  try {
    const { holdings } = req.body;
    if (!Array.isArray(holdings)) return res.status(400).json({ error: 'holdings must be array' });
    const upsert = db.prepare(HOLDING_UPSERT);
    db.transaction((items: any[]) => { for (const h of items) upsert.run(holdingRow(h)); })(holdings);
    res.json({ imported: holdings.length });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── Trades ────────────────────────────────────────────────────────────────────
// NOTE: /export must be declared BEFORE /:id
app.get('/api/trades/export', (_req, res) => {
  try {
    const trades = db.prepare('SELECT * FROM Trade ORDER BY tradeDate DESC, id DESC').all() as any[];
    const header = 'id,tradeDate,tradeTime,code,name,type,quantity,price,amount,dealAmount,fee,note';
    const rows = trades.map(t => [
      t.id, t.tradeDate, t.tradeTime ?? '', t.code, `"${t.name}"`, t.type,
      t.quantity, t.price ?? '', t.amount, t.dealAmount, t.fee, t.note ?? '',
    ].join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="trades.csv"');
    res.send([header, ...rows].join('\n'));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get('/api/trades', (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page as string)     || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize as string) || 20);
    const offset   = (page - 1) * pageSize;
    const { where, params } = buildWhere([
      { col: 'code',      op: '=',  val: req.query.code },
      { col: 'type',      op: '=',  val: req.query.type },
      { col: 'tradeDate', op: '>=', val: req.query.startDate },
      { col: 'tradeDate', op: '<=', val: req.query.endDate },
    ]);
    const { cnt } = (db.prepare(`SELECT COUNT(*) as cnt FROM Trade${where}`) as any).get(...params) as any;
    const items   = (db.prepare(`SELECT * FROM Trade${where} ORDER BY tradeDate DESC, id DESC LIMIT ? OFFSET ?`) as any).all(...params, pageSize, offset);
    res.json({ total: cnt, page, pageSize, items });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/trades/import', (req, res) => {
  try {
    const csv: string = req.body;
    const lines = csv.split('\n').filter((l: string) => l.trim());
    if (lines.length < 2) return res.json({ imported: 0, skipped: 0 });
    const header = lines[0].split(',').map((h: string) => h.trim());
    const insert = db.prepare(
      'INSERT INTO Trade (tradeDate,tradeTime,code,name,type,quantity,price,amount,dealAmount,fee,note,createdAt,updatedAt) VALUES (@tradeDate,@tradeTime,@code,@name,@type,@quantity,@price,@amount,@dealAmount,@fee,@note,@createdAt,@updatedAt)');
    let imported = 0, skipped = 0;
    db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',');
        if (vals.length < 8) { skipped++; continue; }
        const obj: any = {};
        header.forEach((k: string, idx: number) => { obj[k] = vals[idx]?.trim(); });
        try {
          insert.run({ tradeDate: obj.tradeDate, tradeTime: obj.tradeTime || null,
            code: obj.code, name: (obj.name || '').replace(/^"|"$/g, ''), type: obj.type,
            quantity: parseFloat(obj.quantity) || 0, price: obj.price ? parseFloat(obj.price) : null,
            amount: parseFloat(obj.amount) || 0, dealAmount: parseFloat(obj.dealAmount) || 0,
            fee: parseFloat(obj.fee) || 0, note: obj.note || null,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
          imported++;
        } catch { skipped++; }
      }
    })();
    res.json({ imported, skipped });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/trades', (req, res) => {
  try {
    const t = req.body;
    const r = db.prepare(
      'INSERT INTO Trade (tradeDate,tradeTime,code,name,type,quantity,price,amount,dealAmount,fee,note,createdAt,updatedAt) VALUES (@tradeDate,@tradeTime,@code,@name,@type,@quantity,@price,@amount,@dealAmount,@fee,@note,@createdAt,@updatedAt)')
      .run({ tradeDate: t.tradeDate, tradeTime: t.tradeTime ?? null,
             code: t.code, name: t.name, type: t.type,
             quantity: t.quantity ?? 0, price: t.price ?? null,
             amount: t.amount ?? 0, dealAmount: t.dealAmount ?? 0,
             fee: t.fee ?? 0, note: t.note ?? null,
             createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    res.status(201).json(db.prepare('SELECT * FROM Trade WHERE id=?').get(r.lastInsertRowid));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.put('/api/trades/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const t  = req.body;
    const r  = db.prepare(
      'UPDATE Trade SET tradeDate=@tradeDate,tradeTime=@tradeTime,code=@code,name=@name,type=@type,quantity=@quantity,price=@price,amount=@amount,dealAmount=@dealAmount,fee=@fee,note=@note,updatedAt=@updatedAt WHERE id=@id')
      .run({ id, tradeDate: t.tradeDate, tradeTime: t.tradeTime ?? null,
             code: t.code, name: t.name, type: t.type,
             quantity: t.quantity ?? 0, price: t.price ?? null,
             amount: t.amount ?? 0, dealAmount: t.dealAmount ?? 0,
             fee: t.fee ?? 0, note: t.note ?? null, updatedAt: new Date().toISOString() });
    if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json(db.prepare('SELECT * FROM Trade WHERE id=?').get(id));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.delete('/api/trades/:id', (req, res) => {
  try {
    const r = db.prepare('DELETE FROM Trade WHERE id=?').run(parseInt(req.params.id));
    if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── Closed Positions ──────────────────────────────────────────────────────────
app.get('/api/closed-positions', (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page as string)     || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize as string) || 20);
    const offset   = (page - 1) * pageSize;
    const { where, params } = buildWhere([
      { col: 'code',      op: '=',  val: req.query.code },
      { col: 'closeDate', op: '>=', val: req.query.startDate },
      { col: 'closeDate', op: '<=', val: req.query.endDate },
    ]);
    const { cnt } = (db.prepare(`SELECT COUNT(*) as cnt FROM ClosedPosition${where}`) as any).get(...params) as any;
    const items   = (db.prepare(`SELECT * FROM ClosedPosition${where} ORDER BY closeDate DESC LIMIT ? OFFSET ?`) as any).all(...params, pageSize, offset);
    res.json({ total: cnt, page, pageSize, items });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/closed-positions/import', (req, res) => {
  try {
    const { positions } = req.body;
    if (!Array.isArray(positions)) return res.status(400).json({ error: 'positions must be array' });
    const insert = db.prepare(
      'INSERT OR IGNORE INTO ClosedPosition (closeDate,code,name,totalPnL,yearlyPnL,pnLRate,marketPnL,outperform,buyAvg,sellAvg,daysAgo,holdingDays,tradeFee,buildDate) VALUES (@closeDate,@code,@name,@totalPnL,@yearlyPnL,@pnLRate,@marketPnL,@outperform,@buyAvg,@sellAvg,@daysAgo,@holdingDays,@tradeFee,@buildDate)');
    db.transaction((items: any[]) => {
      for (const c of items) insert.run({
        closeDate: c.closeDate, code: c.code, name: c.name,
        totalPnL: c.totalPnL ?? 0, yearlyPnL: c.yearlyPnL ?? null,
        pnLRate: c.pnLRate ?? 0, marketPnL: c.marketPnL ?? 0,
        outperform: c.outperform ?? 0, buyAvg: c.buyAvg ?? 0,
        sellAvg: c.sellAvg ?? 0, daysAgo: c.daysAgo ?? 0,
        holdingDays: c.holdingDays ?? 0, tradeFee: c.tradeFee ?? 0,
        buildDate: c.buildDate });
    })(positions);
    res.json({ imported: positions.length });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── Settings ──────────────────────────────────────────────────────────────────
app.get('/api/settings', (_req, res) => {
  try { res.json(getSettings()); }
  catch (e) { res.status(500).json({ error: String(e) }); }
});

app.put('/api/settings', (req, res) => {
  try {
    const upsert = db.prepare('INSERT OR REPLACE INTO Setting (key,value) VALUES (@key,@value)');
    db.transaction((entries: [string, any][]) => {
      for (const [key, value] of entries)
        upsert.run({ key, value: typeof value === 'string' ? value : JSON.stringify(value) });
    })(Object.entries(req.body));
    res.json(getSettings());
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── Performance ───────────────────────────────────────────────────────────────
app.get('/api/performance/daily', (req, res) => {
  try {
    const { where, params } = buildWhere([
      { col: 'date', op: '>=', val: req.query.startDate },
      { col: 'date', op: '<=', val: req.query.endDate },
    ]);
    res.json((db.prepare(`SELECT * FROM DailySnapshot${where} ORDER BY date ASC`) as any).all(...params));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get('/api/performance/monthly', (req, res) => {
  try {
    const year = String(req.query.year || new Date().getFullYear());
    const rows = db.prepare('SELECT * FROM DailySnapshot WHERE date LIKE ? ORDER BY date ASC')
      .all(year + '%') as any[];
    const map = new Map<string, { year: number; month: number; rows: any[] }>();
    for (const s of rows) {
      const [y, m] = s.date.split('-');
      const key    = `${y}-${m}`;
      if (!map.has(key)) map.set(key, { year: parseInt(y), month: parseInt(m), rows: [] });
      map.get(key)!.rows.push(s);
    }
    const result = Array.from(map.values()).map(({ year, month, rows: mRows }) => {
      const last         = mRows[mRows.length - 1];
      const monthPnL     = mRows.reduce((s, r) => s + (r.todayPnL     || 0), 0);
      const stockMonthPnL = mRows.reduce((s, r) => s + (r.stockTodayPnL || 0), 0);
      const fundMonthPnL  = mRows.reduce((s, r) => s + (r.fundTodayPnL  || 0), 0);
      const prev = db.prepare('SELECT totalValue FROM DailySnapshot WHERE date < ? ORDER BY date DESC LIMIT 1')
        .get(mRows[0].date) as any;
      const prevValue = prev?.totalValue ?? (last.totalValue - monthPnL);
      return { year, month, totalValue: last.totalValue, monthPnL,
        monthPnLRate: prevValue > 0 ? monthPnL / prevValue : 0, stockMonthPnL, fundMonthPnL };
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── Benchmarks ────────────────────────────────────────────────────────────────
app.get('/api/benchmarks', (req, res) => {
  try {
    const { where, params } = buildWhere([
      { col: 'date', op: '>=', val: req.query.startDate },
      { col: 'date', op: '<=', val: req.query.endDate },
    ]);
    const rows = (db.prepare(`SELECT * FROM BenchmarkPrice${where} ORDER BY date ASC`) as any).all(...params) as any[];
    res.json(rows.map(r => ({
      date: r.date,
      sh000001: { close: r.sh000001, changeRate: r.sh000001Chg },
      cy399006: { close: r.cy399006, changeRate: r.cy399006Chg },
      kc000680: { close: r.kc000680, changeRate: r.kc000680Chg },
      hs000300: { close: r.hs000300, changeRate: r.hs000300Chg },
    })));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/benchmarks/refresh', async (_req, res) => {
  try {
    // Fetch CSI indices from Tencent stock API
    const codes = ['sh000001', 'sz399006', 'sh000680', 'sh000300'];
    const { data } = await axios.get(`http://qt.gtimg.cn/q=${codes.join(',')}`, {
      timeout: 10000, headers: { Referer: 'http://finance.qq.com' },
    });
    const today  = new Date().toISOString().split('T')[0];
    const fields: Record<string, number[]> = {};
    for (const line of (data as string).split('\n')) {
      const m = line.match(/v_([a-z]{2}\d+)="([^"]+)"/);
      if (!m) continue;
      const parts = m[2].split('~');
      const price = parseFloat(parts[3]);
      const prev  = parseFloat(parts[4]);
      fields[m[1]] = [price, prev > 0 ? (price - prev) / prev : 0];
    }
    const row = {
      date: today,
      sh000001: fields['sh000001']?.[0] ?? 0, sh000001Chg: fields['sh000001']?.[1] ?? 0,
      cy399006: fields['sz399006']?.[0] ?? 0, cy399006Chg: fields['sz399006']?.[1] ?? 0,
      kc000680: fields['sh000680']?.[0] ?? 0, kc000680Chg: fields['sh000680']?.[1] ?? 0,
      hs000300: fields['sh000300']?.[0] ?? 0, hs000300Chg: fields['sh000300']?.[1] ?? 0,
    };
    db.prepare(`INSERT OR REPLACE INTO BenchmarkPrice
      (date,sh000001,sh000001Chg,cy399006,cy399006Chg,kc000680,kc000680Chg,hs000300,hs000300Chg)
      VALUES (@date,@sh000001,@sh000001Chg,@cy399006,@cy399006Chg,@kc000680,@kc000680Chg,@hs000300,@hs000300Chg)`)
      .run(row);
    res.json({ updated: 1, date: today });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── Cron: refresh every 5 min on weekdays 9:25–15:05 ─────────────────────────
cron.schedule('*/5 9-15 * * 1-5', async () => {
  console.log('[cron] Refreshing prices...');
  try {
    const { updated, failed } = await refreshPrices();
    recordSnapshot();
    console.log(`[cron] Updated ${updated.length} holdings, ${failed.length} failed`);
  } catch (e) { console.error('[cron] Error:', e); }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Portfolio Dashboard API running on port ${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});

export default app;
