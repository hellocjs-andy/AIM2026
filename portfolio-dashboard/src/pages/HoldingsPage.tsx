import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Edit2,
  BarChart2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Check,
  X,
  Wallet,
  RefreshCcw,
} from 'lucide-react'
import { holdingsApi, settingsApi, type RefreshPricesResult } from '../api/client'
import { Holding } from '../types'
import { RefreshToast } from '../components/RefreshToast'
import {
  fmtCNY,
  fmtCNYCompact,
  fmtPct,
  fmtPnL,
  fmtNum,
  pnlColor,
  clsx,
} from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { Num } from '../components/ui/Num'

// ── Cash Account Inline Edit Card ────────────────────────────────────────────
function CashCard({
  label,
  settingKey,
  value,
  onSaved,
}: {
  label: string
  settingKey: string
  value: number
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [input, setInput]     = useState('')
  const [err, setErr]         = useState('')
  const qc = useQueryClient()

  const save = useMutation({
    mutationFn: (v: string) => settingsApi.update({ [settingKey]: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
      setEditing(false)
      onSaved()
    },
    onError: (e: Error) => setErr(e.message),
  })

  const handleEdit = () => { setInput(String(value || '')); setErr(''); setEditing(true) }
  const handleSave = () => {
    const v = parseFloat(input)
    if (isNaN(v) || v < 0) { setErr('请输入有效金额'); return }
    save.mutate(input)
  }
  const handleCancel = () => { setEditing(false); setErr('') }

  return (
    <div className="bg-surface-2 border border-border rounded-xl px-4 py-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
        <Wallet size={15} className="text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="1"
              min="0"
              value={input}
              onChange={e => { setInput(e.target.value); setErr('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel() }}
              className="w-36 bg-surface-3 border border-accent/50 rounded-md px-2 py-1 text-sm font-mono text-gray-100 focus:outline-none focus:ring-1 focus:ring-accent"
              autoFocus
            />
            <button onClick={handleSave} disabled={save.isPending}
              className="text-profit hover:text-profit/80 p-1 rounded transition-colors">
              <Check size={14} />
            </button>
            <button onClick={handleCancel} className="text-gray-500 hover:text-gray-300 p-1 rounded transition-colors">
              <X size={14} />
            </button>
            {err && <span className="text-xs text-loss">{err}</span>}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-base font-bold font-mono text-amber-300">
              {value > 0 ? `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}` : '未设置'}
            </span>
            <button onClick={handleEdit}
              className="text-gray-600 hover:text-accent p-1 rounded transition-colors">
              <Edit2 size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Price Update Modal ────────────────────────────────────────────────────────
function PriceModal({
  holding,
  onClose,
}: {
  holding: Holding | null
  onClose: () => void
}) {
  const [price, setPrice] = useState(holding ? String(holding.latestPrice) : '')
  const [err, setErr] = useState('')
  const qc = useQueryClient()

  const update = useMutation({
    mutationFn: ({ code, price }: { code: string; price: number }) =>
      holdingsApi.updatePrice(code, price),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holdings'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
      onClose()
    },
    onError: (e: Error) => setErr(e.message),
  })

  if (!holding) return null

  const handleSubmit = () => {
    const v = parseFloat(price)
    if (isNaN(v) || v <= 0) { setErr('请输入有效价格'); return }
    update.mutate({ code: holding.code, price: v })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`更新价格 — ${holding.name}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" loading={update.isPending} onClick={handleSubmit}>
            确认更新
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-surface-3 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">代码</p>
            <p className="font-mono font-medium">{holding.code}</p>
          </div>
          <div className="bg-surface-3 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">当前价</p>
            <p className="font-mono font-medium">{fmtCNY(holding.latestPrice, 3)}</p>
          </div>
        </div>
        <Input
          label="新价格"
          type="number"
          step="0.001"
          value={price}
          onChange={e => { setPrice(e.target.value); setErr('') }}
          error={err}
          placeholder="请输入最新价格"
        />
      </div>
    </Modal>
  )
}

// ── Sort util ─────────────────────────────────────────────────────────────────
type SortKey = keyof Holding
type SortDir = 'asc' | 'desc'

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={12} className="text-gray-600" />
  return sortDir === 'asc'
    ? <ChevronUp size={12} className="text-accent" />
    : <ChevronDown size={12} className="text-accent" />
}

function Th({
  col,
  label,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  col: SortKey
  label: string
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  className?: string
}) {
  return (
    <th
      className={clsx(
        'px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer select-none',
        'hover:text-gray-300 transition-colors whitespace-nowrap',
        className,
      )}
      onClick={() => onSort(col)}
    >
      <div className="flex items-center gap-1">
        {label}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </div>
    </th>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function HoldingsPage() {
  const qc = useQueryClient()
  const [editHolding, setEditHolding] = useState<Holding | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('value')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [typeFilter, setTypeFilter] = useState<'all' | 'stock' | 'fund'>('all')
  const [refreshResult, setRefreshResult] = useState<RefreshPricesResult | null>(null)

  const { data: holdings = [], isLoading } = useQuery({
    queryKey: ['holdings'],
    queryFn: holdingsApi.getAll,
  })

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  })

  const stockCash = parseFloat(settingsData?.stock_cash ?? '0') || 0
  const fundCash  = parseFloat(settingsData?.fund_cash  ?? '0') || 0

  const refresh = useMutation({
    mutationFn: holdingsApi.refreshPrices,
    onSuccess: (result) => {
      setRefreshResult(result)
      qc.invalidateQueries({ queryKey: ['holdings'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
  })

  const updateType = useMutation({
    mutationFn: ({ code, type }: { code: string; type: 'stock' | 'fund' }) =>
      holdingsApi.updateType(code, type),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holdings'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
  })

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const filtered = holdings
    .filter(h => typeFilter === 'all' || h.type === typeFilter)
    .sort((a, b) => {
      const av = a[sortKey] ?? 0
      const bv = b[sortKey] ?? 0
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
      return sortDir === 'asc' ? cmp : -cmp
    })

  // Summary stats
  const totalValue = holdings.reduce((s, h) => s + h.value, 0)
  const totalTodayPnL = holdings.reduce((s, h) => s + h.todayPnL, 0)
  const totalHoldingPnL = holdings.reduce((s, h) => s + h.holdingPnL, 0)
  const stockCount = holdings.filter(h => h.type === 'stock').length
  const fundCount = holdings.filter(h => h.type === 'fund').length

  const sortProps = { sortKey, sortDir, onSort: handleSort }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border bg-surface-2/50 backdrop-blur-sm sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold text-gray-100">持仓管理</h1>
          <p className="text-xs text-gray-500">{holdings.length} 只标的</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={refresh.isPending}
          icon={<RefreshCw size={14} />}
          onClick={() => refresh.mutate()}
        >
          <span className="hidden sm:inline">刷新全部价格</span>
        </Button>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-4">
        {/* Summary banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '持仓市值', value: fmtCNYCompact(totalValue), color: 'text-gray-100' },
            {
              label: '今日盈亏',
              value: fmtPnL(totalTodayPnL),
              color: pnlColor(totalTodayPnL),
            },
            {
              label: '持有盈亏',
              value: fmtPnL(totalHoldingPnL),
              color: pnlColor(totalHoldingPnL),
            },
            {
              label: '持仓数量',
              value: `${stockCount} 股 / ${fundCount} 基`,
              color: 'text-gray-300',
            },
          ].map(s => (
            <div key={s.label} className="bg-surface-2 border border-border rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">{s.label}</p>
              <p className={clsx('text-base font-semibold font-mono', s.color)}>
            {s.label === '持仓数量' ? s.value : <Num>{s.value}</Num>}
          </p>
            </div>
          ))}
        </div>

        {/* Cash accounts */}
        <div>
          <p className="text-xs text-gray-500 mb-2 flex items-center gap-1.5">
            <Wallet size={12} />
            现金账户（计入总资产，点击金额可编辑）
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <CashCard
              label="股票账户现金余额"
              settingKey="stock_cash"
              value={stockCash}
              onSaved={() => qc.invalidateQueries({ queryKey: ['dashboard-summary'] })}
            />
            <CashCard
              label="基金货币基金账户"
              settingKey="fund_cash"
              value={fundCash}
              onSaved={() => qc.invalidateQueries({ queryKey: ['dashboard-summary'] })}
            />
          </div>
        </div>

        {/* Type filter tabs */}
        <div className="flex items-center gap-2">
          {(['all', 'stock', 'fund'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                typeFilter === t
                  ? 'bg-accent text-white'
                  : 'bg-surface-2 border border-border text-gray-400 hover:text-gray-200',
              )}
            >
              {t === 'all' ? `全部 (${holdings.length})` : t === 'stock' ? `股票 (${stockCount})` : `基金/ETF (${fundCount})`}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-500 flex items-center gap-1">
            <BarChart2 size={12} />
            点击列标题排序
          </span>
        </div>

        {/* Table */}
        <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-3 border-b border-border">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide w-28">代码/名称</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">类型</th>
                  <Th col="value" label="持有金额" {...sortProps} className="text-right" />
                  <Th col="positionRatio" label="仓位" {...sortProps} className="text-right" />
                  <Th col="todayPnL" label="今日盈亏" {...sortProps} className="text-right" />
                  <Th col="todayPnLRate" label="今日%" {...sortProps} className="text-right" />
                  <Th col="holdingPnL" label="持有盈亏" {...sortProps} className="text-right" />
                  <Th col="holdingPnLRate" label="持有%" {...sortProps} className="text-right" />
                  <Th col="latestPrice" label="最新价" {...sortProps} className="text-right" />
                  <Th col="costPerUnit" label="成本价" {...sortProps} className="text-right" />
                  <Th col="quantity" label="持有量" {...sortProps} className="text-right" />
                  <Th col="holdingDays" label="持仓天数" {...sortProps} className="text-right" />
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={13} className="text-center py-12 text-gray-500">
                      <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
                      加载中…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="text-center py-12 text-gray-500">
                      暂无持仓数据
                    </td>
                  </tr>
                ) : (
                  filtered.map(h => (
                    <tr key={h.code} className="hover:bg-surface-3/40 transition-colors">
                      {/* Code + Name */}
                      <td className="px-3 py-3">
                        <div>
                          <p className="text-xs font-mono text-gray-500">{h.code}</p>
                          <p className="text-sm font-medium text-gray-200 whitespace-nowrap">{h.name}</p>
                        </div>
                      </td>
                      {/* Type — click to toggle */}
                      <td className="px-3 py-3">
                        <button
                          onClick={() => updateType.mutate({
                            code: h.code,
                            type: h.type === 'stock' ? 'fund' : 'stock',
                          })}
                          disabled={updateType.isPending}
                          title="点击切换股票/基金类型"
                          className="group flex items-center gap-1 disabled:opacity-50"
                        >
                          <Badge variant={h.type === 'stock' ? 'blue' : 'amber'}>
                            {h.type === 'stock' ? '股票' : '基金'}
                          </Badge>
                          <RefreshCcw
                            size={10}
                            className="text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          />
                        </button>
                      </td>
                      {/* Value */}
                      <td className="px-3 py-3 text-right">
                        <span className="text-sm font-mono font-semibold text-gray-200">
                          <Num>{fmtCNY(h.value, 0)}</Num>
                        </span>
                      </td>
                      {/* Position ratio */}
                      <td className="px-3 py-3 text-right">
                        <span className="text-sm font-mono text-gray-300">
                          {fmtPct(h.positionRatio, 1)}
                        </span>
                      </td>
                      {/* Today P&L */}
                      <td className="px-3 py-3 text-right">
                        <span className={clsx('text-sm font-mono', pnlColor(h.todayPnL))}>
                          <Num>{fmtPnL(h.todayPnL, 0)}</Num>
                        </span>
                      </td>
                      {/* Today P&L rate */}
                      <td className="px-3 py-3 text-right">
                        <span className={clsx('text-xs font-mono', pnlColor(h.todayPnLRate))}>
                          {fmtPct(h.todayPnLRate)}
                        </span>
                      </td>
                      {/* Holding P&L */}
                      <td className="px-3 py-3 text-right">
                        <span className={clsx('text-sm font-mono', pnlColor(h.holdingPnL))}>
                          <Num>{fmtPnL(h.holdingPnL, 0)}</Num>
                        </span>
                      </td>
                      {/* Holding P&L rate */}
                      <td className="px-3 py-3 text-right">
                        <div className={clsx('inline-flex items-center gap-1 text-xs font-mono', pnlColor(h.holdingPnLRate))}>
                          {h.holdingPnLRate >= 0
                            ? <TrendingUp size={11} />
                            : <TrendingDown size={11} />}
                          {fmtPct(h.holdingPnLRate)}
                        </div>
                      </td>
                      {/* Latest price */}
                      <td className="px-3 py-3 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-sm font-mono text-gray-200">
                            {fmtCNY(h.latestPrice, h.latestPrice < 10 ? 3 : 2)}
                          </span>
                          {h.priceTime && (
                            <span
                              className="text-[10px] text-gray-500 font-mono whitespace-nowrap"
                              title={`数据源：${h.priceSource === 'tencent' ? '腾讯财经' : h.priceSource === 'eastmoney' ? '天天基金' : '—'}`}
                            >
                              {h.priceTime.length > 10 ? h.priceTime.slice(5, 16) : h.priceTime.slice(5)}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Cost */}
                      <td className="px-3 py-3 text-right">
                        <span className="text-sm font-mono text-gray-400">
                          {fmtCNY(h.costPerUnit, h.costPerUnit < 10 ? 3 : 2)}
                        </span>
                      </td>
                      {/* Quantity */}
                      <td className="px-3 py-3 text-right">
                        <span className="text-xs font-mono text-gray-400">
                          {fmtNum(h.quantity)}
                        </span>
                      </td>
                      {/* Holding days */}
                      <td className="px-3 py-3 text-right">
                        <span className="text-xs text-gray-500">
                          {h.holdingDays != null ? `${h.holdingDays}天` : '—'}
                        </span>
                      </td>
                      {/* Action */}
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => setEditHolding(h)}
                          className="text-gray-500 hover:text-accent transition-colors p-1 rounded"
                          title="更新价格"
                        >
                          <Edit2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <PriceModal holding={editHolding} onClose={() => setEditHolding(null)} />
      {refreshResult && (
        <RefreshToast result={refreshResult} onClose={() => setRefreshResult(null)} />
      )}
    </div>
  )
}
