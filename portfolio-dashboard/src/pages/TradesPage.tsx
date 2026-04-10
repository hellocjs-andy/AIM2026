import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, RefreshCw, Pencil, Trash2, X, Filter, Upload, Download, CheckCircle, AlertCircle } from 'lucide-react'
import dayjs from 'dayjs'
import { tradesApi } from '../api/client'
import type { Trade, TradeFormData, TradeFilter } from '../types'
import { TRADE_TYPES } from '../types'
import { fmtCNY, fmtPnL, fmtDate, pnlColor, clsx } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input, Select } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Pagination } from '../components/ui/Pagination'

// ── Trade badge color by type ─────────────────────────────────────────────────
function tradeBadge(type: string) {
  if (type === '买入' || type === '申购') return 'loss'
  if (type === '卖出' || type === '赎回') return 'profit'
  if (type === '红利再投' || type === '分红' || type === '除权除息') return 'amber'
  return 'neutral'
}

// ── Trade Form Modal ──────────────────────────────────────────────────────────
const EMPTY_FORM: TradeFormData = {
  tradeDate: new Date().toISOString().slice(0, 10),
  tradeTime: '',
  code: '',
  name: '',
  type: '买入',
  quantity: 0,
  price: null,
  amount: 0,
  dealAmount: 0,
  fee: 0,
  note: '',
}

function TradeFormModal({
  trade,
  onClose,
}: {
  trade: Trade | null
  onClose: () => void
}) {
  const isEdit = trade !== null
  const qc = useQueryClient()
  const [form, setForm] = useState<TradeFormData>(
    trade
      ? {
          tradeDate: trade.tradeDate,
          tradeTime: trade.tradeTime ?? '',
          code: trade.code,
          name: trade.name,
          type: trade.type,
          quantity: trade.quantity,
          price: trade.price ?? null,
          amount: trade.amount,
          dealAmount: trade.dealAmount,
          fee: trade.fee,
          note: trade.note ?? '',
        }
      : { ...EMPTY_FORM },
  )
  const [errors, setErrors] = useState<Partial<Record<keyof TradeFormData, string>>>({})

  const create = useMutation({
    mutationFn: tradesApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trades'] }); onClose() },
    onError: (e: Error) => setErrors({ code: e.message }),
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TradeFormData> }) =>
      tradesApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trades'] }); onClose() },
    onError: (e: Error) => setErrors({ code: e.message }),
  })

  const set = (k: keyof TradeFormData, v: string | number) =>
    setForm(f => ({ ...f, [k]: v }))

  const validate = (): boolean => {
    const e: typeof errors = {}
    if (!form.tradeDate) e.tradeDate = '请输入日期'
    if (!form.code) e.code = '请输入代码'
    if (!form.name) e.name = '请输入名称'
    if (!form.type) e.type = '请选择类型'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    if (isEdit && trade) {
      update.mutate({ id: trade.id, data: form })
    } else {
      create.mutate(form)
    }
  }

  const isPending = create.isPending || update.isPending

  const typeOptions = TRADE_TYPES.map(t => ({ value: t, label: t }))

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `编辑交易 #${trade?.id}` : '新增交易记录'}
      size="xl"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" loading={isPending} onClick={handleSubmit}>
            {isEdit ? '保存修改' : '添加交易'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="成交日期 *"
          type="date"
          value={form.tradeDate}
          onChange={e => set('tradeDate', e.target.value)}
          error={errors.tradeDate}
        />
        <Input
          label="成交时间"
          type="time"
          step="1"
          value={form.tradeTime ?? ''}
          onChange={e => set('tradeTime', e.target.value)}
        />
        <Input
          label="代码 *"
          value={form.code}
          onChange={e => set('code', e.target.value)}
          placeholder="如 159915"
          error={errors.code}
        />
        <Input
          label="名称 *"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="如 创业板ETF"
          error={errors.name}
        />
        <Select
          label="交易类别 *"
          value={form.type}
          onChange={e => set('type', e.target.value)}
          options={typeOptions}
          error={errors.type}
        />
        <Input
          label="成交数量"
          type="number"
          value={String(form.quantity)}
          onChange={e => set('quantity', parseFloat(e.target.value) || 0)}
          placeholder="0"
        />
        <Input
          label="成交价格"
          type="number"
          step="0.001"
          value={form.price != null ? String(form.price) : ''}
          onChange={e => set('price', parseFloat(e.target.value) || 0)}
          placeholder="可选"
        />
        <Input
          label="成交金额"
          type="number"
          value={String(form.dealAmount)}
          onChange={e => set('dealAmount', parseFloat(e.target.value) || 0)}
          placeholder="0"
          hint="不含手续费的绝对金额"
        />
        <Input
          label="发生金额"
          type="number"
          value={String(form.amount)}
          onChange={e => set('amount', parseFloat(e.target.value) || 0)}
          placeholder="负=买入，正=卖出"
          hint="净现金流：买入为负，卖出为正"
        />
        <Input
          label="费用"
          type="number"
          step="0.01"
          value={String(form.fee)}
          onChange={e => set('fee', parseFloat(e.target.value) || 0)}
          placeholder="0"
        />
        <div className="sm:col-span-2">
          <Input
            label="备注"
            value={form.note ?? ''}
            onChange={e => set('note', e.target.value)}
            placeholder="可选备注"
          />
        </div>
      </div>
    </Modal>
  )
}

// ── Delete Confirm ────────────────────────────────────────────────────────────
function DeleteModal({ id, onClose }: { id: number | null; onClose: () => void }) {
  const qc = useQueryClient()
  const del = useMutation({
    mutationFn: () => tradesApi.delete(id!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trades'] }); onClose() },
  })
  if (id === null) return null
  return (
    <Modal
      open
      onClose={onClose}
      title="确认删除"
      size="sm"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button variant="danger" size="sm" loading={del.isPending} onClick={() => del.mutate()}>
            确认删除
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-400">
        确定要删除交易记录 <span className="text-gray-200 font-medium">#{id}</span> 吗？此操作不可撤销。
      </p>
    </Modal>
  )
}

// ── 导入结果 Toast ────────────────────────────────────────────────────────────
function ImportToast({
  result,
  onDismiss,
}: {
  result: { imported: number; skipped: number } | { error: string } | null
  onDismiss: () => void
}) {
  if (!result) return null
  const isError = 'error' in result
  return (
    <div className={clsx(
      'flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm',
      isError
        ? 'bg-loss/10 border-loss/30 text-loss'
        : 'bg-profit/10 border-profit/30 text-profit',
    )}>
      {isError
        ? <AlertCircle size={15} className="flex-shrink-0" />
        : <CheckCircle size={15} className="flex-shrink-0" />}
      <span className="flex-1">
        {isError
          ? `导入失败：${'error' in result ? result.error : ''}`
          : `成功导入 ${'imported' in result ? result.imported : 0} 条${'skipped' in result && result.skipped > 0 ? `，跳过 ${result.skipped} 条` : ''}，持仓已同步更新`}
      </span>
      <button onClick={onDismiss} className="text-current opacity-60 hover:opacity-100 p-0.5">
        <X size={13} />
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TradesPage() {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<TradeFilter>({})
  const [tempFilters, setTempFilters] = useState<TradeFilter>({})
  const [showFilters, setShowFilters] = useState(false)

  const [editTrade, setEditTrade] = useState<Trade | null | 'new'>('new')
  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | { error: string } | null>(null)

  const PAGE_SIZE = 20
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['trades', page, filters],
    queryFn: () => tradesApi.getList({ ...filters, page, pageSize: PAGE_SIZE }),
  })

  // ── CSV 导出 ──────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      const blob = await tradesApi.exportCSV()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `trades_${dayjs().format('YYYYMMDD')}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setImportResult({ error: (e as Error).message })
    }
  }

  // ── CSV 导入 ──────────────────────────────────────────────────────────────────
  const importMutation = useMutation({
    mutationFn: tradesApi.importCSV,
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: ['trades'] })
      qc.invalidateQueries({ queryKey: ['holdings'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
      setImportResult(result)
      setPage(1)
    },
    onError: (e: Error) => setImportResult({ error: e.message }),
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => importMutation.mutate(ev.target?.result as string)
    reader.readAsText(file, 'utf-8')
    e.target.value = '' // 允许同一文件重复上传
  }

  const applyFilters = () => {
    setFilters(tempFilters)
    setPage(1)
    setShowFilters(false)
  }

  const resetFilters = () => {
    setTempFilters({})
    setFilters({})
    setPage(1)
  }

  const hasFilters = Object.values(filters).some(v => v !== undefined && v !== '')

  const trades = query.data?.items ?? []
  const total = query.data?.total ?? 0

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border bg-surface-2/50 backdrop-blur-sm sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold text-gray-100">交易记录</h1>
          <p className="text-xs text-gray-500">共 {total} 条记录</p>
        </div>
        <div className="flex items-center gap-2">
          {/* 隐藏文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            size="sm"
            icon={<Upload size={14} />}
            loading={importMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="hidden sm:inline">导入 CSV</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<Download size={14} />}
            onClick={handleExport}
          >
            <span className="hidden sm:inline">导出 CSV</span>
          </Button>
          <Button
            variant={showFilters ? 'secondary' : 'outline'}
            size="sm"
            icon={<Filter size={14} />}
            onClick={() => setShowFilters(v => !v)}
          >
            <span className="hidden sm:inline">筛选</span>
            {hasFilters && (
              <span className="ml-1 bg-accent text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                !
              </span>
            )}
          </Button>
          <Button
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => { setEditTrade(null); setShowForm(true) }}
          >
            <span className="hidden sm:inline">新增交易</span>
          </Button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-4">
        {/* 导入结果提示 */}
        <ImportToast result={importResult} onDismiss={() => setImportResult(null)} />
        {/* Filter panel */}
        {showFilters && (
          <div className="bg-surface-2 border border-border rounded-xl p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Input
                label="代码"
                value={tempFilters.code ?? ''}
                onChange={e => setTempFilters(f => ({ ...f, code: e.target.value }))}
                placeholder="如 159915"
              />
              <Select
                label="交易类别"
                value={tempFilters.type ?? ''}
                onChange={e => setTempFilters(f => ({ ...f, type: e.target.value }))}
                options={TRADE_TYPES.map(t => ({ value: t, label: t }))}
                placeholder="全部类型"
              />
              <Input
                label="开始日期"
                type="date"
                value={tempFilters.startDate ?? ''}
                onChange={e => setTempFilters(f => ({ ...f, startDate: e.target.value }))}
              />
              <Input
                label="结束日期"
                type="date"
                value={tempFilters.endDate ?? ''}
                onChange={e => setTempFilters(f => ({ ...f, endDate: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-end gap-2 mt-3">
              <Button variant="ghost" size="sm" icon={<X size={13} />} onClick={resetFilters}>
                重置
              </Button>
              <Button size="sm" icon={<Search size={13} />} onClick={applyFilters}>
                查询
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-3 border-b border-border">
                <tr>
                  {['#', '日期', '时间', '代码', '名称', '类型', '数量', '价格', '发生金额', '成交金额', '费用', '备注', '操作'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {query.isLoading ? (
                  <tr>
                    <td colSpan={13} className="text-center py-12 text-gray-500">
                      <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
                      加载中…
                    </td>
                  </tr>
                ) : trades.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="text-center py-12 text-gray-500">
                      暂无交易记录
                    </td>
                  </tr>
                ) : (
                  trades.map(t => (
                    <tr key={t.id} className="hover:bg-surface-3/40 transition-colors">
                      <td className="px-3 py-2.5 text-xs font-mono text-gray-600">#{t.id}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-gray-400 whitespace-nowrap">
                        {fmtDate(t.tradeDate)}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-gray-600 whitespace-nowrap">
                        {t.tradeTime ? t.tradeTime.slice(0, 5) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-gray-400">{t.code}</td>
                      <td className="px-3 py-2.5 text-sm text-gray-200 whitespace-nowrap">{t.name}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant={tradeBadge(t.type)}>{t.type}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-gray-400 text-right">
                        {t.quantity.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-gray-400 text-right">
                        {t.price != null ? fmtCNY(t.price, 3) : '—'}
                      </td>
                      <td className={clsx('px-3 py-2.5 text-sm font-mono text-right whitespace-nowrap', pnlColor(t.amount))}>
                        {fmtPnL(t.amount)}
                      </td>
                      <td className="px-3 py-2.5 text-sm font-mono text-gray-300 text-right whitespace-nowrap">
                        {fmtCNY(t.dealAmount)}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-gray-500 text-right">
                        {t.fee > 0 ? fmtCNY(t.fee) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[120px] truncate">
                        {t.note ?? '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => { setEditTrade(t); setShowForm(true) }}
                            className="text-gray-500 hover:text-accent transition-colors p-1 rounded"
                            title="编辑"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => setDeleteId(t.id)}
                            className="text-gray-500 hover:text-loss transition-colors p-1 rounded"
                            title="删除"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="px-4 py-3 border-t border-border">
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onChange={setPage}
              />
            </div>
          )}
        </div>
      </div>

      {/* Trade form modal */}
      {showForm && (
        <TradeFormModal
          trade={editTrade === 'new' || editTrade === null ? null : editTrade}
          onClose={() => { setShowForm(false); setEditTrade('new') }}
        />
      )}

      {/* Delete confirm modal */}
      <DeleteModal id={deleteId} onClose={() => setDeleteId(null)} />
    </div>
  )
}
