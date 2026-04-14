// ── Holding (持仓) ──────────────────────────────────────────────────────────
export interface Holding {
  code: string             // 代码
  name: string             // 名称
  type: 'stock' | 'fund'  // 股票 / 基金ETF
  value: number            // 持有金额
  todayPnL: number         // 当日盈亏
  todayPnLRate: number     // 当日盈亏率 (decimal, e.g. 0.065 = 6.5%)
  holdingPnL: number       // 持有盈亏
  holdingPnLRate: number   // 持有盈亏率
  totalPnL: number         // 累计盈亏
  weeklyPnL: number        // 本周盈亏
  monthlyPnL: number       // 本月盈亏
  yearlyPnL: number        // 今年盈亏
  positionRatio: number    // 仓位占比 (decimal)
  quantity: number         // 持有数量
  holdingDays: number | null // 持仓天数
  latestChange: number     // 最新涨幅
  latestPrice: number      // 最新价
  costPerUnit: number      // 单位成本
  breakEvenChange: number | null  // 回本涨幅
  monthReturn: number | null      // 近1月涨幅
  threeMonthReturn: number | null // 近3月涨幅
  sixMonthReturn: number | null   // 近6月涨幅
  yearReturn: number | null       // 近1年涨幅
  updatedAt?: string
  priceTime?: string | null       // 行情/净值数据源时间 (YYYY-MM-DD HH:mm 或 YYYY-MM-DD)
  priceSource?: 'tencent' | 'eastmoney' | null
}

// ── Trade (交易记录) ─────────────────────────────────────────────────────────
export interface Trade {
  id: number
  tradeDate: string        // 成交日期 YYYY-MM-DD
  tradeTime: string | null // 成交时间 HH:mm:ss
  code: string             // 代码
  name: string             // 名称
  type: string             // 交易类别
  quantity: number         // 成交数量
  price: number | null     // 成交价格
  amount: number           // 发生金额 (negative=buy, positive=sell)
  dealAmount: number       // 成交金额 (absolute)
  fee: number              // 费用
  note: string | null      // 备注
  createdAt?: string
  updatedAt?: string
}

export type TradeFormData = Omit<Trade, 'id' | 'createdAt' | 'updatedAt'>

// ── Closed Position (已清仓) ──────────────────────────────────────────────────
export interface ClosedPosition {
  id: number
  closeDate: string        // 清仓日期
  code: string             // 代码
  name: string             // 名称
  totalPnL: number         // 总盈亏（整个持仓期）
  yearlyPnL?: number       // 今年盈亏（跨年持仓时仅含今年部分）
  pnLRate: number          // 盈亏比
  marketPnL: number        // 同期大盘
  outperform: number       // 跑赢大盘
  buyAvg: number           // 买入均价
  sellAvg: number          // 卖出均价
  daysAgo: number          // 清仓距今
  holdingDays: number      // 持仓天数
  tradeFee: number         // 交易费用
  buildDate: string        // 建仓日期
}

// ── Dashboard Summary ─────────────────────────────────────────────────────────
export interface DashboardSummary {
  totalValue: number            // 总资产（投资市值 + 现金）
  investValue: number           // 投资市值（不含现金）
  stockValue: number            // 股票(含场内ETF)市值
  fundValue: number             // 基金市值
  stockCash: number             // 股票账户现金余额
  fundCash: number              // 基金货币基金账户
  stockCount: number            // 股票持仓数
  fundCount: number             // 基金持仓数
  todayPnL: number              // 今日盈亏
  todayPnLRate: number          // 今日盈亏率
  holdingPnL: number            // 持有盈亏
  holdingPnLRate: number        // 持有盈亏率
  totalPnL: number              // 累计盈亏
  yearStartValue: number        // 年初资产
  yearPnL: number               // 今年盈亏（持仓+已清仓）
  yearHoldingPnL: number        // 今年持仓部分盈亏
  yearClosedPnL: number         // 今年已清仓部分盈亏
  yearReturnRate: number        // 今年收益率
  yearTargetRate: number        // 年度目标收益率 (e.g. 0.30)
  yearTargetPnL: number         // 年度目标盈利额
  yearGapRate: number           // 距目标差距 (rate)
  yearGapAmount: number         // 距目标差距 (amount)
  dayOfYear: number             // 今天是第几天
  totalDaysInYear: number       // 全年天数
  expectedReturnRate: number    // 按时间进度应达收益率
  updatedAt: string             // 最后更新时间
  // ── Stock / Fund breakdown ──────────────────────────────────────────────────
  stockTotalValue: number       // 股票总资产 = stockValue + stockCash
  fundTotalValue: number        // 基金总资产 = fundValue + fundCash
  stockTodayPnL: number
  fundTodayPnL: number
  stockTodayPnLRate: number
  fundTodayPnLRate: number
  stockHoldingPnL: number
  fundHoldingPnL: number
  stockTotalPnL: number
  fundTotalPnL: number
  stockYearPnL: number
  fundYearPnL: number
  stockYearPnLRate: number
  fundYearPnLRate: number
  stockPositionRatio: number    // 股票仓位 = stockValue/stockTotalValue
  fundPositionRatio: number     // 基金仓位 = fundValue/fundTotalValue
  totalPositionRatio: number    // 总仓位 = (stockValue+fundValue)/(stockTotal+fundTotal)
  stockRatioOfTotal: number     // 股票总资产占(股票+基金)总资产比例
  fundRatioOfTotal: number      // 基金总资产占比
}

// ── Pagination ────────────────────────────────────────────────────────────────
export interface Paginated<T> {
  total: number
  page: number
  pageSize: number
  items: T[]
}

// ── Trade filter params ───────────────────────────────────────────────────────
export interface TradeFilter {
  page?: number
  pageSize?: number
  code?: string
  type?: string
  startDate?: string
  endDate?: string
}

export interface ClosedPositionFilter {
  page?: number
  pageSize?: number
  code?: string
  startDate?: string
  endDate?: string
}

// ── Trade type options ────────────────────────────────────────────────────────
export const TRADE_TYPES = [
  '买入', '卖出', '申购', '赎回', '红利再投', '分红', '除权除息',
  '修改持仓', '股息', '债券利息', '转换', '其他',
] as const
