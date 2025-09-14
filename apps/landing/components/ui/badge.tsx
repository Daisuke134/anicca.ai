import React from 'react'
import clsx from 'clsx'

type Props = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: 'default' | 'ink' | 'saffron'
}

export function Badge({ className, tone = 'default', ...props }: Props) {
  const styles = {
    default: 'bg-ivory-200 text-ink-700',
    ink: 'bg-ink-800 text-white',
    saffron: 'bg-saffron-200 text-ink-800',
  }[tone]
  return (
    <span className={clsx('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold', styles, className)}
      {...props}
    />
  )
}


