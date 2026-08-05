import { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string
  children: ReactNode
  /** Use for clickable/hoverable cards — adds a subtle hover background shift */
  interactive?: boolean
  /** Removes padding — for cards containing a full-bleed table or list */
  noPadding?: boolean
}

export function Card({
  title,
  children,
  interactive = false,
  noPadding = false,
  className = '',
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        'rounded-md border border-border bg-white',
        noPadding ? '' : 'p-5',
        interactive
          ? 'cursor-pointer transition-colors duration-150 hover:bg-surface-1'
          : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {title && (
        <h3 className={`text-h4 font-semibold text-text-primary ${noPadding ? 'px-5 pt-5 pb-3' : 'mb-3'}`}>
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}
