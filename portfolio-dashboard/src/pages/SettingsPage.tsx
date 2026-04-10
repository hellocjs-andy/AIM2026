import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, RefreshCw, Settings, Target, Calendar, CheckCircle, AlertCircle, Wallet } from 'lucide-react'
import { settingsApi } from '../api/client'
import { fmtCNY, fmtPct } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

export default function SettingsPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ year_target_rate: '', year_start_value: '', stock_cash: '', fund_cash: '' })
  const [saved, setSaved] = useState(false)

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  })

  useEffect(() => {
    if (settings) {
      setForm({
        year_target_rate: settings.year_target_rate ?? '0.30',
        year_start_value: settings.year_start_value ?? '0',
        stock_cash:       settings.stock_cash        ?? '0',
        fund_cash:        settings.fund_cash         ?? '0',
      })
    }
  }, [settings])

  const save = useMutation({
    mutationFn: () => settingsApi.update(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  const targetRate = parseFloat(form.year_target_rate) || 0
  const startValue = parseFloat(form.year_start_value) || 0
  const targetPnL = startValue * targetRate

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border bg-surface-2/50 backdrop-blur-sm sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold text-gray-100">系统设置</h1>
          <p className="text-xs text-gray-500">年度目标与基准配置</p>
        </div>
        <Button
          size="sm"
          loading={save.isPending}
          icon={saved ? <CheckCircle size={14} /> : <Save size={14} />}
          onClick={() => save.mutate()}
        >
          {saved ? '已保存' : '保存设置'}
        </Button>
      </div>

      <div className="px-4 sm:px-6 py-6 max-w-2xl space-y-6">
        {/* Connection error */}
        {!isLoading && !settings && (
          <div className="flex items-center gap-3 bg-loss/10 border border-loss/30 rounded-xl px-4 py-3">
            <AlertCircle size={16} className="text-loss flex-shrink-0" />
            <p className="text-sm text-gray-300">无法连接到后端服务，以下修改将在连接恢复后生效。</p>
          </div>
        )}

        {/* Year Target */}
        <div className="bg-surface-2 border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Target size={16} className="text-accent" />
            <h2 className="text-sm font-semibold text-gray-200">年度目标收益率</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="目标收益率（小数）"
              type="number"
              step="0.01"
              min="0"
              max="5"
              value={form.year_target_rate}
              onChange={e => setForm(f => ({ ...f, year_target_rate: e.target.value }))}
              hint={`例如 0.30 表示 30%，当前：${fmtPct(targetRate, 0)}`}
            />
            <div className="bg-surface-3 rounded-lg p-3 self-end mb-1">
              <p className="text-xs text-gray-500 mb-1">对应目标盈利额</p>
              <p className="text-base font-bold font-mono text-accent">
                {startValue > 0 ? fmtCNY(targetPnL, 0) : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Year Start Value */}
        <div className="bg-surface-2 border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-accent" />
            <h2 className="text-sm font-semibold text-gray-200">年初资产基准</h2>
          </div>
          <Input
            label="年初总资产（元）"
            type="number"
            step="1"
            min="0"
            value={form.year_start_value}
            onChange={e => setForm(f => ({ ...f, year_start_value: e.target.value }))}
            hint={`当前：${startValue > 0 ? fmtCNY(startValue, 0) : '未设置'} — 用于计算今年收益率和目标达成进度`}
          />
          <div className="bg-surface-3 rounded-lg px-4 py-3 text-xs text-gray-500 space-y-1">
            <p>· 建议设置为 <strong className="text-gray-300">上一年最后一个交易日</strong> 的总资产</p>
            <p>· 修改后，概览页的"今年收益率"和"年度目标追踪"将立即更新</p>
          </div>
        </div>

        {/* Cash Accounts */}
        <div className="bg-surface-2 border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-gray-200">现金账户</h2>
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            股票和基金账户中未投资的资金，将计入总资产，用于准确反映真实资产规模
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="股票账户现金余额（元）"
              type="number"
              step="1"
              min="0"
              value={form.stock_cash}
              onChange={e => setForm(f => ({ ...f, stock_cash: e.target.value }))}
              hint="股票买卖后在股票账户的闲置资金"
            />
            <Input
              label="基金货币基金账户（元）"
              type="number"
              step="1"
              min="0"
              value={form.fund_cash}
              onChange={e => setForm(f => ({ ...f, fund_cash: e.target.value }))}
              hint="基金账户中的货币基金或待申购资金"
            />
          </div>
          <div className="bg-surface-3 rounded-lg px-4 py-3 text-xs text-gray-500">
            <p>· 两账户合计将显示在概览页总资产和持仓页现金账户区块</p>
            <p>· 建议每次买卖后同步更新，保持总资产数据准确</p>
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center justify-end gap-3">
          {save.isError && (
            <p className="text-xs text-loss">{(save.error as Error)?.message}</p>
          )}
          {saved && (
            <p className="text-xs text-profit flex items-center gap-1">
              <CheckCircle size={12} /> 保存成功
            </p>
          )}
          <Button
            loading={save.isPending || isLoading}
            icon={isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            onClick={() => save.mutate()}
          >
            保存设置
          </Button>
        </div>

        {/* Info section */}
        <div className="bg-surface-2 border border-border rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Settings size={15} className="text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-400">其他信息</h2>
          </div>
          <div className="text-xs text-gray-500 space-y-2">
            <div className="flex justify-between">
              <span>前端版本</span>
              <span className="font-mono">AIM Portfolio v1.0</span>
            </div>
            <div className="flex justify-between">
              <span>后端地址</span>
              <span className="font-mono text-gray-400">
                {import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
