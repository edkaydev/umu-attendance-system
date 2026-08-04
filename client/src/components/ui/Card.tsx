import { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string
  children: ReactNode
  interactive?: boolean
}

export function Card({ title, children, interactive = false, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`rounded-md border border-border bg-white p-5 shadow ${interactive ? 'transition-all duration-200 hover:-translate-y-px hover:shadow-md' : ''} ${className}`}
      {...rest}
    >
      {title && <h3 className="mb-3 text-h3 font-semibold">{title}</h3>}
      {children}
    </div>
  )
}
