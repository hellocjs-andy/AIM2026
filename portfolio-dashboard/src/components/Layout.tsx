import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  TrendingUp,
  ArrowLeftRight,
  Archive,
  Settings,
  RefreshCw,
  ChevronRight,
  PieChart,
  Eye,
  EyeOff,
} from 'lucide-react'
import { clsx } from '../lib/utils'
import { usePrivacy } from '../contexts/privacy'

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: '概览', end: true },
  { to: '/holdings', icon: TrendingUp, label: '持仓' },
  { to: '/trades', icon: ArrowLeftRight, label: '交易记录' },
  { to: '/closed', icon: Archive, label: '已清仓' },
  { to: '/allocation', icon: PieChart, label: '资产配置' },
  { to: '/settings', icon: Settings, label: '设置' },
]

export default function Layout() {
  const { hidden, toggle } = usePrivacy()
  return (
    <div className="flex h-screen bg-surface-1 text-gray-100 overflow-hidden">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex w-56 flex-shrink-0 bg-surface-2 border-r border-border flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-border">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
              <TrendingUp size={16} className="text-white" />
            </div>
            <span className="font-semibold text-base tracking-tight">持仓看板</span>
          </div>
          <button
            onClick={toggle}
            title={hidden ? '显示金额' : '隐藏金额'}
            className="ml-2 p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-surface-3 transition-colors flex-shrink-0"
          >
            {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-0.5">
          {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent text-white'
                    : 'text-gray-400 hover:text-gray-100 hover:bg-surface-3',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={17} />
                  <span className="flex-1">{label}</span>
                  {isActive && <ChevronRight size={14} className="opacity-60" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <div className="text-xs text-gray-500 space-y-1">
            <div className="flex items-center gap-1.5">
              <RefreshCw size={11} />
              <span>实时行情驱动</span>
            </div>
            <div className="text-gray-600">AIM Portfolio v1.0</div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* Bottom nav — mobile only */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-surface-2 border-t border-border">
        <div className="flex items-stretch justify-around px-1 py-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 px-1 rounded-lg text-[10px] leading-tight transition-colors',
                  isActive ? 'text-accent' : 'text-gray-500',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={19} className={isActive ? 'text-accent' : 'text-gray-500'} />
                  <span className="truncate max-w-full">{label}</span>
                </>
              )}
            </NavLink>
          ))}
          {/* Privacy toggle */}
          <button
            onClick={toggle}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 px-1 rounded-lg text-[10px] leading-tight text-gray-500 transition-colors"
          >
            {hidden
              ? <EyeOff size={19} className="text-accent" />
              : <Eye size={19} />}
            <span className="truncate max-w-full">{hidden ? '显示' : '隐藏'}</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
