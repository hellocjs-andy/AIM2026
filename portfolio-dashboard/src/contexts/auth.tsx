import { createContext, useContext, useState, useCallback } from 'react'

const VALID_USER = 'hellocjs'
const VALID_PASS = 'andy19831204'

const KEY_EXPIRES  = 'aim_auth_expires'   // timestamp ms, or 'forever'
const KEY_DURATION = 'aim_session_min'    // minutes, -1 = forever

export const SESSION_OPTIONS = [
  { label: '30 分钟', minutes: 30 },
  { label: '2 小时',  minutes: 120 },
  { label: '8 小时',  minutes: 480 },
  { label: '24 小时', minutes: 1440 },
  { label: '7 天',    minutes: 10080 },
  { label: '永久',    minutes: -1 },
]

function isSessionValid(): boolean {
  const raw = localStorage.getItem(KEY_EXPIRES)
  if (!raw) return false
  if (raw === 'forever') return true
  return Date.now() < parseInt(raw, 10)
}

function calcExpires(minutes: number): string {
  if (minutes === -1) return 'forever'
  return String(Date.now() + minutes * 60 * 1000)
}

function getSavedDuration(): number {
  const v = parseInt(localStorage.getItem(KEY_DURATION) ?? '30', 10)
  return isNaN(v) ? 30 : v
}

interface AuthCtx {
  isAuthenticated: boolean
  sessionMinutes: number
  login: (user: string, pass: string) => boolean
  logout: () => void
  setSessionMinutes: (m: number) => void
}

const Ctx = createContext<AuthCtx>({
  isAuthenticated: false,
  sessionMinutes: 30,
  login: () => false,
  logout: () => {},
  setSessionMinutes: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(isSessionValid)
  const [sessionMinutes, setSessionMinutesState] = useState(getSavedDuration)

  const login = useCallback((user: string, pass: string): boolean => {
    if (user === VALID_USER && pass === VALID_PASS) {
      const duration = getSavedDuration()
      localStorage.setItem(KEY_EXPIRES, calcExpires(duration))
      setAuthenticated(true)
      return true
    }
    return false
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(KEY_EXPIRES)
    setAuthenticated(false)
  }, [])

  const setSessionMinutes = useCallback((m: number) => {
    localStorage.setItem(KEY_DURATION, String(m))
    setSessionMinutesState(m)
    // If logged in, extend expiry based on new duration from now
    if (authenticated) {
      localStorage.setItem(KEY_EXPIRES, calcExpires(m))
    }
  }, [authenticated])

  return (
    <Ctx.Provider value={{ isAuthenticated: authenticated, sessionMinutes, login, logout, setSessionMinutes }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  return useContext(Ctx)
}
