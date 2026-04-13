import { usePrivacy } from '../../contexts/privacy'

/** Wraps a formatted monetary string. Shows •••• when privacy mode is on. */
export function Num({ children }: { children: React.ReactNode }) {
  const { hidden } = usePrivacy()
  if (hidden) {
    return (
      <span
        style={{ filter: 'blur(6px)', userSelect: 'none', display: 'inline-block' }}
        aria-hidden
      >
        {children}
      </span>
    )
  }
  return <>{children}</>
}
