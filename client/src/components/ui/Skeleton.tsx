import { ReactNode } from 'react'

/**
 * Skeleton loading system.
 *
 * Skeletons mirror the shape of the content they replace for initial page and
 * layout loads; spinners stay on buttons and short inline actions (see
 * Button.tsx). Decorative blocks are aria-hidden; the wrapping SkeletonScreen
 * announces a human message to screen readers instead.
 */

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-surface-3 motion-reduce:animate-none ${className}`}
    />
  )
}

/** Wraps a skeleton layout: polite live-region message, decorative blocks hidden. */
export function SkeletonScreen({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="h-full">
        {children}
      </div>
    </div>
  )
}

/** Text line placeholder — width drives the silhouette. */
export function Line({ className = '' }: { className?: string }) {
  return <Skeleton className={`h-4 ${className}`} />
}

/** Card-shaped block with an optional title bar and content lines. */
export function SkeletonCard({
  titleWidth = 'w-24',
  rows = 3,
  className = '',
}: {
  titleWidth?: string
  rows?: number
  className?: string
}) {
  return (
    <div className={`rounded-md border border-border bg-white p-5 ${className}`}>
      <Skeleton className={`mb-4 h-4 ${titleWidth}`} />
      <div className="space-y-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className={`h-3.5 ${i === rows - 1 ? 'w-2/3' : 'w-full'}`} />
        ))}
      </div>
    </div>
  )
}

/** Grid of dashboard stat cards. */
export function SkeletonStats({
  count,
  cols = { base: 2, sm: 3 },
  delays = false,
}: {
  count: number
  cols?: { base: number; sm: number }
  delays?: boolean
}) {
  const colClass =
    cols.sm === 6 ? 'sm:grid-cols-3 lg:grid-cols-6'
    : cols.sm === 5 ? 'sm:grid-cols-3 lg:grid-cols-5'
    : cols.sm === 4 ? 'sm:grid-cols-4'
    : 'sm:grid-cols-3'
  return (
    <div className={`grid gap-4 ${cols.base === 2 ? 'grid-cols-2' : 'grid-cols-1'} ${colClass}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-md border border-border bg-white p-4">
          <Skeleton className="mb-2 h-7 w-14" />
          <Skeleton className="h-3.5 w-20" />
          {/* stagger hint mirrors the real cards' cascade */}
          {delays && <span className="sr-only">{i}</span>}
        </div>
      ))}
    </div>
  )
}

/** List rows: leading block, text lines, trailing pill. */
export function SkeletonRows({
  rows = 4,
  pill = true,
  className = '',
}: {
  rows?: number
  pill?: boolean
  className?: string
}) {
  return (
    <div className={`divide-y divide-border ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          {pill && <Skeleton className="h-8 w-24 shrink-0 rounded-full" />}
        </div>
      ))}
    </div>
  )
}

/** Table body placeholder with header row. */
export function SkeletonTable({
  rows = 6,
  cols = 6,
  className = '',
}: {
  rows?: number
  cols?: number
  className?: string
}) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <div className="min-w-[640px]">
        <div className="flex gap-4 border-b border-border bg-surface-1 px-5 py-3">
          {Array.from({ length: cols }, (_, i) => (
            <Skeleton key={i} className={`h-3 ${i === 0 ? 'w-32' : 'flex-1'}`} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-0">
            <div className="w-40 space-y-1.5">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3 w-16" />
            </div>
            {Array.from({ length: cols - 2 }, (_, c) => (
              <Skeleton key={c} className="h-3.5 flex-1" />
            ))}
            <Skeleton className="ml-auto h-8 w-20 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Full dashboard layout: header, stats, two card columns, wide bottom card. */
export function DashboardSkeleton({
  label,
  stats,
  progressCard = false,
}: {
  label: string
  stats: number
  /** Extra full-width card with progress bars (student-style unit list). */
  progressCard?: boolean
}) {
  return (
    <SkeletonScreen label={label} className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-52 max-w-full" />
      </div>
      <SkeletonStats count={stats} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-border bg-white p-5">
          <Skeleton className="mb-4 h-4 w-28" />
          <SkeletonRows rows={3} />
        </div>
        <SkeletonCard titleWidth="w-36" rows={4} />
      </div>
      {progressCard && (
        <div className="rounded-md border border-border bg-white p-5">
          <Skeleton className="mb-4 h-4 w-48" />
          <div className="space-y-5">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i}>
                <div className="mb-1.5 flex items-center justify-between">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
                <Skeleton className="mt-1.5 h-3 w-40" />
              </div>
            ))}
          </div>
        </div>
      )}
    </SkeletonScreen>
  )
}
