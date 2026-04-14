import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { RefreshCw, BarChart2 } from 'lucide-react'
import { performanceApi, benchmarkApi } from '../api/client'
import type { DailySnapshot, MonthlySnapshot, BenchmarkPrice, BenchmarkKey } from '../types'
import { BENCHMARK_CONFIG } from '../types'
import { clsx, fmtPnL, fmtPct, pnlColor } from '../lib/utils'
import { Num } from '../components/ui/Num'

// ── Constants ─────────────────────────────────────────────────────────────────
const YEAR_START_VALUE = 2445257.75
const STOCK_RATIO = 0.603
const FUND_RATIO  = 0.397

const MONTH_LABELS = ['', '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月']

type TypeFilter = 'all' | 'stock' | 'fund'
type ActiveTab  = 'heatmap' | 'monthly' | 'ytd' | 'trend'

// ── Heatmap color helper ──────────────────────────────────────────────────────
function heatmapColor(rate: number | null | undefined): string {
  if (rate == null) return 'bg-surface-3'
  if (rate > 0.01)              return 'bg-[#166534]'
  if (rate > 0.003)             return 'bg-[#16a34a]'
  if (rate > 0)                 return 'bg-[#4ade80]/50'
  if (rate === 0)               return 'bg-surface-3'
  if (rate > -0.003)            return 'bg-[#fca5a5]/50'
  if (rate > -0.01)             return 'bg-[#dc2626]'
  return 'bg-[#7f1d1d]'
}

// ── Benchmark Toggle ──────────────────────────────────────────────────────────
interface BenchmarkToggleProps {
  value: Record<BenchmarkKey, boolean>
  onChange: (v: Record<BenchmarkKey, boolean>) => void
}
function BenchmarkToggle({ value, onChange }: BenchmarkToggleProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500">基准:</span>
      {(Object.keys(BENCHMARK_CONFIG) as BenchmarkKey[]).map(k => {
        const cfg = BENCHMARK_CONFIG[k]
        const active = value[k]
        return (
          <button
            key={k}
            onClick={() => onChange({ ...value, [k]: !active })}
            className={clsx(
              'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
              active
                ? 'text-white'
                : 'bg-surface-2 border border-border text-gray-400 hover:text-gray-200',
            )}
            style={active ? { backgroundColor: cfg.color } : undefined}
          >
            {cfg.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Heatmap tooltip card ──────────────────────────────────────────────────────
interface DayDetail {
  snap: DailySnapshot
  benchmarks: BenchmarkPrice | null
  benchmarkEnabled: Record<BenchmarkKey, boolean>
}
function DayDetailCard({ snap, benchmarks, benchmarkEnabled }: DayDetail) {
  const d = dayjs(snap.date)
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
  return (
    <div className="bg-surface-2 border border-border rounded-xl p-4 text-sm space-y-3">
      <div className="font-semibold text-gray-100">
        {d.format('YYYY年M月D日')} （周{WEEKDAYS[d.day()]}）
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <span className="text-gray-400">总收益</span>
        <span className={clsx('font-mono', pnlColor(snap.todayPnL))}>
          <Num>{fmtPnL(snap.todayPnL)}</Num>
          <span className="text-xs ml-1 text-gray-500">
            ({fmtPct(snap.todayPnLRate)})
          </span>
        </span>
        <span className="text-gray-400">股票</span>
        <span className={clsx('font-mono', pnlColor(snap.stockTodayPnL))}>
          <Num>{fmtPnL(snap.stockTodayPnL)}</Num>
          <span className="text-xs ml-1 text-gray-500">
            ({fmtPct(snap.stockTodayPnLRate)})
          </span>
        </span>
        <span className="text-gray-400">基金</span>
        <span className={clsx('font-mono', pnlColor(snap.fundTodayPnL))}>
          <Num>{fmtPnL(snap.fundTodayPnL)}</Num>
          <span className="text-xs ml-1 text-gray-500">
            ({fmtPct(snap.fundTodayPnLRate)})
          </span>
        </span>
      </div>
      {benchmarks && (
        <>
          <div className="border-t border-border pt-2 space-y-1">
            {(Object.keys(BENCHMARK_CONFIG) as BenchmarkKey[])
              .filter(k => benchmarkEnabled[k] && benchmarks[k])
              .map(k => (
                <div key={k} className="flex justify-between">
                  <span style={{ color: BENCHMARK_CONFIG[k].color }} className="text-xs">
                    {BENCHMARK_CONFIG[k].label}
                  </span>
                  <span className={clsx('text-xs font-mono', pnlColor(benchmarks[k].changeRate))}>
                    {fmtPct(benchmarks[k].changeRate)} （当日）
                  </span>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Daily Heatmap ─────────────────────────────────────────────────────────────
interface HeatmapProps {
  snapshots: DailySnapshot[]
  benchmarks: BenchmarkPrice[]
  typeFilter: TypeFilter
  benchmarkEnabled: Record<BenchmarkKey, boolean>
}

function DailyHeatmap({ snapshots, benchmarks, typeFilter, benchmarkEnabled }: HeatmapProps) {
  const [selected, setSelected] = useState<string | null>(null)

  const snapMap = useMemo(() => {
    const m: Record<string, DailySnapshot> = {}
    snapshots.forEach(s => { m[s.date] = s })
    return m
  }, [snapshots])

  const benchMap = useMemo(() => {
    const m: Record<string, BenchmarkPrice> = {}
    benchmarks.forEach(b => { m[b.date] = b })
    return m
  }, [benchmarks])

  // Build monthly grids
  const months = useMemo(() => {
    if (!snapshots.length) return []
    const first = dayjs(snapshots[0].date)
    const last  = dayjs(snapshots[snapshots.length - 1].date)
    const result: { monthKey: string; monthLabel: string; weeks: (string | null)[][] }[] = []

    let cur = first.startOf('month')
    while (cur.isBefore(last.endOf('month'))) {
      const monthKey = cur.format('YYYY-MM')
      const daysInMonth = cur.daysInMonth()
      // Build weeks: each week is Mon-Sun (index 0=Mon ... 6=Sun)
      const weeks: (string | null)[][] = []
      let week: (string | null)[] = new Array(7).fill(null)

      for (let day = 1; day <= daysInMonth; day++) {
        const d = cur.date(day)
        const dateStr = d.format('YYYY-MM-DD')
        // 0=Mon ... 6=Sun (dayjs: 0=Sun, 1=Mon, ... 6=Sat → adjust)
        const dow = (d.day() + 6) % 7 // Mon=0 ... Sun=6
        if (week[0] !== null && dow === 0) {
          weeks.push(week)
          week = new Array(7).fill(null)
        }
        week[dow] = dateStr
      }
      if (week.some(x => x !== null)) weeks.push(week)

      result.push({
        monthKey,
        monthLabel: MONTH_LABELS[cur.month() + 1],
        weeks,
      })
      cur = cur.add(1, 'month')
    }
    return result
  }, [snapshots])

  // Get benchmark monthly cumulative return
  const benchMonthly = useMemo(() => {
    const result: Record<string, Record<BenchmarkKey, number>> = {}
    months.forEach(({ monthKey, weeks }) => {
      const allDates = weeks.flat().filter(Boolean) as string[]
      if (!allDates.length) return
      // Find first trading day of month (or first available before it)
      const tradingDates = allDates.filter(d => benchMap[d])
      if (!tradingDates.length) return
      const firstDate = tradingDates[0]
      const lastDate  = tradingDates[tradingDates.length - 1]
      const firstBench = benchMap[firstDate]
      const lastBench  = benchMap[lastDate]
      if (!firstBench || !lastBench) return
      const rec: Partial<Record<BenchmarkKey, number>> = {}
      ;(Object.keys(BENCHMARK_CONFIG) as BenchmarkKey[]).forEach(k => {
        if (firstBench[k] && lastBench[k]) {
          rec[k] = (lastBench[k].close - firstBench[k].close) / firstBench[k].close
        }
      })
      result[monthKey] = rec as Record<BenchmarkKey, number>
    })
    return result
  }, [months, benchMap])

  const selectedSnap = selected ? snapMap[selected] : null
  const selectedBench = selected ? benchMap[selected] : null

  function getCellRate(dateStr: string | null): number | null {
    if (!dateStr) return null
    const snap = snapMap[dateStr]
    if (!snap) return null
    if (typeFilter === 'stock') return snap.stockTodayPnLRate
    if (typeFilter === 'fund')  return snap.fundTodayPnLRate
    return snap.todayPnLRate
  }

  const anyBenchEnabled = (Object.keys(BENCHMARK_CONFIG) as BenchmarkKey[]).some(k => benchmarkEnabled[k])

  return (
    <div className="space-y-6">
      {/* Detail card — shown above heatmap when a day is selected */}
      {selectedSnap && (
        <DayDetailCard
          snap={selectedSnap}
          benchmarks={selectedBench}
          benchmarkEnabled={benchmarkEnabled}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {months.map(({ monthKey, monthLabel, weeks }) => (
          <div key={monthKey}>
            <div className="text-sm font-medium text-gray-400 mb-2">{monthLabel}</div>
            {/* Day-of-week header */}
            <div className="flex gap-1 mb-1">
              {['一', '二', '三', '四', '五', '六', '日'].map(d => (
                <div key={d} className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center text-[10px] text-gray-600">
                  {d}
                </div>
              ))}
            </div>
            {/* Weeks grid */}
            {weeks.map((week, wi) => (
              <div key={wi} className="flex gap-1 mb-1">
                {week.map((dateStr, di) => {
                  const rate = getCellRate(dateStr)
                  const isSelected = dateStr !== null && dateStr === selected
                  return (
                    <button
                      key={di}
                      title={dateStr ?? ''}
                      onClick={() => dateStr && setSelected(prev => prev === dateStr ? null : dateStr)}
                      className={clsx(
                        'w-6 h-6 md:w-8 md:h-8 rounded-sm transition-all',
                        dateStr ? heatmapColor(rate) : 'bg-transparent',
                        dateStr && 'cursor-pointer hover:ring-1 hover:ring-white/40',
                        isSelected && 'ring-2 ring-white',
                      )}
                    />
                  )
                })}
              </div>
            ))}
            {/* Benchmark row */}
            {anyBenchEnabled && (
              <div className="mt-2 space-y-1">
                {(Object.keys(BENCHMARK_CONFIG) as BenchmarkKey[])
                  .filter(k => benchmarkEnabled[k])
                  .map(k => {
                    const monthly = benchMonthly[monthKey]?.[k]
                    return (
                      <div key={k} className="flex items-center gap-2 text-[11px]">
                        <span style={{ color: BENCHMARK_CONFIG[k].color }} className="w-16 shrink-0">
                          {BENCHMARK_CONFIG[k].label}
                        </span>
                        <span className={clsx('font-mono', pnlColor(monthly ?? 0))}>
                          {monthly != null ? fmtPct(monthly) : '—'}
                        </span>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Monthly Table ─────────────────────────────────────────────────────────────
interface MonthlyTableProps {
  monthly: MonthlySnapshot[]
  benchmarks: BenchmarkPrice[]
  typeFilter: TypeFilter
  benchmarkEnabled: Record<BenchmarkKey, boolean>
}

function MonthlyTable({ monthly, benchmarks, typeFilter, benchmarkEnabled }: MonthlyTableProps) {
  const enabledBenchmarks = (Object.keys(BENCHMARK_CONFIG) as BenchmarkKey[]).filter(k => benchmarkEnabled[k])

  // Compute per-month benchmark returns
  const benchMonthly = useMemo(() => {
    const result: Record<string, Record<BenchmarkKey, number>> = {}
    monthly.forEach(m => {
      const monthKey = `${m.year}-${String(m.month).padStart(2, '0')}`
      const monthSnaps = benchmarks
        .filter(b => b.date.startsWith(monthKey))
        .sort((a, b) => a.date.localeCompare(b.date))
      if (!monthSnaps.length) return
      const first = monthSnaps[0]
      const last  = monthSnaps[monthSnaps.length - 1]
      const rec: Partial<Record<BenchmarkKey, number>> = {}
      ;(Object.keys(BENCHMARK_CONFIG) as BenchmarkKey[]).forEach(k => {
        if (first[k] && last[k]) {
          rec[k] = (last[k].close - first[k].close) / first[k].close
        }
      })
      result[monthKey] = rec as Record<BenchmarkKey, number>
    })
    return result
  }, [monthly, benchmarks])

  function getMonthPnL(m: MonthlySnapshot) {
    if (typeFilter === 'stock') return m.stockMonthPnL
    if (typeFilter === 'fund')  return m.fundMonthPnL
    return m.monthPnL
  }

  const maxAbs = Math.max(...monthly.map(m => Math.abs(getMonthPnL(m))), 1)
  const totalPnL = monthly.reduce((s, m) => s + getMonthPnL(m), 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-border">
            <th className="py-2 pr-4 font-medium w-8"></th>
            <th className="py-2 pr-4 font-medium">月份</th>
            <th className="py-2 pr-4 font-medium text-right">收益金额</th>
            <th className="py-2 pr-4 font-medium text-right">收益率</th>
            {enabledBenchmarks.map(k => (
              <th key={k} className="py-2 pr-4 font-medium text-right hidden md:table-cell"
                style={{ color: BENCHMARK_CONFIG[k].color }}>
                {BENCHMARK_CONFIG[k].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {monthly.map((m, i) => {
            const pnl  = getMonthPnL(m)
            const rate = m.monthPnLRate
            const barW = Math.round((Math.abs(pnl) / maxAbs) * 100)
            const monthKey = `${m.year}-${String(m.month).padStart(2, '0')}`
            const isCurrentMonth = dayjs().format('YYYY-MM') === monthKey
            return (
              <tr key={i} className="hover:bg-surface-2/50 transition-colors">
                {/* Indicator bar */}
                <td className="py-3 pr-2">
                  <div className="w-1.5 h-6 rounded-sm overflow-hidden bg-surface-3">
                    <div
                      className={clsx('h-full rounded-sm', pnl >= 0 ? 'bg-profit' : 'bg-loss')}
                      style={{ width: `${barW}%` }}
                    />
                  </div>
                </td>
                <td className="py-3 pr-4 text-gray-300 font-medium">
                  {m.month}月
                  {isCurrentMonth && <span className="ml-1 text-xs text-accent">*</span>}
                </td>
                <td className={clsx('py-3 pr-4 text-right font-mono', pnlColor(pnl))}>
                  <Num>{fmtPnL(pnl)}</Num>
                </td>
                <td className={clsx('py-3 pr-4 text-right font-mono', pnlColor(rate))}>
                  {fmtPct(rate)}
                </td>
                {enabledBenchmarks.map(k => {
                  const br = benchMonthly[monthKey]?.[k]
                  return (
                    <td key={k} className={clsx('py-3 pr-4 text-right font-mono hidden md:table-cell', pnlColor(br ?? 0))}>
                      {br != null ? fmtPct(br) : '—'}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {/* Totals row */}
          <tr className="border-t-2 border-border font-semibold text-gray-200">
            <td className="py-3" />
            <td className="py-3 pr-4">合计</td>
            <td className={clsx('py-3 pr-4 text-right font-mono', pnlColor(totalPnL))}>
              <Num>{fmtPnL(totalPnL)}</Num>
            </td>
            <td className={clsx('py-3 pr-4 text-right font-mono', pnlColor(totalPnL / YEAR_START_VALUE))}>
              {fmtPct(totalPnL / YEAR_START_VALUE)}
            </td>
            {enabledBenchmarks.map(k => <td key={k} className="py-3 hidden md:table-cell" />)}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── YTD Chart ─────────────────────────────────────────────────────────────────
interface YTDChartProps {
  snapshots: DailySnapshot[]
  benchmarks: BenchmarkPrice[]
  typeFilter: TypeFilter
  benchmarkEnabled: Record<BenchmarkKey, boolean>
}

function YTDChart({ snapshots, benchmarks, typeFilter, benchmarkEnabled }: YTDChartProps) {
  const enabledBenchmarks = (Object.keys(BENCHMARK_CONFIG) as BenchmarkKey[]).filter(k => benchmarkEnabled[k])

  const benchStart = useMemo(() => {
    if (!benchmarks.length) return {} as Record<BenchmarkKey, number>
    const first = benchmarks[0]
    const result: Record<BenchmarkKey, number> = {} as Record<BenchmarkKey, number>
    ;(Object.keys(BENCHMARK_CONFIG) as BenchmarkKey[]).forEach(k => {
      result[k] = first[k]?.close ?? 0
    })
    return result
  }, [benchmarks])

  const benchMap = useMemo(() => {
    const m: Record<string, BenchmarkPrice> = {}
    benchmarks.forEach(b => { m[b.date] = b })
    return m
  }, [benchmarks])

  const chartData = useMemo(() => {
    return snapshots.map(s => {
      let myRate: number
      if (typeFilter === 'stock') {
        myRate = s.stockYtdPnL / (YEAR_START_VALUE * STOCK_RATIO) * 100
      } else if (typeFilter === 'fund') {
        myRate = s.fundYtdPnL / (YEAR_START_VALUE * FUND_RATIO) * 100
      } else {
        myRate = s.ytdPnLRate * 100
      }

      const row: Record<string, number | string> = {
        date: s.date,
        label: dayjs(s.date).format('M/D'),
        my: Math.round(myRate * 100) / 100,
      }

      const b = benchMap[s.date]
      enabledBenchmarks.forEach(k => {
        if (b && b[k] && benchStart[k]) {
          row[k] = Math.round(((b[k].close - benchStart[k]) / benchStart[k]) * 10000) / 100
        }
      })
      return row
    })
  }, [snapshots, benchmarks, typeFilter, enabledBenchmarks, benchStart, benchMap])

  // Stats
  const rates = snapshots.map(s => {
    if (typeFilter === 'stock') return s.stockTodayPnLRate
    if (typeFilter === 'fund')  return s.fundTodayPnLRate
    return s.todayPnLRate
  })
  const maxDay = Math.max(...rates)
  const minDay = Math.min(...rates)
  const lastSnap = snapshots[snapshots.length - 1]
  const ytdPnL = lastSnap ? (typeFilter === 'stock' ? lastSnap.stockYtdPnL : typeFilter === 'fund' ? lastSnap.fundYtdPnL : lastSnap.ytdPnL) : 0
  const ytdRate = lastSnap ? (typeFilter === 'stock' ? lastSnap.stockYtdPnL / (YEAR_START_VALUE * STOCK_RATIO) : typeFilter === 'fund' ? lastSnap.fundYtdPnL / (YEAR_START_VALUE * FUND_RATIO) : lastSnap.ytdPnLRate) : 0

  // X-axis: show month labels only
  const xTickFormatter = (v: string) => {
    const d = dayjs(v)
    if (d.date() <= 7) return `${d.month() + 1}月`
    return ''
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const dateStr = payload[0]?.payload?.date
    return (
      <div className="bg-surface-2 border border-border rounded-lg p-3 text-xs space-y-1 shadow-xl">
        <div className="text-gray-400">{dateStr}</div>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex justify-between gap-4">
            <span style={{ color: p.color }}>{p.name}</span>
            <span className={clsx('font-mono', p.value >= 0 ? 'text-profit' : 'text-loss')}>
              {p.value >= 0 ? '+' : ''}{p.value.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    )
  }

  const myLabel = typeFilter === 'stock' ? '我的(股)' : typeFilter === 'fund' ? '我的(基)' : '我的'

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
          <XAxis
            dataKey="date"
            tickFormatter={xTickFormatter}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            width={54}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value) => <span style={{ fontSize: 11, color: '#9ca3af' }}>{value}</span>}
          />
          <Line
            type="monotone"
            dataKey="my"
            name={myLabel}
            stroke="#3b82f6"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
          {enabledBenchmarks.map(k => (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              name={BENCHMARK_CONFIG[k].label}
              stroke={BENCHMARK_CONFIG[k].color}
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 2"
              activeDot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="YTD收益金额" value={<Num>{fmtPnL(ytdPnL)}</Num>} color={pnlColor(ytdPnL)} />
        <StatCard label="YTD收益率" value={fmtPct(ytdRate)} color={pnlColor(ytdRate)} />
        <StatCard label="最大单日涨幅" value={fmtPct(maxDay)} color="text-profit" />
        <StatCard label="最大单日跌幅" value={fmtPct(minDay)} color="text-loss" />
      </div>
    </div>
  )
}

// ── Trend Chart ───────────────────────────────────────────────────────────────
interface TrendChartProps {
  snapshots: DailySnapshot[]
}
function TrendChart({ snapshots }: TrendChartProps) {
  const chartData = useMemo(() =>
    snapshots.map(s => ({
      date: s.date,
      value: Math.round(s.totalValue / 10000 * 100) / 100,
    })), [snapshots])

  const maxVal = Math.max(...chartData.map(d => d.value))
  const minVal = Math.min(...chartData.map(d => d.value))
  const first  = chartData[0]?.value ?? 0
  const last   = chartData[chartData.length - 1]?.value ?? 0
  const change = first > 0 ? (last - first) / first : 0

  const xTickFormatter = (v: string) => {
    const d = dayjs(v)
    if (d.date() <= 7) return `${d.month() + 1}月`
    return ''
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const row = payload[0]?.payload
    return (
      <div className="bg-surface-2 border border-border rounded-lg p-3 text-xs shadow-xl">
        <div className="text-gray-400 mb-1">{row.date}</div>
        <div className="text-gray-100 font-mono">总资产 ¥{row.value.toFixed(2)}万</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="totalValueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
          <XAxis
            dataKey="date"
            tickFormatter={xTickFormatter}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => `${v.toFixed(0)}万`}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            width={52}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#totalValueGrad)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="期间最高" value={<Num>¥{maxVal.toFixed(2)}万</Num>} color="text-profit" />
        <StatCard label="期间最低" value={<Num>¥{minVal.toFixed(2)}万</Num>} color="text-loss" />
        <StatCard label="期间涨幅" value={fmtPct(change)} color={pnlColor(change)} />
      </div>
    </div>
  )
}

// ── Stat Card helper ──────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: React.ReactNode; color: string }) {
  return (
    <div className="bg-surface-2 rounded-xl p-3 space-y-1">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={clsx('text-sm font-semibold font-mono', color)}>{value}</div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PerformancePage() {
  const [typeFilter, setTypeFilter]       = useState<TypeFilter>('all')
  const [activeTab, setActiveTab]         = useState<ActiveTab>('heatmap')
  const [benchmarkEnabled, setBenchmarkEnabled] = useState<Record<BenchmarkKey, boolean>>({
    sh000001: false,
    cy399006: true,
    kc000680: false,
    hs000300: false,
  })

  const qc = useQueryClient()

  const { data: snapshots = [], isLoading: loadingSnaps } = useQuery({
    queryKey: ['performance', 'daily'],
    queryFn: () => performanceApi.getDaily(),
  })

  const { data: monthly = [], isLoading: loadingMonthly } = useQuery({
    queryKey: ['performance', 'monthly'],
    queryFn: () => performanceApi.getMonthly(2026),
  })

  const { data: benchmarks = [], isLoading: loadingBench } = useQuery({
    queryKey: ['benchmarks'],
    queryFn: () => benchmarkApi.getHistory(),
  })

  const { mutate: refreshBenchmarks, isPending: refreshing } = useMutation({
    mutationFn: () => benchmarkApi.refresh(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['benchmarks'] })
      qc.invalidateQueries({ queryKey: ['performance'] })
    },
  })

  const isLoading = loadingSnaps || loadingMonthly || loadingBench

  const TABS: { key: ActiveTab; label: string }[] = [
    { key: 'heatmap',  label: '日收益' },
    { key: 'monthly',  label: '月收益' },
    { key: 'ytd',      label: '今年以来收益' },
    { key: 'trend',    label: '总资产走势' },
  ]

  const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
    { key: 'all',   label: '全部' },
    { key: 'stock', label: '股票' },
    { key: 'fund',  label: '基金' },
  ]

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart2 size={20} className="text-accent" />
          <h1 className="text-lg font-semibold text-gray-100">收益分析</h1>
        </div>
        <button
          onClick={() => refreshBenchmarks()}
          disabled={refreshing}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
            'bg-surface-2 border border-border text-gray-400 hover:text-gray-100 hover:bg-surface-3',
            refreshing && 'opacity-50 cursor-not-allowed',
          )}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          刷新基准
        </button>
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-1.5">
        {TYPE_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key)}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              typeFilter === key
                ? 'bg-accent text-white'
                : 'bg-surface-2 border border-border text-gray-400 hover:text-gray-100',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Benchmark toggle — hide for trend tab */}
      {activeTab !== 'trend' && (
        <BenchmarkToggle value={benchmarkEnabled} onChange={setBenchmarkEnabled} />
      )}

      {/* Tab navigation */}
      <div className="border-b border-border">
        <div className="flex gap-1 -mb-px">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={clsx(
                'px-3 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-gray-500 hover:text-gray-300',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-500">
          <RefreshCw size={20} className="animate-spin mr-2" />
          加载中…
        </div>
      ) : (
        <div>
          {activeTab === 'heatmap' && (
            <DailyHeatmap
              snapshots={snapshots}
              benchmarks={benchmarks}
              typeFilter={typeFilter}
              benchmarkEnabled={benchmarkEnabled}
            />
          )}
          {activeTab === 'monthly' && (
            <MonthlyTable
              monthly={monthly}
              benchmarks={benchmarks}
              typeFilter={typeFilter}
              benchmarkEnabled={benchmarkEnabled}
            />
          )}
          {activeTab === 'ytd' && (
            <YTDChart
              snapshots={snapshots}
              benchmarks={benchmarks}
              typeFilter={typeFilter}
              benchmarkEnabled={benchmarkEnabled}
            />
          )}
          {activeTab === 'trend' && (
            <TrendChart snapshots={snapshots} />
          )}
        </div>
      )}
    </div>
  )
}
