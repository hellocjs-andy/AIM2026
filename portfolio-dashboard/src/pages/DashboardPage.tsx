import { useQuery } from '@tanstack/react-query'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Calendar,
  Target,
  ChevronRight,
  AlertCircle,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { dashboardApi, holdingsApi, type RefreshPricesResult } from '../api/client'
import { fmtCNY, fmtCNYCompact, fmtPnL, fmtPct, pnlColor, clsx } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Num } from '../components/ui/Num'
import { RefreshToast } from '../components/RefreshToast'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import dayjs from 'dayjs'

// ── PnL Card ──────────────────────────────────────────────────────────────────
interface BreakdownItem {
  label: string
  amount: number
  rate?: number
}

function PnLCard({
  title,
  value,
  rate,
  breakdown,
  icon: Icon,
  iconColor,
  to,
}: {
  title: string
  value: string
  rate: string | null
  breakdown?: BreakdownItem[] | null
  icon: React.ElementType
  iconColor: string
  to?: string
}) {
  const inner = (
    <div className="space-y-2">
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-100 font-mono"><Num>{value}</Num></p>
          {rate != null && <p className={clsx('text-sm font-medium', 'text-gray-400')}>{rate}</p>}
        </div>
        <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', iconColor)}>
          <Icon size={20} className="opacity-90" />
        </div>
      </div>
      {breakdown && breakdown.length > 0 && (
        <div className="flex gap-3 pt-1.5 border-t border-white/8">
          {breakdown.map(b => (
            <div key={b.label} className="flex-1">
              <p className="text-[10px] text-gray-600">{b.label}</p>
              <p className={clsx('text-xs font-mono font-semibold', pnlColor(b.amount))}>
                <Num>{fmtPnL(b.amount, 0)}</Num>
              </p>
              {b.rate != null && (
                <p className={clsx('text-[10px] font-mono', pnlColor(b.rate))}>
                  {fmtPct(b.rate)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
  if (to) {
    return (
      <Link to={to} className="block bg-surface-2 border border-border rounded-xl p-5 hover:border-accent/50 hover:bg-surface-3/60 transition-colors cursor-pointer">
        {inner}
      </Link>
    )
  }
  return <div className="bg-surface-2 border border-border rounded-xl p-5">{inner}</div>
}

// ── Year Target Progress ──────────────────────────────────────────────────────
function YearTargetCard({
  yearReturnRate,
  yearTargetRate,
  yearGapRate,
  yearGapAmount,
  yearPnL,
  yearTargetPnL,
  dayOfYear,
  totalDaysInYear,
  expectedReturnRate,
}: {
  yearReturnRate: number
  yearTargetRate: number
  yearGapRate: number
  yearGapAmount: number
  yearPnL: number
  yearTargetPnL: number
  dayOfYear: number
  totalDaysInYear: number
  expectedReturnRate: number
}) {
  const progressPct = Math.min((yearReturnRate / yearTargetRate) * 100, 100)
  const calendarPct = (dayOfYear / totalDaysInYear) * 100
  const isAhead     = yearReturnRate >= expectedReturnRate
  // 距年度目标还差多少（与时间进度无关，是与全年目标的差距）
  const gapToFullTarget = yearTargetPnL - yearPnL

  return (
    <div className="bg-surface-2 border border-border rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <Target size={15} className="text-accent" />
          年度目标追踪
        </h3>
        <Badge variant={isAhead ? 'profit' : 'amber'}>
          {isAhead ? '进度领先' : '进度落后'}
        </Badge>
      </div>

      {/* 今年盈亏 / 目标 / 还差 — 三格 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface-3 rounded-lg p-3 space-y-1">
          <p className="text-xs text-gray-500">今年盈亏</p>
          <p className={clsx('text-sm font-bold font-mono', pnlColor(yearPnL))}>
            <Num>{fmtPnL(yearPnL, 0)}</Num>
          </p>
          <p className={clsx('text-xs font-mono', pnlColor(yearReturnRate))}>
            {fmtPct(yearReturnRate)}
          </p>
        </div>
        <div className="bg-surface-3 rounded-lg p-3 space-y-1">
          <p className="text-xs text-gray-500">年度目标盈利</p>
          <p className="text-sm font-bold font-mono text-accent">
            <Num>{fmtPnL(yearTargetPnL, 0)}</Num>
          </p>
          <p className="text-xs text-gray-500">{fmtPct(yearTargetRate, 0)} 目标</p>
        </div>
        <div className="bg-surface-3 rounded-lg p-3 space-y-1">
          <p className="text-xs text-gray-500">距年度目标</p>
          <p className={clsx('text-sm font-bold font-mono', gapToFullTarget <= 0 ? 'text-profit' : 'text-loss')}>
            {gapToFullTarget <= 0 ? '✓ 已达标' : <Num>-{fmtCNY(gapToFullTarget, 0)}</Num>}
          </p>
          <p className="text-xs text-gray-500">
            {gapToFullTarget <= 0
              ? <><Num>{`超出 ${fmtCNY(Math.abs(gapToFullTarget), 0)}`}</Num></>
              : `还需盈利`}
          </p>
        </div>
      </div>

      {/* Return progress bar */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">年度目标完成进度</span>
          <span className="text-gray-400 font-mono">{progressPct.toFixed(1)}%</span>
        </div>
        <div className="h-3 bg-surface-3 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-profit transition-all duration-500"
            style={{ width: `${Math.max(progressPct, 2)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>0</span>
          <span className="text-accent">目标 {fmtPct(yearTargetRate, 0)}（<Num>{fmtCNY(yearTargetPnL, 0)}</Num>）</span>
        </div>
      </div>

      {/* 按时进度对比 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-3 rounded-lg p-3 space-y-1">
          <p className="text-xs text-gray-500">按时进度应达</p>
          <p className="text-sm font-bold font-mono text-gray-300">
            {fmtPct(expectedReturnRate)}
          </p>
          <p className="text-xs text-gray-500">
            ≈ <Num>{fmtCNY(expectedReturnRate * (yearTargetPnL / yearTargetRate), 0)}</Num>
          </p>
        </div>
        <div className="bg-surface-3 rounded-lg p-3 space-y-1">
          <p className="text-xs text-gray-500">当前 vs 时间进度</p>
          <p className={clsx('text-sm font-bold font-mono', isAhead ? 'text-profit' : 'text-amber-400')}>
            {isAhead ? '领先 ' : '落后 '}
            {fmtPct(yearReturnRate - expectedReturnRate)}
          </p>
          <p className={clsx('text-xs', isAhead ? 'text-profit' : 'text-amber-400')}>
            {isAhead
              ? <><Num>{`超额 ${fmtCNY(Math.abs(yearGapAmount), 0)}`}</Num></>
              : <><Num>{`缺口 -${fmtCNY(Math.abs(yearGapAmount), 0)}`}</Num></>}
          </p>
        </div>
      </div>

      {/* Calendar progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400 flex items-center gap-1.5">
            <Calendar size={12} />
            日历进度
          </span>
          <span className="text-gray-400 font-mono">
            第 {dayOfYear} 天 / 全年 {totalDaysInYear} 天
          </span>
        </div>
        <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gray-500 transition-all duration-500"
            style={{ width: `${calendarPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>Jan 1</span>
          <span>{calendarPct.toFixed(1)}%</span>
          <span>Dec 31</span>
        </div>
      </div>
    </div>
  )
}

// ── Asset Allocation Pie ──────────────────────────────────────────────────────
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#6B7280']

function AllocationCard({
  stockValue,
  fundValue,
  stockCash,
  fundCash,
  totalValue,
  stockCount,
  fundCount,
  stockTotalValue,
  fundTotalValue,
  stockPositionRatio,
  fundPositionRatio,
  totalPositionRatio,
  stockRatioOfTotal,
  fundRatioOfTotal,
}: {
  stockValue: number
  fundValue: number
  stockCash: number
  fundCash: number
  totalValue: number
  stockCount: number
  fundCount: number
  stockTotalValue: number
  fundTotalValue: number
  stockPositionRatio: number
  fundPositionRatio: number
  totalPositionRatio: number
  stockRatioOfTotal: number
  fundRatioOfTotal: number
}) {
  const data = [
    { name: '股票(含场内ETF)', value: stockValue, sub: `${stockCount}只` },
    { name: '场外基金', value: fundValue, sub: `${fundCount}只` },
    ...(stockCash > 0 ? [{ name: '股票账户现金', value: stockCash, sub: '' }] : []),
    ...(fundCash  > 0 ? [{ name: '基金货币账户', value: fundCash,  sub: '' }] : []),
  ].filter(d => d.value > 0)

  return (
    <div className="bg-surface-2 border border-border rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
        <TrendingUp size={15} className="text-accent" />
        资产配置
      </h3>
      <div className="flex items-center gap-4">
        {/* Donut chart */}
        <div className="w-36 h-36 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={60}
                paddingAngle={3}
                dataKey="value"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => fmtCNYCompact(v)}
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#F9FAFB',
                  fontSize: '12px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div className="flex-1 space-y-3">
          {data.map((d, i) => (
            <div key={d.name} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-xs text-gray-400">{d.name}</span>
                  {d.sub && <span className="text-xs text-gray-600">({d.sub})</span>}
                </div>
                <span className="text-xs font-mono text-gray-300">
                  {((d.value / totalValue) * 100).toFixed(1)}%
                </span>
              </div>
              <p className="text-sm font-semibold font-mono text-gray-200 pl-4">
                <Num>{fmtCNYCompact(d.value)}</Num>
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Position analysis */}
      <div className="border-t border-border pt-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">仓位分析</p>
        {/* Stock/Fund total asset ratio */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-surface-3 rounded-lg px-3 py-2">
            <p className="text-[10px] text-gray-500 mb-0.5">股票总资产</p>
            <p className="text-xs font-mono font-semibold text-blue-400">
              <Num>{fmtCNYCompact(stockTotalValue)}</Num>
            </p>
            <p className="text-[10px] font-mono text-gray-500">{(stockRatioOfTotal * 100).toFixed(1)}% of 总</p>
          </div>
          <div className="bg-surface-3 rounded-lg px-3 py-2">
            <p className="text-[10px] text-gray-500 mb-0.5">基金总资产</p>
            <p className="text-xs font-mono font-semibold text-amber-400">
              <Num>{fmtCNYCompact(fundTotalValue)}</Num>
            </p>
            <p className="text-[10px] font-mono text-gray-500">{(fundRatioOfTotal * 100).toFixed(1)}% of 总</p>
          </div>
        </div>
        {/* Position ratios */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-surface-3 rounded-lg px-3 py-2">
            <p className="text-[10px] text-gray-500 mb-0.5">股票仓位</p>
            <p className="text-xs font-mono font-semibold text-gray-200">{(stockPositionRatio * 100).toFixed(1)}%</p>
          </div>
          <div className="bg-surface-3 rounded-lg px-3 py-2">
            <p className="text-[10px] text-gray-500 mb-0.5">基金仓位</p>
            <p className="text-xs font-mono font-semibold text-gray-200">{(fundPositionRatio * 100).toFixed(1)}%</p>
          </div>
          <div className="bg-surface-3 rounded-lg px-3 py-2">
            <p className="text-[10px] text-gray-500 mb-0.5">总仓位</p>
            <p className="text-xs font-mono font-semibold text-gray-200">{(totalPositionRatio * 100).toFixed(1)}%</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Top Holdings Bar Chart ────────────────────────────────────────────────────
function TopHoldingsChart({ holdings }: { holdings: Array<{ name: string; value: number; pnlRate: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={holdings} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={v => fmtCNYCompact(v).replace('¥', '')}
          tick={{ fill: '#6B7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={68}
          tick={{ fill: '#9CA3AF', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(v: number, _, p) => [
            `${fmtCNY(v)}  (${fmtPct(p.payload.pnlRate)})`,
            '持有金额',
          ]}
          contentStyle={{
            backgroundColor: '#1F2937',
            border: '1px solid #374151',
            borderRadius: '8px',
            color: '#F9FAFB',
            fontSize: '12px',
          }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {holdings.map((h, i) => (
            <Cell
              key={i}
              fill={h.pnlRate >= 0 ? '#3B82F6' : '#EF4444'}
              fillOpacity={0.8}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const qc = useQueryClient()
  const [refreshResult, setRefreshResult] = useState<RefreshPricesResult | null>(null)

  const { data: summary, isLoading, error } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: dashboardApi.getSummary,
    refetchInterval: 60_000,
  })

  const { data: holdings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: holdingsApi.getAll,
  })

  const refresh = useMutation({
    mutationFn: holdingsApi.refreshPrices,
    onSuccess: (result) => {
      setRefreshResult(result)
      qc.invalidateQueries({ queryKey: ['holdings'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <RefreshCw size={32} className="animate-spin text-accent mx-auto" />
          <p className="text-gray-500 text-sm">加载数据中…</p>
        </div>
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <AlertCircle size={32} className="text-loss mx-auto" />
          <p className="text-gray-400 text-sm">无法连接到服务器</p>
          <p className="text-gray-600 text-xs max-w-xs">
            请确保后端服务已启动，并检查 VITE_API_BASE_URL 配置
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['dashboard-summary'] })}
          >
            重试
          </Button>
        </div>
      </div>
    )
  }

  // Top 10 holdings sorted by value
  const top10 = [...holdings]
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map(h => ({ name: h.name, value: h.value, pnlRate: h.holdingPnLRate }))

  const TodayDir = summary.todayPnL >= 0 ? TrendingUp : TrendingDown

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Page header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border bg-surface-2/50 backdrop-blur-sm sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold text-gray-100">投资组合概览</h1>
          <p className="text-xs text-gray-500">
            最后更新：{summary.updatedAt ? dayjs(summary.updatedAt).format('YYYY-MM-DD HH:mm') : '—'}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={refresh.isPending}
          icon={<RefreshCw size={14} />}
          onClick={() => refresh.mutate()}
        >
          <span className="hidden sm:inline">刷新行情</span>
        </Button>
      </div>

      <div className="flex-1 px-4 sm:px-6 py-5 space-y-5">
        {/* Total value headline */}
        <div className="bg-gradient-to-r from-accent/10 via-surface-2 to-surface-2 border border-accent/20 rounded-xl px-4 sm:px-6 py-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">总资产</p>
          <div className="flex flex-wrap items-end gap-4">
            <span className="text-3xl sm:text-4xl font-bold text-gray-100 font-mono">
              <Num>{fmtCNY(summary.totalValue, 0)}</Num>
            </span>
            <div className={clsx('flex items-center gap-1.5 pb-1', pnlColor(summary.todayPnL))}>
              <TodayDir size={16} />
              <span className="text-base font-semibold font-mono">
                <Num>{fmtPnL(summary.todayPnL)}</Num>
              </span>
              <span className="text-sm">
                ({fmtPct(summary.todayPnLRate)})
              </span>
              <span className="text-gray-500 text-sm ml-1">今日</span>
            </div>
          </div>
          <div className="flex gap-6 mt-3 pt-3 border-t border-white/10">
            <div>
              <p className="text-xs text-gray-500">股票总资产</p>
              <p className="text-sm font-bold font-mono text-blue-400"><Num>{fmtCNY(summary.stockTotalValue, 0)}</Num></p>
            </div>
            <div>
              <p className="text-xs text-gray-500">基金总资产</p>
              <p className="text-sm font-bold font-mono text-amber-400"><Num>{fmtCNY(summary.fundTotalValue, 0)}</Num></p>
            </div>
          </div>
        </div>

        {/* 4 PnL cards — 可点击进入盈亏明细 */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <PnLCard
            title={`今日盈亏 · ${dayjs().format('M月D日')}`}
            value={fmtPnL(summary.todayPnL)}
            rate={fmtPct(summary.todayPnLRate)}
            breakdown={[
              { label: '股票', amount: summary.stockTodayPnL, rate: summary.stockTodayPnLRate },
              { label: '基金', amount: summary.fundTodayPnL,  rate: summary.fundTodayPnLRate  },
            ]}
            icon={summary.todayPnL >= 0 ? TrendingUp : TrendingDown}
            iconColor={summary.todayPnL >= 0 ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'}
            to="/pnl/today"
          />
          <PnLCard
            title="持有盈亏"
            value={fmtPnL(summary.holdingPnL)}
            rate={null}
            breakdown={[
              { label: '股票', amount: summary.stockHoldingPnL },
              { label: '基金', amount: summary.fundHoldingPnL  },
            ]}
            icon={summary.holdingPnL >= 0 ? TrendingUp : TrendingDown}
            iconColor={summary.holdingPnL >= 0 ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'}
            to="/pnl/holding"
          />
          <PnLCard
            title="今年盈亏"
            value={fmtPnL(summary.yearPnL)}
            rate={fmtPct(summary.yearReturnRate)}
            breakdown={[
              { label: '股票', amount: summary.stockYearPnL },
              { label: '基金', amount: summary.fundYearPnL  },
            ]}
            icon={Target}
            iconColor="bg-amber-500/15 text-amber-400"
            to="/pnl/yearly"
          />
          <PnLCard
            title="累计盈亏"
            value={fmtPnL(summary.totalPnL)}
            rate={null}
            breakdown={[
              { label: '股票', amount: summary.stockTotalPnL },
              { label: '基金', amount: summary.fundTotalPnL  },
            ]}
            icon={Calendar}
            iconColor="bg-purple-500/15 text-purple-400"
            to="/pnl/total"
          />
        </div>

        {/* Middle row: Allocation + Year Target */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <AllocationCard
            stockValue={summary.stockValue}
            fundValue={summary.fundValue}
            stockCash={summary.stockCash ?? 0}
            fundCash={summary.fundCash ?? 0}
            totalValue={summary.totalValue}
            stockCount={summary.stockCount}
            fundCount={summary.fundCount}
            stockTotalValue={summary.stockTotalValue}
            fundTotalValue={summary.fundTotalValue}
            stockPositionRatio={summary.stockPositionRatio}
            fundPositionRatio={summary.fundPositionRatio}
            totalPositionRatio={summary.totalPositionRatio}
            stockRatioOfTotal={summary.stockRatioOfTotal}
            fundRatioOfTotal={summary.fundRatioOfTotal}
          />
          <YearTargetCard
            yearReturnRate={summary.yearReturnRate}
            yearTargetRate={summary.yearTargetRate}
            yearGapRate={summary.yearGapRate}
            yearGapAmount={summary.yearGapAmount}
            yearPnL={summary.yearPnL}
            yearTargetPnL={summary.yearTargetPnL}
            dayOfYear={summary.dayOfYear}
            totalDaysInYear={summary.totalDaysInYear}
            expectedReturnRate={summary.expectedReturnRate}
          />
        </div>

        {/* Top 10 Holdings */}
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-200">前 10 大持仓</h3>
            <Link
              to="/holdings"
              className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              查看全部 <ChevronRight size={13} />
            </Link>
          </div>
          {top10.length > 0 ? (
            <TopHoldingsChart holdings={top10} />
          ) : (
            <p className="text-center text-gray-500 text-sm py-8">暂无持仓数据</p>
          )}
        </div>
      </div>

      {refreshResult && (
        <RefreshToast result={refreshResult} onClose={() => setRefreshResult(null)} />
      )}
    </div>
  )
}
