import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Target, ChevronDown, ChevronRight, Wallet, Check, X } from 'lucide-react'
import { holdingsApi, settingsApi } from '../api/client'
import type { Holding } from '../types/index'
import { fmtCNY, fmtPct, clsx } from '../lib/utils'
import { Button } from '../components/ui/Button'

// ── Types ──────────────────────────────────────────────────────────────────────

type AllocCategory = 'growth' | 'aggressive' | 'stable_gold' | 'stable_nikkei' | 'flexible'

interface AllocationTargets {
  growth: number
  aggressive: number
  stable_gold: number
  stable_nikkei: number
  flexible: number
}

type AllocationConfig = Record<string, AllocCategory>

// ── Constants ──────────────────────────────────────────────────────────────────

const CAT_META: Record<AllocCategory, { label: string; color: string }> = {
  growth:        { label: '成长型',    color: '#6366f1' },
  aggressive:    { label: '进攻型',    color: '#f59e0b' },
  stable_gold:   { label: '稳健·黄金', color: '#eab308' },
  stable_nikkei: { label: '稳健·日经', color: '#06b6d4' },
  flexible:      { label: '机动',      color: '#94a3b8' },
}

const SECTION_META = [
  {
    key: 'growth' as const,
    label: '成长型', icon: '📈',
    color: '#6366f1', textColor: 'text-indigo-400',
    cats: ['growth'] as AllocCategory[],
    targetKeys: ['growth'] as (keyof AllocationTargets)[],
    desc: '创业板、双创、宁德、打新相关及成长型基金',
    subSections: null,
  },
  {
    key: 'aggressive' as const,
    label: '进攻型', icon: '🚀',
    color: '#f59e0b', textColor: 'text-amber-400',
    cats: ['aggressive'] as AllocCategory[],
    targetKeys: ['aggressive'] as (keyof AllocationTargets)[],
    desc: '通信ETF、半导体、科技成长主题基金',
    subSections: null,
  },
  {
    key: 'stable' as const,
    label: '稳健', icon: '🛡️',
    color: '#eab308', textColor: 'text-yellow-400',
    cats: ['stable_gold', 'stable_nikkei'] as AllocCategory[],
    targetKeys: ['stable_gold', 'stable_nikkei'] as (keyof AllocationTargets)[],
    desc: '黄金有色（目标5%）+ 日经225（目标5%）',
    subSections: [
      { cat: 'stable_gold' as AllocCategory, label: '黄金 / 有色', targetKey: 'stable_gold' as keyof AllocationTargets, color: '#eab308' },
      { cat: 'stable_nikkei' as AllocCategory, label: '日经 225',   targetKey: 'stable_nikkei' as keyof AllocationTargets, color: '#06b6d4' },
    ],
  },
  {
    key: 'flexible' as const,
    label: '机动', icon: '⚙️',
    color: '#94a3b8', textColor: 'text-slate-400',
    cats: ['flexible'] as AllocCategory[],
    targetKeys: ['flexible'] as (keyof AllocationTargets)[],
    desc: '债券基金、货币基金及现金账户',
    subSections: null,
  },
]

const DEFAULT_TARGETS: AllocationTargets = {
  growth: 0.60, aggressive: 0.20, stable_gold: 0.05, stable_nikkei: 0.05, flexible: 0.10,
}

const DEFAULT_CONFIG: AllocationConfig = {
  '159915': 'growth',  '300308': 'growth',  '300502': 'growth',  '300394': 'growth',
  '300750': 'growth',  '159783': 'growth',  '688525': 'growth',  '688008': 'growth',
  '603986': 'growth',  '600118': 'growth',  '000746': 'growth',  '310358': 'growth',
  '515880': 'aggressive', '016371': 'aggressive', '025209': 'aggressive', '021528': 'aggressive',
  '022365': 'aggressive', '015790': 'aggressive', '010052': 'aggressive', '025833': 'aggressive',
  '016531': 'aggressive', '023889': 'aggressive', '006345': 'aggressive', '006250': 'aggressive',
  '017736': 'aggressive', '001410': 'aggressive', '024170': 'aggressive',
  '518850': 'stable_gold',  '601899': 'stable_gold',  '009033': 'stable_gold',  '004253': 'stable_gold',
  '513000': 'stable_nikkei',
  '110017': 'flexible',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function gapColor(gap: number) {
  const abs = Math.abs(gap)
  if (abs < 0.005) return 'text-gray-400'
  return gap > 0 ? 'text-profit' : 'text-loss'
}

// ── Holding Row ────────────────────────────────────────────────────────────────

function HoldingRow({
  holding,
  config,
  totalAssets,
  onCategoryChange,
}: {
  holding: Holding
  config: AllocationConfig
  totalAssets: number
  onCategoryChange: (code: string, cat: AllocCategory) => void
}) {
  const cat = (config[holding.code] ?? 'flexible') as AllocCategory
  const pct = totalAssets > 0 ? (holding.value || 0) / totalAssets : 0

  return (
    <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border/30 last:border-0 hover:bg-surface-3/30 transition-colors">
      <span className="font-mono text-xs text-gray-500 w-16 flex-shrink-0">{holding.code}</span>
      <span className="flex-1 text-sm text-gray-200 truncate min-w-0">{holding.name}</span>
      <span className="text-xs font-mono text-gray-500 w-12 text-right flex-shrink-0">{fmtPct(pct, 1)}</span>
      <span className="text-sm font-mono text-gray-300 w-28 text-right flex-shrink-0">{fmtCNY(holding.value || 0)}</span>
      <select
        value={cat}
        onChange={e => onCategoryChange(holding.code, e.target.value as AllocCategory)}
        className="bg-surface-3 border border-border/60 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-accent/50 cursor-pointer w-28 flex-shrink-0"
        style={{ color: CAT_META[cat].color }}
      >
        {(Object.entries(CAT_META) as [AllocCategory, { label: string; color: string }][]).map(([v, m]) => (
          <option key={v} value={v} style={{ color: m.color, backgroundColor: '#1e1e2e' }}>{m.label}</option>
        ))}
      </select>
    </div>
  )
}

// ── Allocation Section ─────────────────────────────────────────────────────────

function AllocationSection({
  section,
  holdings,
  config,
  targets,
  totalAssets,
  cash,
  onCategoryChange,
}: {
  section: typeof SECTION_META[0]
  holdings: Holding[]
  config: AllocationConfig
  targets: AllocationTargets
  totalAssets: number
  cash: number
  onCategoryChange: (code: string, cat: AllocCategory) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const sectionHoldings = holdings.filter(h => section.cats.includes((config[h.code] ?? 'flexible') as AllocCategory))
  const sectionValue = sectionHoldings.reduce((s, h) => s + (h.value || 0), 0)
  const extraValue = section.key === 'flexible' ? cash : 0
  const totalSectionValue = sectionValue + extraValue

  const targetPct = section.targetKeys.reduce((s, k) => s + (targets[k] || 0), 0)
  const actualPct = totalAssets > 0 ? totalSectionValue / totalAssets : 0
  const gap = actualPct - targetPct

  return (
    <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
      {/* Header row */}
      <button
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface-3/40 transition-colors text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <span className="text-base w-6 flex-shrink-0">{section.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-100">{section.label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{section.desc}</p>
        </div>
        {/* Stats */}
        <div className="flex items-center gap-3 sm:gap-5 text-right flex-shrink-0 mr-2">
          <Stat label="目标" value={fmtPct(targetPct, 0)} className="hidden sm:block" />
          <Stat label="实际" value={fmtPct(actualPct, 1)} valueClass={section.textColor} />
          <Stat label="偏差" value={(gap >= 0 ? '+' : '') + fmtPct(gap, 1)} valueClass={gapColor(gap)} />
          <Stat label="市值" value={fmtCNY(totalSectionValue)} className="hidden sm:block" />
        </div>
        <span className="text-gray-500 flex-shrink-0">
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </span>
      </button>

      {/* Progress bar */}
      <div className="px-5 pb-3">
        <div className="relative h-2 bg-surface-3 rounded-full overflow-visible">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(actualPct * 100, 100)}%`, backgroundColor: section.color }}
          />
          {/* Target marker */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-sm bg-gray-200/70"
            style={{ left: `${Math.min(targetPct * 100, 100)}%` }}
          />
        </div>
        <div className="flex justify-end mt-1">
          <span className="text-xs text-gray-600">目标 {fmtPct(targetPct, 0)}</span>
        </div>
      </div>

      {/* Expanded holdings */}
      {expanded && (
        <div className="border-t border-border">
          {section.subSections ? (
            // Stable: show gold and nikkei sub-sections
            section.subSections.map(sub => {
              const subH = holdings.filter(h => (config[h.code] ?? 'flexible') === sub.cat)
              const subV = subH.reduce((s, h) => s + (h.value || 0), 0)
              const subPct = totalAssets > 0 ? subV / totalAssets : 0
              return (
                <div key={sub.cat}>
                  <div className="px-5 py-2 bg-surface-3/30 flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: sub.color }} />
                    <span className="text-xs font-medium text-gray-400">{sub.label}</span>
                    <span className="text-xs text-gray-600">
                      目标 {fmtPct(targets[sub.targetKey] || 0, 0)} · 实际 {fmtPct(subPct, 1)} · 市值 {fmtCNY(subV)}
                    </span>
                  </div>
                  {subH.length > 0
                    ? subH.map(h => (
                        <HoldingRow key={h.code} holding={h} config={config} totalAssets={totalAssets} onCategoryChange={onCategoryChange} />
                      ))
                    : <div className="px-5 py-3 text-xs text-gray-600 italic">暂无持仓</div>
                  }
                </div>
              )
            })
          ) : (
            sectionHoldings.map(h => (
              <HoldingRow key={h.code} holding={h} config={config} totalAssets={totalAssets} onCategoryChange={onCategoryChange} />
            ))
          )}

          {/* Cash row for flexible */}
          {section.key === 'flexible' && extraValue > 0 && (
            <div className="flex items-center gap-3 px-5 py-2.5 border-t border-border/30 bg-surface-3/10">
              <Wallet size={13} className="text-amber-400 w-16 flex-shrink-0" />
              <span className="flex-1 text-sm text-gray-400">现金账户（股票 + 基金余额）</span>
              <span className="text-xs font-mono text-gray-500 w-12 text-right flex-shrink-0">{fmtPct(extraValue / totalAssets, 1)}</span>
              <span className="text-sm font-mono text-amber-300 w-28 text-right flex-shrink-0">{fmtCNY(extraValue)}</span>
              <div className="w-28 flex-shrink-0" />
            </div>
          )}

          {sectionHoldings.length === 0 && section.key !== 'flexible' && (
            <div className="px-5 py-4 text-xs text-gray-600 italic text-center">暂无持仓分配至此类别</div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, valueClass, className }: { label: string; value: string; valueClass?: string; className?: string }) {
  return (
    <div className={clsx('text-right min-w-[48px]', className)}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={clsx('text-sm font-mono font-semibold', valueClass ?? 'text-gray-200')}>{value}</p>
    </div>
  )
}

// ── Edit Targets Modal ────────────────────────────────────────────────────────

function EditTargetsModal({
  targets,
  onSave,
  onClose,
  saving,
}: {
  targets: AllocationTargets
  onSave: (t: AllocationTargets) => void
  onClose: () => void
  saving: boolean
}) {
  const [form, setForm] = useState({
    growth:        String(Math.round((targets.growth || 0) * 100)),
    aggressive:    String(Math.round((targets.aggressive || 0) * 100)),
    stable_gold:   String(Math.round((targets.stable_gold || 0) * 100)),
    stable_nikkei: String(Math.round((targets.stable_nikkei || 0) * 100)),
    flexible:      String(Math.round((targets.flexible || 0) * 100)),
  })

  const sum = Object.values(form).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const valid = Math.abs(sum - 100) < 0.1

  const fields: { key: keyof typeof form; label: string; color: string }[] = [
    { key: 'growth',        label: '成长型',    color: '#6366f1' },
    { key: 'aggressive',    label: '进攻型',    color: '#f59e0b' },
    { key: 'stable_gold',   label: '稳健·黄金', color: '#eab308' },
    { key: 'stable_nikkei', label: '稳健·日经', color: '#06b6d4' },
    { key: 'flexible',      label: '机动',      color: '#94a3b8' },
  ]

  const handleSave = () => {
    if (!valid) return
    onSave({
      growth:        (parseFloat(form.growth) || 0) / 100,
      aggressive:    (parseFloat(form.aggressive) || 0) / 100,
      stable_gold:   (parseFloat(form.stable_gold) || 0) / 100,
      stable_nikkei: (parseFloat(form.stable_nikkei) || 0) / 100,
      flexible:      (parseFloat(form.flexible) || 0) / 100,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-2 border border-border rounded-2xl p-6 w-full max-w-[400px] shadow-2xl mx-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-gray-100">编辑目标配置比例</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 p-1 rounded transition-colors">
            <X size={17} />
          </button>
        </div>

        <div className="space-y-3">
          {fields.map(({ key, label, color }) => (
            <div key={key} className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
              <label className="text-sm text-gray-300 w-28 flex-shrink-0">{label}</label>
              <div className="flex items-center gap-1.5 flex-1">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-16 bg-surface-3 border border-border rounded-md px-2 py-1.5 text-sm font-mono text-gray-100 text-right focus:outline-none focus:border-accent/50"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className={clsx('text-xs', valid ? 'text-profit' : 'text-loss')}>
            总计：{sum.toFixed(0)}%
          </span>
          {!valid && <span className="text-xs text-gray-500">（应等于 100%）</span>}
        </div>

        <div className="flex gap-3 mt-5">
          <Button variant="secondary" className="flex-1" onClick={onClose}>取消</Button>
          <Button
            className="flex-1"
            disabled={!valid}
            loading={saving}
            icon={<Check size={14} />}
            onClick={handleSave}
          >
            保存目标
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AllocationPage() {
  const qc = useQueryClient()
  const [editingTargets, setEditingTargets] = useState(false)

  const { data: holdings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: holdingsApi.getAll,
  })

  const { data: rawSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = rawSettings as any
  const targets: AllocationTargets = settings?.allocation_targets ?? DEFAULT_TARGETS
  const config: AllocationConfig = settings?.allocation_config ?? DEFAULT_CONFIG

  const updateSettings = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: Record<string, any>) => settingsApi.update(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })

  const cash = (parseFloat(settings?.stock_cash) || 0) + (parseFloat(settings?.fund_cash) || 0)
  const investValue = holdings.reduce((s, h) => s + (h.value || 0), 0)
  const totalAssets = investValue + cash

  // Allocation bar segments
  const segments = useMemo(() => (Object.entries(CAT_META) as [AllocCategory, { label: string; color: string }][]).map(([cat, meta]) => {
    const v = holdings.filter(h => (config[h.code] ?? 'flexible') === cat).reduce((s, h) => s + (h.value || 0), 0)
    const extra = cat === 'flexible' ? cash : 0
    return { cat, meta, value: v + extra, pct: totalAssets > 0 ? (v + extra) / totalAssets : 0 }
  }), [holdings, config, cash, totalAssets])

  const handleCategoryChange = (code: string, newCat: AllocCategory) => {
    const newConfig = { ...config, [code]: newCat }
    updateSettings.mutate({ allocation_config: newConfig })
  }

  const handleSaveTargets = (newTargets: AllocationTargets) => {
    updateSettings.mutate({ allocation_targets: newTargets }, {
      onSuccess: () => setEditingTargets(false),
    })
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border bg-surface-2/50 backdrop-blur-sm sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold text-gray-100">资产配置</h1>
          <p className="text-xs text-gray-500">
            总资产 {fmtCNY(totalAssets)} · {holdings.length} 个持仓
          </p>
        </div>
        <Button size="sm" variant="secondary" icon={<Target size={14} />} onClick={() => setEditingTargets(true)}>
          <span className="hidden sm:inline">编辑目标</span>
        </Button>
      </div>

      <div className="px-4 sm:px-6 py-5 space-y-5">
        {/* Allocation stacked bar */}
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-3 font-medium">当前配置分布</p>
          <div className="h-9 rounded-lg overflow-hidden flex gap-px">
            {segments.map(({ cat, meta, pct }) =>
              pct > 0.001 ? (
                <div
                  key={cat}
                  className="h-full flex items-center justify-center overflow-hidden transition-all duration-700"
                  style={{ width: `${pct * 100}%`, backgroundColor: meta.color }}
                  title={`${meta.label}: ${(pct * 100).toFixed(1)}%`}
                >
                  {pct > 0.07 && (
                    <span className="text-xs font-bold text-white drop-shadow-sm">
                      {(pct * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              ) : null
            )}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
            {segments.map(({ cat, meta, pct, value }) => (
              <div key={cat} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: meta.color }} />
                <span className="text-xs text-gray-400">{meta.label}</span>
                <span className="text-xs font-mono text-gray-300">{(pct * 100).toFixed(1)}%</span>
                <span className="text-xs text-gray-600">({fmtCNY(value)})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Section cards */}
        {SECTION_META.map(section => (
          <AllocationSection
            key={section.key}
            section={section}
            holdings={holdings}
            config={config}
            targets={targets}
            totalAssets={totalAssets}
            cash={cash}
            onCategoryChange={handleCategoryChange}
          />
        ))}
      </div>

      {/* Edit targets modal */}
      {editingTargets && (
        <EditTargetsModal
          targets={targets}
          onSave={handleSaveTargets}
          onClose={() => setEditingTargets(false)}
          saving={updateSettings.isPending}
        />
      )}
    </div>
  )
}
