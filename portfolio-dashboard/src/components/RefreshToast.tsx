import { useEffect } from 'react'
import { CheckCircle, AlertCircle, X, TrendingUp, TrendingDown } from 'lucide-react'
import type { RefreshPricesResult } from '../api/client'
import { clsx, fmtPct, pnlColor } from '../lib/utils'

interface Props {
  result: RefreshPricesResult
  onClose: () => void
}

/**
 * 行情刷新结果提示 — 右上角浮层
 * - 有更新：绿色 CheckCircle + 更新列表（最多展示 8 条，其余折叠计数）
 * - 无更新：琥珀色 AlertCircle + "没有获取到新价格"
 * - 有失败：底部列出失败的标的
 * 8 秒后自动关闭
 */
export function RefreshToast({ result, onClose }: Props) {
  const { updated, unchanged, failed } = result
  const hasUpdated = updated.length > 0

  useEffect(() => {
    const t = setTimeout(onClose, 8000)
    return () => clearTimeout(t)
  }, [onClose])

  const MAX_SHOW = 8
  const shownUpdated = updated.slice(0, MAX_SHOW)
  const moreUpdated = updated.length - shownUpdated.length

  return (
    <div className="fixed top-4 right-4 left-4 sm:left-auto z-[100] sm:max-w-sm animate-in fade-in slide-in-from-top-2">
      <div
        className={clsx(
          'bg-surface-2 border rounded-xl shadow-xl p-4 space-y-3',
          hasUpdated ? 'border-profit/40' : 'border-amber-500/40',
        )}
      >
        {/* Header */}
        <div className="flex items-start gap-2.5">
          {hasUpdated ? (
            <CheckCircle className="text-profit flex-shrink-0 mt-0.5" size={18} />
          ) : (
            <AlertCircle className="text-amber-400 flex-shrink-0 mt-0.5" size={18} />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-100">
              {hasUpdated
                ? `已更新 ${updated.length} 个标的最新价`
                : '没有更新任何价格'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {hasUpdated
                ? `${unchanged.length} 个无变化，${failed.length} 个未获取到`
                : unchanged.length > 0
                  ? `${unchanged.length} 个价格无变化${failed.length ? `，${failed.length} 个未获取到` : ''}`
                  : failed.length > 0
                    ? `${failed.length} 个标的未获取到最新价`
                    : '所有标的价格均无变化'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 p-0.5 rounded transition-colors flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* Updated list */}
        {shownUpdated.length > 0 && (
          <div className="border-t border-border pt-2.5 space-y-1.5 max-h-64 overflow-y-auto">
            {shownUpdated.map(u => (
              <div
                key={`${u.type}-${u.code}`}
                className="flex flex-col gap-0.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span
                      className={clsx(
                        'px-1 py-px rounded text-[10px] font-mono flex-shrink-0',
                        u.type === 'stock'
                          ? 'bg-blue-500/15 text-blue-400'
                          : 'bg-amber-500/15 text-amber-400',
                      )}
                    >
                      {u.type === 'stock' ? '股' : '基'}
                    </span>
                    <span className="text-gray-300 truncate">{u.name}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 font-mono">
                    <span className="text-gray-500">{u.oldPrice?.toFixed(u.oldPrice && u.oldPrice < 10 ? 3 : 2)}</span>
                    <span className="text-gray-600">→</span>
                    <span className="text-gray-200">
                      {u.newPrice?.toFixed(u.newPrice && u.newPrice < 10 ? 3 : 2)}
                    </span>
                    {u.changeRate != null && (
                      <span className={clsx('ml-1 flex items-center', pnlColor(u.changeRate))}>
                        {u.changeRate >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {fmtPct(u.changeRate)}
                      </span>
                    )}
                  </div>
                </div>
                {u.priceTime && (
                  <div className="text-[10px] text-gray-600 font-mono pl-5">
                    {u.priceTime}
                  </div>
                )}
              </div>
            ))}
            {moreUpdated > 0 && (
              <p className="text-xs text-gray-500 text-center pt-1">
                还有 {moreUpdated} 个标的已更新…
              </p>
            )}
          </div>
        )}

        {/* Failed list */}
        {failed.length > 0 && (
          <div className="border-t border-border pt-2.5">
            <p className="text-xs text-gray-500 mb-1">未获取到价格：</p>
            <div className="flex flex-wrap gap-1">
              {failed.slice(0, 10).map(f => (
                <span
                  key={`${f.type}-${f.code}`}
                  className="text-[11px] bg-surface-3 border border-border rounded px-1.5 py-px text-gray-400"
                  title={f.code}
                >
                  {f.name}
                </span>
              ))}
              {failed.length > 10 && (
                <span className="text-[11px] text-gray-500">+{failed.length - 10}…</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
