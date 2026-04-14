/**
 * AIM2026 Portfolio — Mock API Server  v1.1
 * 端口: 8080，Node.js 内置模块，无需额外依赖
 */
const http = require('http')
const fs   = require('fs')
const path = require('path')
const { URL } = require('url')

const SEED = path.join(__dirname, '../portfolio-dashboard/seed-data')

// ── 内存数据 ──────────────────────────────────────────────────────────────────
let holdings = JSON.parse(fs.readFileSync(path.join(SEED, 'holdings.json')))
let trades   = JSON.parse(fs.readFileSync(path.join(SEED, 'trades.json')))
let closed   = JSON.parse(fs.readFileSync(path.join(SEED, 'closed_positions.json')))
let settings = JSON.parse(fs.readFileSync(path.join(SEED, 'settings.json')))

// ── 工具 ──────────────────────────────────────────────────────────────────────
function normCode(c) {
  return String(c || '').replace(/\.0$/, '').padStart(6, '0')
}

// 用户指定的特殊类型覆盖（场内ETF按股票账户 → stock；部分基金代码 → fund）
const TYPE_OVERRIDES = {
  '159915': 'stock', '513000': 'stock', '518850': 'stock', '515880': 'stock',
  '000746': 'fund',  '001410': 'fund',
}
function detectType(code) {
  const c = String(code || '').padStart(6, '0')
  if (TYPE_OVERRIDES[c]) return TYPE_OVERRIDES[c]
  const ETF_PFX = ['159','510','511','512','513','515','516','517','518']
  const EXCHANGE = ['300','600','601','603','605','688','002','000','001','003']
  if (ETF_PFX.some(p => c.startsWith(p))) return 'fund'
  if (EXCHANGE.some(p => c.startsWith(p))) return 'stock'
  return 'fund'
}

/**
 * 自动计算今年盈亏（用于新增跨年清仓记录）
 *
 * 核心逻辑（FIFO 比例法）：
 *   - 今年卖出总量 - 今年买入总量 = 来自年初存量的已售份额（soldFromYearStart）
 *   - 年初成本 = soldFromYearStart × 年初单价（2025.12.31 收盘价/净值）
 *   - yearlyPnL = 今年卖出收入 - 今年买入成本 - 年初成本
 *
 * 对全仓清仓和部分清仓均适用；
 * 若未传 yearlyPnL 且无年初价格数据，则回退使用 totalPnL。
 *
 * @param {string} code       - 标的代码（6 位）
 * @param {string} buildDate  - 建仓日期（若在今年则 totalPnL 即年度盈亏）
 * @param {string} closeDate  - 清仓日期（只统计 yearStart ~ closeDate 的交易）
 * @returns {number|null}     - 计算结果，或 null（表示直接使用 totalPnL）
 */
function computeYearlyPnL(code, buildDate, closeDate) {
  const yearStr = (closeDate || '').substring(0, 4)
  if (!yearStr) return null

  // 今年建仓今年清仓 → totalPnL 即今年盈亏
  if ((buildDate || '').startsWith(yearStr)) return null

  const yearStartPrice = (settings.year_start_prices || {})[code]
  if (!yearStartPrice) return null   // 无年初价格数据，回退 totalPnL

  const yearStart = yearStr + '-01-01'
  let buyCost = 0, buyQty = 0, sellProceeds = 0, sellQty = 0

  trades.forEach(t => {
    const tCode = normCode(t.code)
    if (tCode !== code) return
    const d = t.tradeDate || ''
    if (d < yearStart || d > closeDate) return
    if (['买入', '申购', '分红再投'].includes(t.type)) {
      buyCost += (t.dealAmount || 0)
      buyQty  += (t.quantity   || 0)
    } else if (['卖出', '赎回'].includes(t.type)) {
      sellProceeds += (t.dealAmount || 0)
      sellQty      += (t.quantity   || 0)
    }
  })

  // FIFO：先消耗今年新买入份额，剩余视为来自年初存量
  const soldFromYearStart = Math.max(0, sellQty - buyQty)
  const yearStartCost     = yearStartPrice * soldFromYearStart

  return Math.round((sellProceeds - buyCost - yearStartCost) * 100) / 100
}

function dayOfYear(d = new Date()) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000)
}

function calcSummary() {
  const now = new Date()
  const yearStr        = String(now.getFullYear())
  const yearStartValue = parseFloat(settings.year_start_value) || 2440000
  const yearTargetRate = parseFloat(settings.year_target_rate) || 0.30
  const stockCash      = parseFloat(settings.stock_cash)       || 0
  const fundCash       = parseFloat(settings.fund_cash)        || 0

  const stocks = holdings.filter(h => h.type === 'stock')
  const funds  = holdings.filter(h => h.type === 'fund')

  const investValue = holdings.reduce((s, h) => s + (h.value || 0), 0)
  const stockValue  = stocks.reduce((s, h) => s + (h.value || 0), 0)
  const fundValue   = funds.reduce((s, h)  => s + (h.value || 0), 0)
  const totalValue  = investValue + stockCash + fundCash   // 含现金

  const todayPnL   = holdings.reduce((s, h) => s + (h.todayPnL  || 0), 0)
  const holdingPnL = holdings.reduce((s, h) => s + (h.holdingPnL|| 0), 0)
  const totalPnL   = holdings.reduce((s, h) => s + (h.totalPnL  || 0), 0)

  // 今年盈亏 = 持仓今年盈亏 + 今年已清仓盈亏
  const yearHoldingPnL = holdings.reduce((s, h) => s + (h.yearlyPnL || 0), 0)
  const yearClosedPnL  = closed
    .filter(c => (c.closeDate || '').startsWith(yearStr))
    .reduce((s, c) => s + (c.yearlyPnL !== undefined ? c.yearlyPnL : c.totalPnL), 0)
  const yearPnL = yearHoldingPnL + yearClosedPnL

  const cost           = investValue - holdingPnL
  const holdingPnLRate = cost > 0 ? holdingPnL / cost : 0
  const todayPnLRate   = (investValue - todayPnL) > 0 ? todayPnL / (investValue - todayPnL) : 0
  const yearReturnRate = yearStartValue > 0 ? yearPnL / yearStartValue : 0
  const yearTargetPnL  = yearStartValue * yearTargetRate

  const doy   = dayOfYear(now)
  const total = (now.getFullYear() % 4 === 0 && (now.getFullYear() % 100 !== 0 || now.getFullYear() % 400 === 0)) ? 366 : 365
  const expectedReturnRate = yearTargetRate * (doy / total)

  const stockTodayPnL = stocks.reduce((s, h) => s + (h.todayPnL || 0), 0)
  const fundTodayPnL  = funds.reduce((s, h) => s + (h.todayPnL || 0), 0)
  const stockTodayPnLRate = (stockValue - stockTodayPnL) > 0 ? stockTodayPnL / (stockValue - stockTodayPnL) : 0
  const fundTodayPnLRate  = (fundValue - fundTodayPnL) > 0 ? fundTodayPnL / (fundValue - fundTodayPnL) : 0

  const stockHoldingPnL = stocks.reduce((s, h) => s + (h.holdingPnL || 0), 0)
  const fundHoldingPnL  = funds.reduce((s, h) => s + (h.holdingPnL || 0), 0)
  const stockTotalPnL   = stocks.reduce((s, h) => s + (h.totalPnL || 0), 0)
  const fundTotalPnL    = funds.reduce((s, h) => s + (h.totalPnL || 0), 0)

  const stockYearPnL = stocks.reduce((s, h) => s + (h.yearlyPnL || 0), 0)
    + closed.filter(c => (c.closeDate||'').startsWith(yearStr) && detectType(c.code) === 'stock')
            .reduce((s, c) => s + (c.yearlyPnL !== undefined ? c.yearlyPnL : c.totalPnL), 0)
  const fundYearPnL = funds.reduce((s, h) => s + (h.yearlyPnL || 0), 0)
    + closed.filter(c => (c.closeDate||'').startsWith(yearStr) && detectType(c.code) === 'fund')
            .reduce((s, c) => s + (c.yearlyPnL !== undefined ? c.yearlyPnL : c.totalPnL), 0)

  const stockTotalValue = stockValue + stockCash
  const fundTotalValue  = fundValue + fundCash
  const stockPositionRatio = stockTotalValue > 0 ? stockValue / stockTotalValue : 0
  const fundPositionRatio  = fundTotalValue > 0 ? fundValue / fundTotalValue : 0
  const totalPositionRatio = (stockTotalValue + fundTotalValue) > 0 ? (stockValue + fundValue) / (stockTotalValue + fundTotalValue) : 0
  const stockRatioOfTotal  = (stockTotalValue + fundTotalValue) > 0 ? stockTotalValue / (stockTotalValue + fundTotalValue) : 0
  const fundRatioOfTotal   = (stockTotalValue + fundTotalValue) > 0 ? fundTotalValue / (stockTotalValue + fundTotalValue) : 0

  return {
    totalValue, investValue, stockValue, fundValue,
    stockCash, fundCash,
    stockCount: stocks.length,
    fundCount:  funds.length,
    yearHoldingPnL, yearClosedPnL,
    todayPnL, todayPnLRate,
    holdingPnL, holdingPnLRate,
    totalPnL,
    yearStartValue, yearPnL, yearReturnRate,
    yearTargetRate, yearTargetPnL,
    yearGapRate:         yearReturnRate - expectedReturnRate,
    yearGapAmount:       yearPnL - (yearStartValue * expectedReturnRate),
    dayOfYear:           doy,
    totalDaysInYear:     total,
    expectedReturnRate,
    stockTodayPnL, fundTodayPnL, stockTodayPnLRate, fundTodayPnLRate,
    stockHoldingPnL, fundHoldingPnL,
    stockTotalPnL, fundTotalPnL,
    stockYearPnL, fundYearPnL,
    stockTotalValue, fundTotalValue,
    stockPositionRatio, fundPositionRatio, totalPositionRatio,
    stockRatioOfTotal, fundRatioOfTotal,
    updatedAt: now.toISOString(),
  }
}

function paginate(arr, page, pageSize) {
  const p  = parseInt(page)    || 1
  const ps = parseInt(pageSize)|| 20
  return { total: arr.length, page: p, pageSize: ps, items: arr.slice((p-1)*ps, p*ps) }
}

function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
  })
  res.end(JSON.stringify(data))
}

function readBody(req) {
  return new Promise(resolve => {
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')) } catch { resolve({}) } })
  })
}

function readRawBody(req) {
  return new Promise(resolve => {
    const chunks = []
    req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8')
      // 去除 BOM（Excel UTF-8 CSV 常带 \ufeff）
      resolve(raw.startsWith('\ufeff') ? raw.slice(1) : raw)
    })
  })
}

// 逐字符解析 CSV 行，支持双引号转义
function parseCSVLine(line) {
  const result = []
  let field = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (c === ',' && !inQuotes) {
      result.push(field.trim()); field = ''
    } else {
      field += c
    }
  }
  result.push(field.trim())
  return result
}

// CSV 字段转义
function csvField(v) {
  const s = String(v == null ? '' : v)
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * 从全量交易记录重算持仓的 quantity / costPerUnit / value / holdingPnL / positionRatio
 * 使用移动加权平均成本法（AVCO）
 * 只更新 holdings 中已有代码且计算后 qty > 0 的记录
 */
function recalcHoldings() {
  const BUY_TYPES  = ['买入', '申购', '分红再投', '红利再投']
  const SELL_TYPES = ['卖出', '赎回']

  // 按日期时间升序处理
  const sorted = [...trades].sort((a, b) =>
    ((a.tradeDate || '') + (a.tradeTime || '')).localeCompare((b.tradeDate || '') + (b.tradeTime || ''))
  )

  // code → { qty, totalCost }（totalCost = 当前持仓的总成本基础）
  const stats = {}
  sorted.forEach(t => {
    const code = normCode(t.code)
    if (!stats[code]) stats[code] = { qty: 0, totalCost: 0 }
    const s = stats[code]
    const qty = t.quantity || 0
    const cost = t.dealAmount || 0

    if (BUY_TYPES.includes(t.type)) {
      s.qty       += qty
      s.totalCost += cost
    } else if (SELL_TYPES.includes(t.type)) {
      const avgCost = s.qty > 0 ? s.totalCost / s.qty : 0
      s.qty       -= qty
      s.totalCost -= qty * avgCost
      if (s.qty       < 0) s.qty       = 0
      if (s.totalCost < 0) s.totalCost = 0
    }
  })

  holdings.forEach((h, idx) => {
    const code = normCode(h.code)
    const s    = stats[code]
    if (!s || s.qty < 0.001) return      // 未找到 or 已清仓，跳过

    const newQty      = Math.round(s.qty * 1000) / 1000
    const newCost     = Math.round((s.totalCost / s.qty) * 1000) / 1000
    const newValue    = Math.round(newQty * (h.latestPrice || 0) * 100) / 100
    const newHoldPnL  = Math.round((newValue - s.totalCost) * 100) / 100
    const newHoldRate = s.totalCost > 0
      ? Math.round((newHoldPnL / s.totalCost) * 100000) / 100000
      : 0

    holdings[idx] = {
      ...holdings[idx],
      quantity:       newQty,
      costPerUnit:    newCost,
      value:          newValue,
      holdingPnL:     newHoldPnL,
      holdingPnLRate: newHoldRate,
    }
  })

  // 重算仓位占比
  const totalInvest = holdings.reduce((s, h) => s + (h.value || 0), 0)
  if (totalInvest > 0) {
    holdings.forEach((h, idx) => {
      holdings[idx].positionRatio = Math.round((h.value / totalInvest) * 100000) / 100000
    })
  }
}

// ── 行情实时刷新 ──────────────────────────────────────────────────────────────
// 股票/ETF：腾讯财经 http://qt.gtimg.cn/q=sh600118,sz300308
// 场外基金：天天基金 https://fundgz.1234567.com.cn/js/{code}.js
function tencentSymbol(code) {
  const c = normCode(code)
  const f = c[0]
  if (f === '6' || f === '5' || f === '9') return 'sh' + c
  if (f === '0' || f === '3' || f === '1' || f === '2') return 'sz' + c
  if (f === '4' || f === '8') return 'bj' + c
  return null
}

// 腾讯返回时间格式：YYYYMMDDHHMMSS → "YYYY-MM-DD HH:mm:ss"
function parseTencentTime(s) {
  if (!s || s.length < 14) return null
  return (
    s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) +
    ' ' + s.slice(8, 10) + ':' + s.slice(10, 12) + ':' + s.slice(12, 14)
  )
}

async function fetchStockPriceMap(codes) {
  const map = {}
  if (!codes.length) return map
  const symbols = codes.map(tencentSymbol).filter(Boolean)
  if (!symbols.length) return map
  const url = 'http://qt.gtimg.cn/q=' + symbols.join(',')
  const resp = await fetch(url, {
    headers: {
      'Referer':    'https://finance.qq.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  })
  if (!resp.ok) throw new Error('tencent ' + resp.status)
  const buf  = Buffer.from(await resp.arrayBuffer())
  // 腾讯返回 GBK 编码，但我们只取数字字段，latin1 解码足够
  const text = buf.toString('latin1')
  const lines = text.split(/;\s*/).filter(Boolean)
  for (const line of lines) {
    const m = line.match(/v_([a-z]{2})(\d{6})="([^"]*)"/)
    if (!m) continue
    const code  = m[2]
    const parts = m[3].split('~')
    if (parts.length < 5) continue
    const price = parseFloat(parts[3])
    if (!isFinite(price) || price <= 0) continue
    // 第 30 位通常是成交日期时间（YYYYMMDDHHMMSS）
    const priceTime = parseTencentTime(parts[30] || '')
    map[code] = { price, priceTime }
  }
  return map
}

async function fetchFundNAV(code) {
  const url = `https://fundgz.1234567.com.cn/js/${code}.js`
  const resp = await fetch(url, {
    headers: {
      'Referer':    'http://fund.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  })
  if (!resp.ok) return null
  const text = await resp.text()
  const m = text.match(/jsonpgz\(([^)]*)\)/)
  if (!m || !m[1] || !m[1].trim()) return null
  try {
    const data = JSON.parse(m[1])
    const gsz  = parseFloat(data.gsz)
    const dwjz = parseFloat(data.dwjz)
    // 优先用实时估值，否则用最新公布净值
    let price, priceTime
    if (isFinite(gsz) && gsz > 0) {
      price = gsz
      priceTime = data.gztime || null       // "YYYY-MM-DD HH:mm"
    } else if (isFinite(dwjz) && dwjz > 0) {
      price = dwjz
      priceTime = data.jzrq || null         // "YYYY-MM-DD"
    } else {
      return null
    }
    return { price, priceTime }
  } catch {
    return null
  }
}

async function refreshAllPrices() {
  const updated   = []
  const unchanged = []
  const failed    = []

  // 1. 股票/ETF — 腾讯批量接口
  const stocks = holdings.filter(h => h.type === 'stock')
  let stockMap = {}
  try {
    stockMap = await fetchStockPriceMap(stocks.map(h => normCode(h.code)))
  } catch (e) {
    console.error('[refresh] tencent failed:', e.message)
  }

  // 2. 基金 — 天天基金并发
  const funds = holdings.filter(h => h.type === 'fund')
  const fundMap = {}
  await Promise.all(
    funds.map(async h => {
      const code = normCode(h.code)
      try {
        const r = await fetchFundNAV(code)
        if (r != null) fundMap[code] = r
      } catch (e) {
        console.error('[refresh] fund failed', code, e.message)
      }
    }),
  )

  // 3. 逐条应用更新
  const now = new Date().toISOString()
  for (let i = 0; i < holdings.length; i++) {
    const h    = holdings[i]
    const code = normCode(h.code)
    const map  = h.type === 'stock' ? stockMap : fundMap
    const hit  = map[code]

    if (!hit) {
      failed.push({ code, name: h.name, type: h.type })
      continue
    }
    const price     = hit.price
    const priceTime = hit.priceTime || null
    const source    = h.type === 'stock' ? 'tencent' : 'eastmoney'

    // 原"最新价"：股票直接用 latestPrice；基金可能为 null，按 value/quantity 反推
    const oldPrice =
      h.latestPrice && h.latestPrice > 0
        ? h.latestPrice
        : h.quantity > 0
          ? h.value / h.quantity
          : 0

    if (Math.abs(oldPrice - price) < 0.0001) {
      // 价格无变化仍更新 priceTime/priceSource
      holdings[i] = { ...h, priceTime, priceSource: source, updatedAt: now }
      unchanged.push({ code, name: h.name, type: h.type, price, priceTime })
      continue
    }

    const qty         = h.quantity || 0
    const cost        = (h.costPerUnit || 0) * qty
    const newValue    = Math.round(price * qty * 100) / 100
    const newHoldPnL  = Math.round((newValue - cost) * 100) / 100
    const newHoldRate = cost > 0 ? Math.round((newHoldPnL / cost) * 100000) / 100000 : 0
    const todayPnL    = oldPrice > 0 ? Math.round((price - oldPrice) * qty * 100) / 100 : 0
    const todayRate   = oldPrice > 0 ? Math.round(((price - oldPrice) / oldPrice) * 100000) / 100000 : 0

    holdings[i] = {
      ...h,
      latestPrice:    price,
      value:          newValue,
      holdingPnL:     newHoldPnL,
      holdingPnLRate: newHoldRate,
      todayPnL,
      todayPnLRate:   todayRate,
      latestChange:   todayRate,
      priceTime,
      priceSource:    source,
      updatedAt:      now,
    }
    updated.push({
      code,
      name:       h.name,
      type:       h.type,
      oldPrice:   Math.round(oldPrice * 10000) / 10000,
      newPrice:   price,
      changeRate: todayRate,
      priceTime,
    })
  }

  // 4. 重算仓位占比
  const totalInvest = holdings.reduce((s, hh) => s + (hh.value || 0), 0)
  if (totalInvest > 0) {
    holdings.forEach((hh, i) => {
      holdings[i].positionRatio = Math.round((hh.value / totalInvest) * 100000) / 100000
    })
  }

  return { updated, unchanged, failed, fetchedAt: now }
}

// ── 路由 ──────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { json(res, {}); return }

  const base   = `http://${req.headers.host}`
  const u      = new URL(req.url, base)
  const p      = u.pathname
  const q      = Object.fromEntries(u.searchParams)
  const method = req.method

  // Dashboard
  if (method === 'GET' && p === '/api/dashboard/summary')
    return json(res, calcSummary())

  // Holdings
  if (method === 'GET' && p === '/api/holdings')
    return json(res, holdings)

  if (method === 'PUT' && /^\/api\/holdings\/[^/]+\/price$/.test(p)) {
    const code = p.split('/')[3]
    const body = await readBody(req)
    const idx  = holdings.findIndex(h => h.code === code)
    if (idx === -1) return json(res, { error: 'not found' }, 404)
    holdings[idx] = { ...holdings[idx], latestPrice: body.price, updatedAt: new Date().toISOString() }
    return json(res, holdings[idx])
  }

  if (method === 'PUT' && /^\/api\/holdings\/[^/]+\/type$/.test(p)) {
    const code = p.split('/')[3]
    const body = await readBody(req)
    if (!['stock', 'fund'].includes(body.type)) return json(res, { error: 'invalid type' }, 400)
    const idx = holdings.findIndex(h => h.code === code)
    if (idx === -1) return json(res, { error: 'not found' }, 404)
    holdings[idx] = { ...holdings[idx], type: body.type, updatedAt: new Date().toISOString() }
    return json(res, holdings[idx])
  }

  if (method === 'POST' && p === '/api/holdings/refresh') {
    const result = await refreshAllPrices()
    return json(res, result)
  }

  // Trades — CSV 导出
  if (method === 'GET' && p === '/api/trades/export') {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const COLS = ['日期', '时间', '代码', '名称', '类型', '数量', '价格', '成交金额', '发生金额', '费用', '备注']
    const rows = [...trades]
      .sort((a, b) => ((b.tradeDate || '') + (b.tradeTime || '')).localeCompare((a.tradeDate || '') + (a.tradeTime || '')))
      .map(t => [
        t.tradeDate || '', t.tradeTime || '', normCode(t.code), t.name || '', t.type || '',
        t.quantity != null ? t.quantity : '', t.price != null ? t.price : '',
        t.dealAmount != null ? t.dealAmount : '', t.amount != null ? t.amount : '',
        t.fee != null ? t.fee : '', t.note || '',
      ].map(csvField).join(','))
    const csv = '\ufeff' + [COLS.join(','), ...rows].join('\r\n')
    res.writeHead(200, {
      'Content-Type':                  'text/csv; charset=utf-8',
      'Content-Disposition':           `attachment; filename="trades_${today}.csv"`,
      'Access-Control-Allow-Origin':   '*',
      'Access-Control-Allow-Methods':  'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers':  'Content-Type',
      'Access-Control-Expose-Headers': 'Content-Disposition',
    })
    return res.end(csv)
  }

  // Trades — CSV 导入（body: raw text/csv）
  if (method === 'POST' && p === '/api/trades/import') {
    const raw   = await readRawBody(req)
    const lines = raw.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return json(res, { error: '文件为空或缺少数据行' }, 400)

    // 解析表头，判断列索引（兼容不同顺序）
    const header = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''))
    const col = name => header.indexOf(name)
    const iC  = col('日期'), iT = col('时间'), iCode = col('代码'), iName = col('名称')
    const iTp = col('类型'), iQ = col('数量'), iPr = col('价格')
    const iDA = col('成交金额'), iAmt = col('发生金额'), iFee = col('费用'), iNote = col('备注')

    if (iC === -1 || iCode === -1 || iName === -1 || iTp === -1) {
      return json(res, { error: '表头格式不符，必须包含：日期,代码,名称,类型' }, 400)
    }

    let imported = 0, skipped = 0
    let nextId = Math.max(0, ...trades.map(t => t.id)) + 1

    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i])
      const get = idx => (idx >= 0 && idx < row.length ? row[idx] : '')
      const tradeDate = get(iC)
      const code      = normCode(get(iCode))
      const name      = get(iName)
      const type      = get(iTp)
      if (!tradeDate || !code || !name || !type) { skipped++; continue }

      trades.push({
        id:         nextId++,
        tradeDate,
        tradeTime:  get(iT) || null,
        code,
        name,
        type,
        quantity:   parseFloat(get(iQ))  || 0,
        price:      get(iPr) !== '' ? parseFloat(get(iPr)) : null,
        dealAmount: parseFloat(get(iDA)) || 0,
        amount:     parseFloat(get(iAmt))|| 0,
        fee:        parseFloat(get(iFee))|| 0,
        note:       get(iNote) || null,
        createdAt:  new Date().toISOString(),
        updatedAt:  new Date().toISOString(),
      })
      imported++
    }

    recalcHoldings()
    return json(res, { imported, skipped })
  }

  // Trades
  if (method === 'GET' && p === '/api/trades') {
    let list = [...trades].sort((a, b) => {
      const da = (a.tradeDate||'') + (a.tradeTime||'')
      const db = (b.tradeDate||'') + (b.tradeTime||'')
      return db.localeCompare(da)
    })
    if (q.code)      list = list.filter(t => t.code.includes(q.code) || t.name.includes(q.code))
    if (q.type)      list = list.filter(t => t.type === q.type)
    if (q.startDate) list = list.filter(t => t.tradeDate >= q.startDate)
    if (q.endDate)   list = list.filter(t => t.tradeDate <= q.endDate)
    return json(res, paginate(list, q.page, q.pageSize))
  }

  if (method === 'POST' && p === '/api/trades') {
    const body  = await readBody(req)
    const newId = Math.max(0, ...trades.map(t => t.id)) + 1
    const t = { id: newId, ...body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    trades.push(t)
    recalcHoldings()
    return json(res, t, 201)
  }

  if (method === 'PUT' && /^\/api\/trades\/\d+$/.test(p)) {
    const id   = parseInt(p.split('/').pop())
    const body = await readBody(req)
    const idx  = trades.findIndex(t => t.id === id)
    if (idx === -1) return json(res, { error: 'not found' }, 404)
    trades[idx] = { ...trades[idx], ...body, updatedAt: new Date().toISOString() }
    recalcHoldings()
    return json(res, trades[idx])
  }

  if (method === 'DELETE' && /^\/api\/trades\/\d+$/.test(p)) {
    const id  = parseInt(p.split('/').pop())
    const idx = trades.findIndex(t => t.id === id)
    if (idx === -1) return json(res, { error: 'not found' }, 404)
    trades.splice(idx, 1)
    recalcHoldings()
    return json(res, { success: true })
  }

  // Closed Positions
  if (method === 'GET' && p === '/api/closed-positions') {
    let list = [...closed].sort((a, b) => (b.closeDate||'').localeCompare(a.closeDate||''))
    if (q.code)      list = list.filter(c => c.code.includes(q.code) || c.name.includes(q.code))
    if (q.startDate) list = list.filter(c => c.closeDate >= q.startDate)
    if (q.endDate)   list = list.filter(c => c.closeDate <= q.endDate)
    return json(res, paginate(list, q.page, q.pageSize))
  }

  if (method === 'POST' && p === '/api/closed-positions') {
    const body  = await readBody(req)
    const newId = Math.max(0, ...closed.map(c => c.id || 0)) + 1

    // 自动计算今年盈亏：显式传入 > 自动计算 > 回退 totalPnL
    let yearlyPnL = body.yearlyPnL
    if (yearlyPnL === undefined) {
      const computed = computeYearlyPnL(body.code, body.buildDate, body.closeDate)
      yearlyPnL = computed !== null ? computed : body.totalPnL
    }

    const c = { id: newId, ...body, yearlyPnL, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    closed.push(c)
    return json(res, c, 201)
  }

  if (method === 'PUT' && /^\/api\/closed-positions\/\d+$/.test(p)) {
    const id   = parseInt(p.split('/').pop())
    const body = await readBody(req)
    const idx  = closed.findIndex(c => c.id === id)
    if (idx === -1) return json(res, { error: 'not found' }, 404)
    closed[idx] = { ...closed[idx], ...body, updatedAt: new Date().toISOString() }
    return json(res, closed[idx])
  }

  if (method === 'DELETE' && /^\/api\/closed-positions\/\d+$/.test(p)) {
    const id  = parseInt(p.split('/').pop())
    const idx = closed.findIndex(c => c.id === id)
    if (idx === -1) return json(res, { error: 'not found' }, 404)
    closed.splice(idx, 1)
    return json(res, { success: true })
  }

  // Settings
  if (method === 'GET' && p === '/api/settings')
    return json(res, settings)

  if (method === 'PUT' && p === '/api/settings') {
    const body = await readBody(req)
    settings   = { ...settings, ...body }
    return json(res, settings)
  }

  json(res, { error: 'not found', path: p }, 404)
})

server.listen(8080, () => {
  const s = calcSummary()
  console.log('✅  Mock API Server  →  http://localhost:8080')
  console.log(`    持仓市值  ¥${s.investValue.toLocaleString('zh-CN',{maximumFractionDigits:0})}`)
  console.log(`    总资产    ¥${s.totalValue.toLocaleString('zh-CN',{maximumFractionDigits:0})}  (含现金 ¥${(s.stockCash+s.fundCash).toLocaleString()})`)
  console.log(`    股票${s.stockCount}只  基金${s.fundCount}只  交易${trades.length}条  清仓${closed.length}条`)
})
