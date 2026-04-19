/**
 * sync-to-server.js — 从本地（大陆）拉取行情 + 历史指数数据，同步到境外服务器
 *
 * 用法：
 *   node scripts/sync-to-server.js [server_base_url]
 *
 * 默认 server_base_url = http://43.173.84.252/api
 *
 * 功能：
 *   1. 本地拉取所有持仓最新价（腾讯 API + 天天基金）
 *   2. 更新本地 SQLite
 *   3. 将完整持仓数据 POST 到服务器 /api/holdings/import
 *   4. 从东方财富获取 4 大指数 2026-01-01 ~ 今日 历史日线数据
 *   5. 将历史指数数据 POST 到服务器 /api/benchmarks/import
 */

const Database = require('better-sqlite3');
const axios    = require('axios');
const path     = require('path');

const SERVER   = process.argv[2] || 'http://43.173.84.252/api';
const DB_PATH  = path.join(__dirname, '../data/portfolio.db');

console.log(`服务器地址: ${SERVER}`);
console.log(`本地数据库: ${DB_PATH}\n`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── Helpers ───────────────────────────────────────────────────────────────────
function toTencentCode(code) {
  if (/^(51|50|13)/.test(code)) return 'sh' + code;
  if (/^(15|16|12)/.test(code)) return 'sz' + code;
  if (/^6/.test(code)) return 'sh' + code;
  return 'sz' + code;
}
function isExchangeTraded(code) {
  return /^(51|50|15|16|12|13)/.test(code);
}

// ── 1. 拉取股票/场内 ETF 价格 ─────────────────────────────────────────────────
async function fetchStockPrices(codes) {
  const result = new Map();
  if (!codes.length) return result;
  const query = codes.map(toTencentCode).join(',');
  try {
    const { data } = await axios.get(`http://qt.gtimg.cn/q=${query}`, {
      timeout: 10000, headers: { Referer: 'http://finance.qq.com' },
    });
    for (const line of data.split('\n')) {
      const m = line.match(/v_[a-z]{2}(\d+)="([^"]+)"/);
      if (!m) continue;
      const fields     = m[2].split('~');
      const price      = parseFloat(fields[3]);
      const prevClose  = parseFloat(fields[4]);
      const changeRate = prevClose > 0 ? (price - prevClose) / prevClose : 0;
      const priceTime  = fields[30] ?? '';
      if (!isNaN(price) && price > 0) result.set(m[1], { price, changeRate, priceTime });
    }
  } catch (e) { console.error('股票行情拉取失败:', e.message); }
  return result;
}

// ── 2. 拉取场外基金 NAV ────────────────────────────────────────────────────────
async function fetchFundPrices(codes) {
  const result = new Map();
  await Promise.allSettled(codes.map(async (code) => {
    try {
      const { data } = await axios.get(
        `http://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`,
        { timeout: 8000, headers: { Referer: 'http://fund.eastmoney.com' } }
      );
      const json       = JSON.parse(data.replace(/^jsonpgz\(/, '').replace(/\)$/, ''));
      // gsz 非交易时段可能为 "--"（truthy 但无效），需过滤后再回退到 dwjz
      const validNum = (v) => v && v !== '--' && !isNaN(parseFloat(v));
      const price      = parseFloat(validNum(json.gsz) ? json.gsz : json.dwjz);
      const changeRate = validNum(json.gszzl) ? parseFloat(json.gszzl) / 100 : 0;
      const priceTime  = json.gztime || json.jzrq || '';
      if (!isNaN(price) && price > 0) result.set(code, { price, changeRate, priceTime });
    } catch { /* 单只失败不影响整体 */ }
  }));
  return result;
}

// ── 3. 刷新本地持仓并推送服务器 ───────────────────────────────────────────────
async function syncHoldings() {
  console.log('── 持仓价格同步 ──');
  const holdings = db.prepare('SELECT * FROM Holding').all();
  const stockCodes = holdings
    .filter(h => h.type === 'stock' || (h.type === 'fund' && isExchangeTraded(h.code)))
    .map(h => h.code);
  const fundCodes = holdings
    .filter(h => h.type === 'fund' && !isExchangeTraded(h.code))
    .map(h => h.code);

  console.log(`  拉取股票/ETF ${stockCodes.length} 支...`);
  console.log(`  拉取场外基金 ${fundCodes.length} 支...`);
  const [stockPrices, fundPrices] = await Promise.all([
    fetchStockPrices(stockCodes),
    fetchFundPrices(fundCodes),
  ]);
  const allPrices = new Map([...stockPrices, ...fundPrices]);

  const now = new Date().toISOString();
  const updateStmt = db.prepare(`UPDATE Holding SET
    latestPrice=@price, latestChange=@changeRate, priceTime=@priceTime,
    value=@value, todayPnL=@todayPnL, todayPnLRate=@changeRate, updatedAt=@updatedAt
    WHERE code=@code`);

  let updated = 0, failed = 0;
  db.transaction(() => {
    for (const h of holdings) {
      const p = allPrices.get(h.code);
      if (!p) { failed++; continue; }
      const value    = h.quantity * p.price;
      const todayPnL = value * p.changeRate;
      updateStmt.run({ code: h.code, price: p.price, changeRate: p.changeRate,
        priceTime: p.priceTime, value, todayPnL, updatedAt: now });
      updated++;
    }
  })();
  console.log(`  本地更新: ${updated} 成功, ${failed} 失败`);

  // 推送到服务器
  const allHoldings = db.prepare('SELECT * FROM Holding').all();
  try {
    const r = await axios.post(`${SERVER}/holdings/import`,
      { holdings: allHoldings }, { timeout: 15000 });
    console.log(`  ✅ 推送服务器: ${r.data.imported} 条持仓`);
  } catch (e) {
    console.error(`  ❌ 推送失败: ${e.message}`);
  }
}

// ── 4. 拉取历史指数日线数据 ────────────────────────────────────────────────────
// 东方财富历史 K 线 API
// fields2: f51=日期,f52=开盘,f53=收盘,f54=最高,f55=最低,f58=振幅%,f59=涨跌幅%
const INDICES = [
  { field: 'sh000001', secid: '1.000001', name: '上证指数'  },
  { field: 'cy399006', secid: '0.399006', name: '创业板指'  },
  { field: 'kc000680', secid: '1.000680', name: '科创板指'  },
  { field: 'hs000300', secid: '1.000300', name: '沪深300'   },
];

async function fetchIndexHistory(secid, beg, end) {
  const url = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';
  try {
    const { data } = await axios.get(url, {
      params: {
        secid,
        fields1: 'f1,f2,f3,f4,f5,f6',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: 101,    // 日线
        fqt: 0,      // 不复权
        beg,
        end,
      },
      timeout: 15000,
      headers: { Referer: 'https://finance.eastmoney.com' },
    });
    return data?.data?.klines ?? [];
  } catch (e) {
    console.error(`  ❌ ${secid} 拉取失败: ${e.message}`);
    return [];
  }
}

async function syncBenchmarks() {
  console.log('\n── 历史指数数据同步 ──');
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const beg   = '20260101';
  const end   = '20260417';   // 按需修改

  // 拉取所有指数数据
  const indexData = {};
  for (const idx of INDICES) {
    console.log(`  拉取 ${idx.name} (${idx.secid}) ${beg}~${end}...`);
    const klines = await fetchIndexHistory(idx.secid, beg, end);
    console.log(`    获取 ${klines.length} 条K线`);
    for (const line of klines) {
      const parts      = line.split(',');
      const date       = parts[0];          // 2026-01-02
      const close      = parseFloat(parts[2]);
      const changeRate = parseFloat(parts[8]) / 100;  // f59 是百分比
      if (!indexData[date]) indexData[date] = { date };
      indexData[date][idx.field] = { close, changeRate };
    }
  }

  const records = Object.values(indexData).sort((a, b) => a.date.localeCompare(b.date));
  console.log(`  整合后共 ${records.length} 个交易日`);

  if (!records.length) { console.log('  ⚠️  无数据，跳过'); return; }

  // 写入本地 DB
  const upsert = db.prepare(`INSERT OR REPLACE INTO BenchmarkPrice
    (date,sh000001,sh000001Chg,cy399006,cy399006Chg,kc000680,kc000680Chg,hs000300,hs000300Chg)
    VALUES (@date,@sh000001,@sh000001Chg,@cy399006,@cy399006Chg,@kc000680,@kc000680Chg,@hs000300,@hs000300Chg)`);
  db.transaction(items => {
    for (const b of items) upsert.run({
      date: b.date,
      sh000001: b.sh000001?.close ?? 0, sh000001Chg: b.sh000001?.changeRate ?? 0,
      cy399006: b.cy399006?.close ?? 0, cy399006Chg: b.cy399006?.changeRate ?? 0,
      kc000680: b.kc000680?.close ?? 0, kc000680Chg: b.kc000680?.changeRate ?? 0,
      hs000300: b.hs000300?.close ?? 0, hs000300Chg: b.hs000300?.changeRate ?? 0,
    });
  })(records);
  console.log(`  ✅ 本地 DB 写入 ${records.length} 条`);

  // 推送到服务器
  try {
    const r = await axios.post(`${SERVER}/benchmarks/import`,
      { records }, { timeout: 30000 });
    console.log(`  ✅ 推送服务器: ${r.data.imported} 条指数数据`);
  } catch (e) {
    console.error(`  ❌ 推送失败: ${e.message}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await syncHoldings();
    await syncBenchmarks();
    console.log('\n🎉 同步完成');
  } catch (e) {
    console.error('同步失败:', e);
    process.exit(1);
  } finally {
    db.close();
  }
})();
