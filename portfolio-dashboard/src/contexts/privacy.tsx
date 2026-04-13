import { createContext, useContext, useState } from 'react'

interface PrivacyCtx {
  hidden: boolean
  toggle: () => void
}

const Ctx = createContext<PrivacyCtx>({ hidden: false, toggle: () => {} })

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(() => localStorage.getItem('privacy') === '1')

  const toggle = () =>
    setHidden(h => {
      const next = !h
      localStorage.setItem('privacy', next ? '1' : '0')
      return next
    })

  return <Ctx.Provider value={{ hidden, toggle }}>{children}</Ctx.Provider>
}

export function usePrivacy() {
  return useContext(Ctx)
}
