import React from 'react'
import clsx from 'clsx'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('rounded-2xl border border-ivory-300 bg-white shadow-sm', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={clsx('text-lg font-semibold text-ink-800', className)} {...props} />
}

export function CardText({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={clsx('text-ink-600', className)} {...props} />
}


