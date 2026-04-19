/**
 * sync-to-server.js — 从本地（大陆）拉取行情 + 历史指数，同步到境外服务器
 *
 * 用法：
 *   node scripts/sync-to-server.js [server_base_url]
 *
 * 默认 server_base_url = http://43.173.84.252/api
 */

const Database = require('better-sqlite3');
const axios    = require('axios');
const path     = require('path');

const SERVER  = process.argv[2] || 'http://43.173.84.252/api';
const DB_PATH = path.join(__dirname, '../data/portfolio.db');

// 通用请求头（浏览器 UA，避免被反爬）
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
};

console.log(`服务器地址: ${SERVER}`);
console.log(`本地数据库: ${DB_PATH}\n`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── 工具 ──────────────────────────────────────────────────────────────────────
function toTencentCode(code) {
  if (/^(51|50|13)/.test(code)) return 'sh' + code;
  if (/^(15|16|12)/.test(code)) return 'sz' + code;
  if (/^6/.test(code))          return 'sh' + code;
  return 'sz' + code;
}
function isExchangeTraded(code) {
  return /^(51|50|15|16|12|13)/.test(code);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 股票/场内ETF 价格（腾讯） ──────────────────────────────────────────────────
async function fetchStockPrices(codes) {
  const result = new Map();
  if (!codes.length) return result;
  const query = codes.map(toTencentCode).join(',');
  try {
    const { data } = await axios.get(`http://qt.gtimg.cn/q=${query}`, {
      timeout: 10000,
      headers: { ...BROWSER_HEADERS, Referer: 'http://finance.qq.com' },
    });
    for (const line of data.split('\n')) {
      const m = line.match(/v_[a-z]{2}(\d+)="([^"]+)"/);
      if (!m) continue;
      const fields    = m[2].split('~');
      const price     = parseFloat(fields[3]);
      const prevClose = parseFloat(fields[4]);
      const changeRate = prevClose > 0 ? (price - prevClose) / prevClose : 0;
      if (!isNaN(price) && price > 0) {
        result.set(m[1], { price, changeRate, priceTime: fields[30] ?? '' });
      }
    }
    console.log(`  股票/ETF 获取成功: ${result.size}/${codes.length}`);
  } catch (e) {
    console.error(`  ❌ 股票行情失败: ${e.message}`);
  }
  return result;
}

// ── 场外基金 NAV（天天基金 lsjz 接口，全天有效）─────────────────────────────────
// 比 fundgz 更稳定，返回最新已确认净值
async function fetchFundNAV(code) {
  try {
    const { data } = await axios.get('https://api.fund.eastmoney.com/f10/lsjz', {
      params: { fundCode: code, pageIndex: 1, pageSize: 1, callback: '', token: 'webapi' },
      headers: { ...BROWSER_HEADERS, Referer: 'https://fundf10.eastmoney.com/' },
      timeout: 10000,
    });
    const item = data?.Data?.LSJZList?.[0];
    if (!item || !item.DWJZ) return null;
    return {
      price:      parseFloat(item.DWJZ),
      changeRate: parseFloat(item.JZZZL || '0') / 100,
      priceTime:  item.FSRQ,
    };
  } catch (e) {
    console.error(`    基金 ${code} 失败: ${e.message}`);
    return null;
  }
}

async function fetchAllFundPrices(codes) {
  const result = new Map();
  for (const code of codes) {
    const p = await fetchFundNAV(code);
    if (p && p.price > 0) result.set(code, p);
    await sleep(100);   // 限速，避免触发反爬
  }
  console.log(`  场外基金 获取成功: ${result.size}/${codes.length}`);
  return result;
}

// ── 持仓同步 ──────────────────────────────────────────────────────────────────
async function syncHoldings() {
  console.log('── 持仓价格同步 ──');
  const holdings   = db.prepare('SELECT * FROM Holding').all();
  const stockCodes = holdings.filter(h => h.type === 'stock' || (h.type === 'fund' && isExchangeTraded(h.code))).map(h => h.code);
  const fundCodes  = holdings.filter(h => h.type === 'fund' && !isExchangeTraded(h.code)).map(h => h.code);

  const [stockPrices, fundPrices] = await Promise.all([
    fetchStockPrices(stockCodes),
    fetchAllFundPrices(fundCodes),
  ]);
  const allPrices = new Map([...stockPrices, ...fundPrices]);

  const now = new Date().toISOString();
  const upd = db.prepare(`UPDATE Holding SET
    latestPrice=@price, latestChange=@changeRate, priceTime=@priceTime,
    value=@value, todayPnL=@todayPnL, todayPnLRate=@changeRate, updatedAt=@now
    WHERE code=@code`);

  let ok = 0, fail = 0;
  db.transaction(() => {
    for (const h of holdings) {
      const p = allPrices.get(h.code);
      if (!p) { fail++; continue; }
      const value    = h.quantity * p.price;
      const todayPnL = value * p.changeRate;
      upd.run({ code: h.code, price: p.price, changeRate: p.changeRate,
                priceTime: p.priceTime, value, todayPnL, now });
      ok++;
    }
  })();
  console.log(`  本地更新: ${ok} 成功 / ${fail} 失败`);

  // 推送服务器
  const all = db.prepare('SELECT * FROM Holding').all();
  try {
    const r = await axios.post(`${SERVER}/holdings/import`, { holdings: all }, { timeout: 20000 });
    console.log(`  ✅ 推送服务器: ${r.data.imported} 条持仓\n`);
  } catch (e) {
    console.error(`  ❌ 推送失败: ${e.response?.data || e.message}\n`);
  }
}

// ── 历史指数数据（腾讯 web.ifzq.gtimg.cn 历史K线） ─────────────────────────────
const INDICES = [
  { field: 'sh000001', tcCode: 'sh000001', name: '上证指数'  },
  { field: 'cy399006', tcCode: 'sz399006', name: '创业板指'  },
  { field: 'kc000680', tcCode: 'sh000688', name: '科创50'    },
  { field: 'hs000300', tcCode: 'sh000300', name: '沪深300'   },
];

async function fetchIndexHistory(tcCode, startDate, endDate) {
  // startDate/endDate: 'YYYY-MM-DD'
  const varName = `kline_day_${tcCode}`;
  try {
    const { data } = await axios.get('http://web.ifzq.gtimg.cn/appstock/app/fqkline/get', {
      params: { _var: varName, param: `${tcCode},day,${startDate},${endDate},400` },
      headers: { ...BROWSER_HEADERS, Referer: 'http://finance.qq.com' },
      timeout: 15000,
    });
    // 响应格式: kline_day_sh000001={...}
    const jsonStr = data.replace(/^[^=]+=/, '');
    const json    = JSON.parse(jsonStr);
    return json?.data?.[tcCode]?.day || [];
  } catch (e) {
    console.error(`  ❌ ${tcCode} 历史K线失败: ${e.message}`);
    return [];
  }
}

async function syncBenchmarks() {
  console.log('── 历史指数数据同步 ──');
  const START = '2026-01-01';
  const END   = '2026-04-17';

  const indexData = {};  // { date → { sh000001: {...}, ... } }

  for (const idx of INDICES) {
    console.log(`  拉取 ${idx.name} (${idx.tcCode}) ${START}~${END}...`);
    const klines = await fetchIndexHistory(idx.tcCode, START, END);
    console.log(`    获取 ${klines.length} 条K线`);

    for (let i = 0; i < klines.length; i++) {
      const k        = klines[i];
      const date     = k[0];
      const close    = parseFloat(k[2]);
      const prevK    = i > 0 ? klines[i - 1] : null;
      const prev     = prevK ? parseFloat(prevK[2]) : close;
      const changeRate = prev > 0 ? (close - prev) / prev : 0;

      if (!indexData[date]) indexData[date] = { date };
      indexData[date][idx.field] = { close: Math.round(close * 100) / 100, changeRate };
    }
    await sleep(200);
  }

  const records = Object.values(indexData).sort((a, b) => a.date.localeCompare(b.date));
  console.log(`  整合 ${records.length} 个交易日`);
  if (!records.length) { console.log('  ⚠️  无数据'); return; }

  // 写本地 DB
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

  // 推送服务器
  try {
    const r = await axios.post(`${SERVER}/benchmarks/import`, { records }, { timeout: 30000 });
    console.log(`  ✅ 推送服务器: ${r.data.imported} 条指数数据\n`);
  } catch (e) {
    console.error(`  ❌ 推送失败: ${e.response?.data || e.message}\n`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await syncHoldings();
    await syncBenchmarks();
    console.log('🎉 同步完成');
  } catch (e) {
    console.error('同步失败:', e);
  } finally {
    db.close();
  }
})();
