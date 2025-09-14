import * as React from 'react'
import clsx from 'clsx'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

const sizeClass = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-base',
}

const variantClass = {
  primary:
    'bg-ink-800 text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition rounded-xl',
  secondary:
    'bg-ivory-100 text-ink-800 border border-ivory-300 hover:bg-ivory-50 rounded-xl',
  ghost: 'bg-transparent hover:bg-ivory-100 rounded-xl',
}

export function Button({ className, variant = 'primary', size = 'md', ...props }: ButtonProps) {
  return (
    <button
      className={clsx('inline-flex items-center font-semibold', sizeClass[size], variantClass[variant], className)}
      {...props}
    />
  )
}


