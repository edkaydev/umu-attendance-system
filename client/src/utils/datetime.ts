/** Clock time as HH:MM in the viewer's locale. */
export function formatTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Day heading such as "Monday, 3 March". */
export function formatDayLabel(value: string | Date = new Date()): string {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

/** Short date such as "3 Mar 2026". */
export function formatShortDate(value: string | Date): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
