import { useState } from 'react'
import { TrendingUp, Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react'
import { useAuth } from '../contexts/auth'
import { clsx } from '../lib/utils'

export default function LoginPage() {
  const { login } = useAuth()
  const [user, setUser]       = useState('')
  const [pass, setPass]       = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!user.trim() || !pass) { setError('请输入用户名和密码'); return }
    setLoading(true)
    setTimeout(() => {
      const ok = login(user.trim(), pass)
      if (!ok) { setError('用户名或密码错误'); setLoading(false) }
    }, 400)
  }

  return (
    <div className="min-h-screen bg-surface-1 flex items-center justify-center px-4">
      {/* Background grid */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(99,102,241,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,.05) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-3 shadow-lg shadow-accent/30">
            <TrendingUp size={22} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-100 tracking-tight">持仓看板</h1>
          <p className="text-xs text-gray-500 mt-1">AIM Portfolio · 请先登录</p>
        </div>

        {/* Card */}
        <div className="bg-surface-2 border border-border rounded-2xl p-6 shadow-2xl space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                用户名
              </label>
              <input
                type="text"
                autoComplete="username"
                value={user}
                onChange={e => { setUser(e.target.value); setError('') }}
                placeholder="请输入用户名"
                className={clsx(
                  'w-full bg-surface-3 border rounded-lg px-3 py-2.5 text-sm text-gray-100',
                  'placeholder:text-gray-600 font-mono',
                  'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50',
                  'transition-colors',
                  error ? 'border-loss/60' : 'border-border',
                )}
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                密码
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={pass}
                  onChange={e => { setPass(e.target.value); setError('') }}
                  placeholder="请输入密码"
                  className={clsx(
                    'w-full bg-surface-3 border rounded-lg px-3 py-2.5 pr-10 text-sm text-gray-100',
                    'placeholder:text-gray-600 font-mono',
                    'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50',
                    'transition-colors',
                    error ? 'border-loss/60' : 'border-border',
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-loss/10 border border-loss/30 rounded-lg px-3 py-2">
                <AlertCircle size={13} className="text-loss flex-shrink-0" />
                <p className="text-xs text-loss">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className={clsx(
                'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all',
                'bg-accent hover:bg-accent-hover text-white',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                'focus:outline-none focus:ring-2 focus:ring-accent/50',
              )}
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <LogIn size={15} />
              )}
              {loading ? '登录中…' : '登 录'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-600">
            登录后可在设置中调整会话时长
          </p>
        </div>
      </div>
    </div>
  )
}
