import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trophy, TrendingDown, RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { closedApi } from '../api/client'
import type { ClosedPosition, ClosedPositionFilter } from '../types'
import { fmtCNY, fmtPct, fmtDate, fmtPnL, pnlColor, clsx } from '../lib/utils'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Pagination } from '../components/ui/Pagination'

// ── Sort ──────────────────────────────────────────────────────────────────────
type SortKey = keyof ClosedPosition
type SortDir = 'asc' | 'desc'

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={11} className="text-gray-600" />
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="text-accent" />
    : <ChevronDown size={11} className="text-accent" />
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ClosedPositionsPage() {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<ClosedPositionFilter>({})
  const [tempCode, setTempCode] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('closeDate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const PAGE_SIZE = 25

  const query = useQuery({
    queryKey: ['closed-positions', page, filters],
    queryFn: () => closedApi.getList({ ...filters, page, pageSize: PAGE_SIZE }),
  })

  const positions = query.data?.items ?? []
  const total = query.data?.total ?? 0

  // Client-side sort (server may not support it)
  const sorted = [...positions].sort((a, b) => {
    const av = a[sortKey] ?? 0
    const bv = b[sortKey] ?? 0
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
    return sortDir === 'asc' ? cmp : -cmp
  })

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const search = () => {
    setFilters(f => ({ ...f, code: tempCode || undefined }))
    setPage(1)
  }

  // Summary stats (from current page — ideally from API)
  const totalPnL = positions.reduce((s, p) => s + p.totalPnL, 0)
  const wins = positions.filter(p => p.totalPnL > 0).length
  const winRate = positions.length > 0 ? wins / positions.length : 0
  const avgDays = positions.length > 0
    ? positions.reduce((s, p) => s + p.holdingDays, 0) / positions.length
    : 0

  const ThCell = ({ col, label }: { col: SortKey; label: string }) => (
    <th
      className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-300 transition-colors whitespace-nowrap"
      onClick={() => handleSort(col)}
    >
      <div className="flex items-center gap-1">
        {label}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </div>
    </th>
  )

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border bg-surface-2/50 backdrop-blur-sm sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold text-gray-100">已清仓</h1>
          <p className="text-xs text-gray-500">共 {total} 条历史记录</p>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-surface-2 border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">当页累计盈亏</p>
            <p className={clsx('text-base font-semibold font-mono', pnlColor(totalPnL))}>
              {fmtPnL(totalPnL, 0)}
            </p>
          </div>
          <div className="bg-surface-2 border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">胜率</p>
            <div className="flex items-center gap-1.5">
              <p className={clsx('text-base font-semibold font-mono', winRate >= 0.6 ? 'text-profit' : winRate < 0.4 ? 'text-loss' : 'text-amber-400')}>
                {(winRate * 100).toFixed(1)}%
              </p>
              <Trophy size={14} className="text-amber-400" />
            </div>
          </div>
          <div className="bg-surface-2 border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">平均持仓天数</p>
            <p className="text-base font-semibold font-mono text-gray-200">
              {avgDays.toFixed(0)} 天
            </p>
          </div>
          <div className="bg-surface-2 border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">盈/亏笔数</p>
            <p className="text-base font-semibold font-mono text-gray-200">
              <span className="text-profit">{wins}</span>
              <span className="text-gray-600 mx-1">/</span>
              <span className="text-loss">{positions.length - wins}</span>
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="w-48">
            <Input
              placeholder="搜索代码或名称…"
              value={tempCode}
              onChange={e => setTempCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
            />
          </div>
          <Button variant="secondary" size="sm" onClick={search}>搜索</Button>
          {filters.code && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setTempCode(''); setFilters({}); setPage(1) }}
            >
              清除
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-3 border-b border-border">
                <tr>
                  <ThCell col="closeDate" label="清仓日期" />
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">代码/名称</th>
                  <ThCell col="totalPnL" label="总盈亏" />
                  <ThCell col="pnLRate" label="盈亏%" />
                  <ThCell col="outperform" label="超额收益" />
                  <ThCell col="buyAvg" label="买入均价" />
                  <ThCell col="sellAvg" label="卖出均价" />
                  <ThCell col="holdingDays" label="持仓天数" />
                  <ThCell col="buildDate" label="建仓日期" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {query.isLoading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-500">
                      <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
                      加载中…
                    </td>
                  </tr>
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-500">
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  sorted.map(p => (
                    <tr key={p.id} className="hover:bg-surface-3/40 transition-colors">
                      <td className="px-3 py-3 text-xs font-mono text-gray-400 whitespace-nowrap">
                        {fmtDate(p.closeDate)}
                      </td>
                      <td className="px-3 py-3">
                        <div>
                          <p className="text-xs font-mono text-gray-500">{p.code}</p>
                          <p className="text-sm font-medium text-gray-200 whitespace-nowrap">{p.name}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className={clsx('text-sm font-mono font-semibold', pnlColor(p.totalPnL))}>
                          {fmtPnL(p.totalPnL)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Badge variant={p.pnLRate >= 0 ? 'profit' : 'loss'}>
                          {fmtPct(p.pnLRate)}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {p.outperform >= 0
                            ? <ChevronUp size={12} className="text-profit" />
                            : <TrendingDown size={12} className="text-loss" />}
                          <span className={clsx('text-xs font-mono', pnlColor(p.outperform))}>
                            {fmtPct(p.outperform)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-mono text-gray-400">
                        {fmtCNY(p.buyAvg, 3)}
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-mono text-gray-300">
                        {fmtCNY(p.sellAvg, 3)}
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-gray-400">
                        {p.holdingDays} 天
                      </td>
                      <td className="px-3 py-3 text-xs font-mono text-gray-500 whitespace-nowrap">
                        {fmtDate(p.buildDate)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {total > PAGE_SIZE && (
            <div className="px-4 py-3 border-t border-border">
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
