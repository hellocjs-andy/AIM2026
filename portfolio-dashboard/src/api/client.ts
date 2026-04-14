import axios from 'axios'
import type {
  DashboardSummary,
  Holding,
  Trade,
  TradeFormData,
  TradeFilter,
  ClosedPosition,
  ClosedPositionFilter,
  Paginated,
  DailySnapshot,
  MonthlySnapshot,
  BenchmarkPrice,
} from '../types'

// ── Refresh prices response ──────────────────────────────────────────────────
export interface RefreshPriceItem {
  code: string
  name: string
  type: 'stock' | 'fund'
  oldPrice?: number
  newPrice?: number
  price?: number
  changeRate?: number
  priceTime?: string | null
}
export interface RefreshPricesResult {
  updated:   RefreshPriceItem[]
  unchanged: RefreshPriceItem[]
  failed:    RefreshPriceItem[]
  fetchedAt: string
}

// ── Axios instance ────────────────────────────────────────────────────────────
// 开发时走 Vite proxy（/api → localhost:8080），生产时用 VITE_API_BASE_URL 覆盖
const BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api'

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.response.use(
  res => res,
  err => {
    const msg: string =
      err?.response?.data?.message ??
      err?.response?.data?.error ??
      err.message ??
      'Unknown error'
    return Promise.reject(new Error(msg))
  },
)

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const dashboardApi = {
  getSummary: () =>
    http.get<DashboardSummary>('/dashboard/summary').then(r => r.data),
}

// ── Holdings ──────────────────────────────────────────────────────────────────
export const holdingsApi = {
  getAll: () =>
    http.get<Holding[]>('/holdings').then(r => r.data),

  updatePrice: (code: string, price: number) =>
    http.put<Holding>(`/holdings/${code}/price`, { price }).then(r => r.data),

  updateType: (code: string, type: 'stock' | 'fund') =>
    http.put<Holding>(`/holdings/${code}/type`, { type }).then(r => r.data),

  refreshPrices: () =>
    http.post<RefreshPricesResult>('/holdings/refresh').then(r => r.data),

  importBulk: (holdings: Partial<Holding>[]) =>
    http.post<{ imported: number }>('/holdings/import', { holdings }).then(r => r.data),
}

// ── Trades ────────────────────────────────────────────────────────────────────
export const tradesApi = {
  getList: (params: TradeFilter = {}) =>
    http
      .get<Paginated<Trade>>('/trades', { params: { pageSize: 20, page: 1, ...params } })
      .then(r => r.data),

  create: (data: TradeFormData) =>
    http.post<Trade>('/trades', data).then(r => r.data),

  update: (id: number, data: Partial<TradeFormData>) =>
    http.put<Trade>(`/trades/${id}`, data).then(r => r.data),

  delete: (id: number) =>
    http.delete<{ success: boolean }>(`/trades/${id}`).then(r => r.data),

  /** 导出全部交易记录为 CSV Blob */
  exportCSV: () =>
    http.get('/trades/export', { responseType: 'blob' }).then(r => r.data as Blob),

  /** 上传 CSV 文本，服务端解析导入 */
  importCSV: (csv: string) =>
    http
      .post<{ imported: number; skipped: number }>('/trades/import', csv, {
        headers: { 'Content-Type': 'text/csv' },
      })
      .then(r => r.data),
}

// ── Closed Positions ──────────────────────────────────────────────────────────
export const closedApi = {
  getList: (params: ClosedPositionFilter = {}) =>
    http
      .get<Paginated<ClosedPosition>>('/closed-positions', { params: { pageSize: 20, page: 1, ...params } })
      .then(r => r.data),

  importBulk: (positions: Partial<ClosedPosition>[]) =>
    http.post<{ imported: number }>('/closed-positions/import', { positions }).then(r => r.data),
}

// ── Settings ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SettingsPayload = Record<string, string | number | Record<string, unknown>>

export const settingsApi = {
  get: () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    http.get<any>('/settings').then(r => r.data),

  update: (settings: SettingsPayload) =>
    http.put<SettingsPayload>('/settings', settings).then(r => r.data),
}

// ── Performance ───────────────────────────────────────────────────────────────
export const performanceApi = {
  getDaily: (params?: { startDate?: string; endDate?: string }) =>
    http.get<DailySnapshot[]>('/performance/daily', { params }).then(r => r.data),
  getMonthly: (year?: number) =>
    http.get<MonthlySnapshot[]>('/performance/monthly', { params: { year } }).then(r => r.data),
}

// ── Benchmarks ────────────────────────────────────────────────────────────────
export const benchmarkApi = {
  getHistory: (params?: { startDate?: string; endDate?: string }) =>
    http.get<BenchmarkPrice[]>('/benchmarks', { params }).then(r => r.data),
  refresh: () =>
    http.post<{ updated: number; date: string }>('/benchmarks/refresh').then(r => r.data),
}
