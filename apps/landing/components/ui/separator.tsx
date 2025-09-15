"use client";
import * as React from 'react'
import * as RadixSeparator from '@radix-ui/react-separator'
import { cn } from '@/lib/utils'

type Props = React.ComponentPropsWithoutRef<typeof RadixSeparator.Root> & {
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
}

export function Separator({ className, orientation = 'horizontal', decorative = true, ...props }: Props) {
  return (
    <RadixSeparator.Root
      orientation={orientation}
      decorative={decorative}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className
      )}
      {...props}
    />
  )
}


