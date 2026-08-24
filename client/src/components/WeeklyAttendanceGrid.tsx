export interface WeeklyDay {
  date: string // ISO day, e.g. "2026-08-22"
  sessionsHeld: number
  attended: number
  absent: number
}

interface CellState {
  glyph: string
  boxClass: string
  label: string
}

function cellState(day: WeeklyDay): CellState {
  if (day.sessionsHeld === 0) {
    return {
      glyph: '–',
      boxClass: 'border-border bg-surface-2 text-text-disabled',
      label: 'No classes held',
    }
  }
  if (day.attended >= day.sessionsHeld) {
    return { glyph: '✓', boxClass: 'border-transparent bg-success text-white', label: 'Attended every class' }
  }
  if (day.attended <= 0) {
    return { glyph: '✕', boxClass: 'border-transparent bg-danger text-white', label: 'Missed every class' }
  }
  return { glyph: '!', boxClass: 'border-transparent bg-warning text-white', label: 'Attended some classes' }
}

function isoToday(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const LEGEND = [
  { glyph: '✓', swatch: 'bg-success', text: 'All attended' },
  { glyph: '!', swatch: 'bg-warning', text: 'Some attended' },
  { glyph: '✕', swatch: 'bg-danger', text: 'All missed' },
  { glyph: '–', swatch: 'bg-surface-2 border border-border', text: 'No classes' },
] as const

/**
 * GitHub-contribution-style week strip: one box per day of the current
 * calendar week (Monday through Sunday). Future days render as "no classes".
 * Colour never carries meaning alone — every box also shows a glyph, a native
 * tooltip, an accessible label, and the raw numbers remain available in the
 * collapsible data table below the strip.
 */
export function WeeklyAttendanceGrid({ days }: { days: WeeklyDay[] }) {
  const today = isoToday()

  const totals = days.reduce(
    (acc, d) => ({ held: acc.held + d.sessionsHeld, attended: acc.attended + d.attended }),
    { held: 0, attended: 0 },
  )
  const summary =
    totals.held === 0
      ? 'No classes have been held this week yet.'
      : `This week ${totals.held} ${totals.held === 1 ? 'class was' : 'classes were'} held and you attended ${totals.attended}.`

  return (
    <div>
      <p className="sr-only" role="status">{summary}</p>
      <p aria-hidden="true" className="mb-3 text-body-sm text-text-secondary">
        This week (Mon–Sun) · <span className="font-semibold text-text-primary">{totals.attended}</span> of{' '}
        <span className="font-semibold text-text-primary">{totals.held}</span> classes attended
      </p>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {days.map((day, i) => {
          const c = cellState(day)
          const isToday = day.date === today
          const d = new Date(`${day.date}T00:00:00`)
          return (
            <div
              key={day.date}
              className="flex animate-fadeIn flex-col items-center gap-1 opacity-0 [animation-fill-mode:both]"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide ${
                  isToday ? 'text-umu-red' : 'text-text-secondary'
                }`}
              >
                {d.toLocaleDateString(undefined, { weekday: 'short' })}
              </span>
              <div
                title={`${d.toLocaleDateString()} — ${c.label}${
                  day.sessionsHeld > 0 ? ` (${day.attended}/${day.sessionsHeld})` : ''
                }`}
                role="img"
                aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}: ${c.label}${
                  day.sessionsHeld > 0 ? `, ${day.attended} of ${day.sessionsHeld}` : ''
                }`}
                className={`flex h-[64px] w-full flex-col items-center justify-center rounded-lg border transition-transform hover:scale-[1.06] sm:h-[72px] ${c.boxClass} ${
                  isToday ? 'ring-2 ring-umu-red ring-offset-2 ring-offset-white' : ''
                }`}
              >
                <span className="text-xl font-bold leading-none" aria-hidden="true">
                  {c.glyph}
                </span>
                {day.sessionsHeld > 0 && (
                  <span className="mt-0.5 text-[10px] font-medium leading-none opacity-90">
                    {day.attended}/{day.sessionsHeld}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend — glyphs repeat what colour encodes */}
      <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-hidden="true">
        {LEGEND.map((l) => (
          <li key={l.text} className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span className={`flex h-5 w-5 items-center justify-center rounded ${l.swatch}`}>
              <span className="text-[10px] font-bold text-white mix-blend-difference">{l.glyph}</span>
            </span>
            {l.text}
          </li>
        ))}
      </ul>
    </div>
  )
}
