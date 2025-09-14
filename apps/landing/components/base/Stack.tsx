import React from 'react'

export default function Stack({ children, gap = 'md', className = '' }: { children: React.ReactNode; gap?: 'sm'|'md'|'lg'; className?: string }) {
  const space = gap === 'sm' ? 'space-y-3' : gap === 'lg' ? 'space-y-8' : 'space-y-5'
  return <div className={`${space} ${className}`}>{children}</div>
}


