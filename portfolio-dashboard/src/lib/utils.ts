import dayjs from 'dayjs'

// ── Number formatting ─────────────────────────────────────────────────────────

/** Format yuan amount: ¥1,234,567.89 */
export function fmtCNY(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  const formatted = abs.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return `${sign}¥${formatted}`
}

/** Format a compact amount: ¥1.23万 / ¥123.45万 */
export function fmtCNYCompact(v: number | null | undefined): string {
  if (v == null) return '—'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000) {
    return `${sign}¥${(abs / 10_000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })}万`
  }
  if (abs >= 10_000) {
    return `${sign}¥${(abs / 10_000).toFixed(2)}万`
  }
  return `${sign}¥${abs.toFixed(2)}`
}

/** Format percent: +6.52% */
export function fmtPct(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—'
  const sign = v >= 0 ? '+' : ''
  return `${sign}${(v * 100).toFixed(decimals)}%`
}

/** Format percent without + sign */
export function fmtPctAbs(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—'
  return `${(v * 100).toFixed(decimals)}%`
}

/** Format a plain number with commas */
export function fmtNum(v: number | null | undefined, decimals = 0): string {
  if (v == null) return '—'
  return v.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Format a P&L amount with sign: +¥1,234.56 */
export function fmtPnL(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—'
  const sign = v >= 0 ? '+' : ''
  return `${sign}${fmtCNY(v, decimals)}`
}

// ── P&L color utilities ───────────────────────────────────────────────────────

export function pnlColor(v: number | null | undefined): string {
  if (v == null || v === 0) return 'text-gray-400'
  return v > 0 ? 'text-profit' : 'text-loss'
}

export function pnlBgColor(v: number | null | undefined): string {
  if (v == null || v === 0) return 'bg-gray-700 text-gray-300'
  return v > 0 ? 'bg-profit/20 text-profit' : 'bg-loss/20 text-loss'
}

// ── Date formatting ───────────────────────────────────────────────────────────

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  return dayjs(d).format('YYYY-MM-DD')
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  return dayjs(d).format('YYYY-MM-DD HH:mm')
}

/** Day of year: 1-365/366 */
export function dayOfYear(date: dayjs.Dayjs = dayjs()): number {
  return date.diff(date.startOf('year'), 'day') + 1
}

/** Total days in current year */
export function daysInYear(year: number = dayjs().year()): number {
  return dayjs(`${year}-12-31`).diff(dayjs(`${year}-01-01`), 'day') + 1
}

// ── Asset type detection ──────────────────────────────────────────────────────

const ETF_PREFIXES = ['159', '510', '511', '512', '513', '515', '516', '517', '518']
const FUND_SHORT_CODES = [/^\d{5}$/, /^\d{6}$/ ] // 5 or 6 digit non-exchange codes

export function detectAssetType(code: string): 'stock' | 'fund' {
  const s = String(code).trim()
  if (ETF_PREFIXES.some(p => s.startsWith(p))) return 'fund'
  // Non-exchange mutual fund codes (typically start with 0,1,4,5,6,7,8 and are 6 digits)
  if (/^[014-9]\d{5}$/.test(s) && !s.startsWith('300') && !s.startsWith('600') &&
      !s.startsWith('601') && !s.startsWith('603') && !s.startsWith('605') &&
      !s.startsWith('688') && !s.startsWith('002') && !s.startsWith('000') &&
      !s.startsWith('001') && !s.startsWith('003')) {
    return 'fund'
  }
  void FUND_SHORT_CODES // suppress unused warning
  return 'stock'
}

// ── Miscellaneous ─────────────────────────────────────────────────────────────

export function clsx(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function isDefined<T>(v: T | null | undefined): v is T {
  return v != null
}
