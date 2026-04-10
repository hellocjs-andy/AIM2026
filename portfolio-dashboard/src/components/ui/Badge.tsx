import { clsx } from '../../lib/utils'

type BadgeVariant = 'default' | 'profit' | 'loss' | 'neutral' | 'blue' | 'amber'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variants: Record<BadgeVariant, string> = {
  default: 'bg-surface-4 text-gray-300',
  profit: 'bg-profit/15 text-profit border border-profit/20',
  loss: 'bg-loss/15 text-loss border border-loss/20',
  neutral: 'bg-gray-700/50 text-gray-400 border border-gray-600/30',
  blue: 'bg-accent/15 text-accent border border-accent/20',
  amber: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
      variants[variant],
      className,
    )}>
      {children}
    </span>
  )
}
