import { clsx } from '../../lib/utils'
import { forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? label?.replace(/\s+/g, '-').toLowerCase()
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-gray-400">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          {...props}
          className={clsx(
            'w-full bg-surface-3 border rounded-lg px-3 py-2 text-sm text-gray-100',
            'placeholder-gray-600 outline-none transition-colors',
            'focus:border-accent focus:ring-1 focus:ring-accent/30',
            error ? 'border-loss' : 'border-border hover:border-gray-500',
            className,
          )}
        />
        {error && <p className="text-xs text-loss">{error}</p>}
        {!error && hint && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
    )
  },
)
Input.displayName = 'Input'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export function Select({ label, error, options, placeholder, className, id, ...props }: SelectProps) {
  const selectId = id ?? label?.replace(/\s+/g, '-').toLowerCase()
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-medium text-gray-400">
          {label}
        </label>
      )}
      <select
        id={selectId}
        {...props}
        className={clsx(
          'w-full bg-surface-3 border rounded-lg px-3 py-2 text-sm text-gray-100',
          'outline-none transition-colors cursor-pointer',
          'focus:border-accent focus:ring-1 focus:ring-accent/30',
          error ? 'border-loss' : 'border-border hover:border-gray-500',
          className,
        )}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <p className="text-xs text-loss">{error}</p>}
    </div>
  )
}
