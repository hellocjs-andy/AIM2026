import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react'
import { holdingsApi, closedApi } from '../api/client'
import { Holding, ClosedPosition } from '../types'
import { fmtPnL, fmtPct, fmtCNY, pnlColor, clsx } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import dayjs from 'dayjs'

// ── 类型配置 ──────────────────────────────────────────────────────────────────
type PnLType = 'today' | 'holding' | 'yearly' | 'total'

const TYPE_CONFIG: Record<PnLType, {
  label: string
  desc: string
  field: keyof Holding
  rateField: keyof Holding | null
}> = {
  today: {
    label: '今日盈亏',
    desc: '各持仓今日涨跌明细',
    field: 'todayPnL',
    rateField: 'todayPnLRate',
  },
  holding: {
    label: '持有盈亏',
    desc: '从建仓至今的浮动盈亏',
    field: 'holdingPnL',
    rateField: 'holdingPnLRate',
  },
  yearly: {
    label: '今年盈亏',
    desc: '2026年以来各标的收益',
    field: 'yearlyPnL',
    rateField: null,
  },
  total: {
    label: '累计盈亏',
    desc: '成立以来全周期累计盈亏',
    field: 'totalPnL',
    rateField: null,
  },
}

// ── Bar Row ───────────────────────────────────────────────────────────────────
function BarRow({
  rank,
  holding,
  pnl,
  rate,
  maxAbs,
  sectionTotal, // 所在分区（盈/亏）的总金额绝对值
}: {
  rank: number
  holding: Holding
  pnl: number
  rate: number | null
  maxAbs: number
  sectionTotal: number // 用于计算占本分区的比例
}) {
  const barPct   = maxAbs > 0 ? (Math.abs(pnl) / maxAbs) * 100 : 0
  // 占所在分区的比例：各分区内加起来 = 100%
  const sharePct = sectionTotal !== 0 ? (Math.abs(pnl) / sectionTotal) * 100 : 0

  return (
    <div className="group flex items-center gap-3 px-4 py-3 hover:bg-surface-3/40 transition-colors">
      {/* Rank */}
      <span className="w-5 text-xs text-gray-600 text-right flex-shrink-0">{rank}</span>

      {/* Name + code + type badge */}
      <div className="w-32 sm:w-40 flex-shrink-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-sm font-medium text-gray-200 truncate">{holding.name}</p>
          <Badge variant={holding.type === 'stock' ? 'blue' : 'amber'} className="flex-shrink-0 text-[10px] px-1 py-0">
            {holding.type === 'stock' ? '股' : '基'}
          </Badge>
        </div>
        <p className="text-xs font-mono text-gray-500">{holding.code}</p>
      </div>

      {/* Bar */}
      <div className="flex-1 relative h-6 flex items-center">
        <div className="w-full h-2 bg-surface-3 rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-500',
              pnl >= 0 ? 'bg-profit/70' : 'bg-loss/70',
            )}
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>

      {/* Amount + rate */}
      <div className="w-24 sm:w-28 text-right flex-shrink-0">
        <p className={clsx('text-sm font-mono font-semibold', pnlColor(pnl))}>
          {fmtPnL(pnl, 0)}
        </p>
        {rate != null && (
          <p className={clsx('text-xs font-mono', pnlColor(rate))}>
            {fmtPct(rate)}
          </p>
        )}
      </div>

      {/* 占本分区比例 — hidden on mobile */}
      <div className="hidden sm:block w-14 text-right flex-shrink-0">
        <p className="text-xs font-mono text-gray-500">
          {sharePct.toFixed(1)}%
        </p>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PnLDetailPage() {
  const { type } = useParams<{ type: string }>()
  const cfg = TYPE_CONFIG[type as PnLType] ?? TYPE_CONFIG.today

  const isYearly = type === 'yearly'
  const currentYear = dayjs().year()

  const { data: holdings = [], isLoading } = useQuery({
    queryKey: ['holdings'],
    queryFn: holdingsApi.getAll,
  })

  // 今年盈亏额外加载已清仓数据
  const { data: closedPage } = useQuery({
    queryKey: ['closed-yearly', currentYear],
    queryFn: () => closedApi.getList({
      startDate: `${currentYear}-01-01`,
      endDate:   `${currentYear}-12-31`,
      pageSize:  500,
    }),
    enabled: isYearly,
  })
  const closedRows: ClosedPosition[] = closedPage?.items ?? []

  const rows = holdings
    .map(h => ({
      holding: h,
      pnl:  (h[cfg.field]  as number) ?? 0,
      rate: cfg.rateField ? ((h[cfg.rateField] as number) ?? null) : null,
    }))
    .filter(r => r.pnl !== 0)
    .sort((a, b) => b.pnl - a.pnl)

  const holdingTotal = rows.reduce((s, r) => s + r.pnl, 0)
  const closedPnL    = (c: ClosedPosition) => c.yearlyPnL !== undefined ? c.yearlyPnL : c.totalPnL
  const closedTotal  = isYearly ? closedRows.reduce((s, c) => s + closedPnL(c), 0) : 0
  const total        = holdingTotal + closedTotal
  const maxAbs       = Math.max(...rows.map(r => Math.abs(r.pnl)), 1)
  const profit       = rows.filter(r => r.pnl > 0)
  const loss         = rows.filter(r => r.pnl < 0)
  const grossProfit  = profit.reduce((s, r) => s + r.pnl, 0)
  const grossLoss    = Math.abs(loss.reduce((s, r) => s + r.pnl, 0))

  // 分股票/基金小计
  const stockProfit = profit.filter(r => r.holding.type === 'stock').reduce((s, r) => s + r.pnl, 0)
  const fundProfit  = profit.filter(r => r.holding.type === 'fund').reduce((s, r) => s + r.pnl, 0)
  const stockLoss   = loss.filter(r => r.holding.type === 'stock').reduce((s, r) => s + r.pnl, 0)
  const fundLoss    = loss.filter(r => r.holding.type === 'fund').reduce((s, r) => s + r.pnl, 0)

  // 已清仓分盈亏
  const closedProfit = closedRows.filter(c => closedPnL(c) > 0)
  const closedLoss   = closedRows.filter(c => closedPnL(c) < 0)

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 sm:px-6 py-4 border-b border-border bg-surface-2/50 backdrop-blur-sm sticky top-0 z-10">
        <Link
          to="/"
          className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 transition-colors text-sm"
        >
          <ArrowLeft size={15} />
          概览
        </Link>
        <span className="text-gray-600">/</span>
        <h1 className="text-lg font-bold text-gray-100">{cfg.label}明细</h1>
        <p className="text-xs text-gray-500 hidden sm:block">{cfg.desc}</p>
      </div>

      <div className="px-4 sm:px-6 py-5 space-y-5">
        {/* Summary banner */}
        <div className="bg-gradient-to-r from-accent/10 via-surface-2 to-surface-2 border border-accent/20 rounded-xl px-6 py-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{cfg.label}合计</p>
          <div className="flex items-end gap-6 flex-wrap">
            <span className={clsx('text-3xl sm:text-4xl font-bold font-mono', pnlColor(total))}>
              {fmtPnL(total, 0)}
            </span>
            <div className="flex flex-col gap-1 pb-1 text-sm">
              <div className="flex gap-5">
                <span className="text-profit flex items-center gap-1">
                  <TrendingUp size={14} />
                  盈利 {profit.length} 只  {fmtCNY(grossProfit, 0)}
                </span>
                <span className="text-loss flex items-center gap-1">
                  <TrendingDown size={14} />
                  亏损 {loss.length} 只  {fmtCNY(-grossLoss, 0)}
                </span>
              </div>
              {isYearly && closedRows.length > 0 && (
                <div className="text-xs text-gray-400">
                  含今年已清仓 {closedRows.length} 笔：
                  <span className={clsx('font-mono ml-1', pnlColor(closedTotal))}>
                    {fmtPnL(closedTotal, 0)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="text-center text-gray-500 py-12">加载中…</div>
        ) : (
          <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
            {/* Column headers */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface-3">
              <span className="w-5" />
              <span className="w-32 sm:w-40 text-xs text-gray-500 uppercase">标的</span>
              <span className="flex-1 text-xs text-gray-500 uppercase">贡献度</span>
              <span className="w-24 sm:w-28 text-right text-xs text-gray-500 uppercase">金额 / 收益率</span>
              <span className="hidden sm:block w-14 text-right text-xs text-gray-500 uppercase" title="占所在盈/亏分区的比例">区内占比</span>
            </div>

            {/* Profit rows */}
            {profit.length > 0 && (
              <div>
                {/* 盈利区 header + 股票/基金小计 */}
                <div className="px-4 pt-3 pb-2 flex items-center gap-4">
                  <span className="text-xs font-semibold text-profit/80 uppercase tracking-wide">
                    盈利 {profit.length} 只  {fmtPnL(grossProfit, 0)}
                  </span>
                  <span className="text-xs text-gray-500">
                    股票 <span className={clsx('font-mono', pnlColor(stockProfit))}>{fmtPnL(stockProfit, 0)}</span>
                  </span>
                  <span className="text-xs text-gray-500">
                    基金 <span className={clsx('font-mono', pnlColor(fundProfit))}>{fmtPnL(fundProfit, 0)}</span>
                  </span>
                </div>
                {profit.map((r, i) => (
                  <BarRow
                    key={r.holding.code}
                    rank={i + 1}
                    holding={r.holding}
                    pnl={r.pnl}
                    rate={r.rate}
                    maxAbs={maxAbs}
                    sectionTotal={grossProfit}
                  />
                ))}
              </div>
            )}

            {/* Loss rows */}
            {loss.length > 0 && (
              <div className={profit.length > 0 ? 'border-t border-border' : ''}>
                {/* 亏损区 header + 股票/基金小计 */}
                <div className="px-4 pt-3 pb-2 flex items-center gap-4">
                  <span className="text-xs font-semibold text-loss/80 uppercase tracking-wide">
                    亏损 {loss.length} 只  {fmtPnL(loss.reduce((s, r) => s + r.pnl, 0), 0)}
                  </span>
                  <span className="text-xs text-gray-500">
                    股票 <span className={clsx('font-mono', pnlColor(stockLoss))}>{fmtPnL(stockLoss, 0)}</span>
                  </span>
                  <span className="text-xs text-gray-500">
                    基金 <span className={clsx('font-mono', pnlColor(fundLoss))}>{fmtPnL(fundLoss, 0)}</span>
                  </span>
                </div>
                {[...loss].reverse().map((r, i) => (
                  <BarRow
                    key={r.holding.code}
                    rank={i + 1}
                    holding={r.holding}
                    pnl={r.pnl}
                    rate={r.rate}
                    maxAbs={maxAbs}
                    sectionTotal={grossLoss}
                  />
                ))}
              </div>
            )}

            {rows.length === 0 && (
              <p className="text-center text-gray-500 py-12">暂无数据</p>
            )}

            {/* 今年已清仓区块（仅 yearly 显示）*/}
            {isYearly && closedRows.length > 0 && (
              <div className="border-t border-border">
                <div className="px-4 pt-3 pb-2 flex items-center gap-4">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    今年已清仓 {closedRows.length} 笔
                  </span>
                  <span className={clsx('text-xs font-mono', pnlColor(closedTotal))}>
                    合计 {fmtPnL(closedTotal, 0)}
                  </span>
                  {closedProfit.length > 0 && (
                    <span className="text-xs text-gray-500">
                      盈 <span className="text-profit font-mono">{fmtPnL(closedProfit.reduce((s,c)=>s+closedPnL(c),0),0)}</span>
                    </span>
                  )}
                  {closedLoss.length > 0 && (
                    <span className="text-xs text-gray-500">
                      亏 <span className="text-loss font-mono">{fmtPnL(closedLoss.reduce((s,c)=>s+closedPnL(c),0),0)}</span>
                    </span>
                  )}
                </div>
                {[...closedRows].sort((a,b)=>closedPnL(b)-closedPnL(a)).map((c, i) => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-3/40 transition-colors">
                    <span className="w-5 text-xs text-gray-600 text-right flex-shrink-0">{i+1}</span>
                    <div className="w-32 sm:w-40 flex-shrink-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-sm font-medium text-gray-300 truncate">{c.name}</p>
                        <span className="text-[10px] px-1 py-0 rounded bg-gray-700 text-gray-400 flex-shrink-0">已清</span>
                      </div>
                      <p className="text-xs font-mono text-gray-500">{c.code}  {c.closeDate}</p>
                    </div>
                    <div className="flex-1" />
                    <div className="w-24 sm:w-28 text-right flex-shrink-0">
                      <p className={clsx('text-sm font-mono font-semibold', pnlColor(closedPnL(c)))}>
                        {fmtPnL(closedPnL(c), 0)}
                      </p>
                      <p className="text-xs font-mono text-gray-500">
                        总{fmtPnL(c.totalPnL, 0)}
                      </p>
                    </div>
                    <div className="hidden sm:block w-14 text-right flex-shrink-0">
                      <p className="text-xs font-mono text-gray-500">
                        {closedTotal !== 0 ? `${((closedPnL(c) / Math.abs(closedTotal)) * 100).toFixed(1)}%` : '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
