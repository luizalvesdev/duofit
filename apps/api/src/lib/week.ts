// The app is used in Brazil (UTC-3, no daylight saving), so "a day" and "a week" are cut in that offset.
const OFFSET = '-03:00'
const OFFSET_MS = -3 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export const weekdayLabels = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

export const addDays = (iso: string, days: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10)

/** Local calendar date (YYYY-MM-DD) of an instant. */
export const localDate = (at: Date) => new Date(at.getTime() + OFFSET_MS).toISOString().slice(0, 10)

export const todayLocal = () => localDate(new Date())

/** Monday (YYYY-MM-DD) of the week that contains `iso`. */
export function mondayOf(iso: string) {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return addDays(iso, -((day + 6) % 7))
}

/** Instant at which a local calendar date starts. */
export const startOfLocalDay = (iso: string) => new Date(`${iso}T00:00:00${OFFSET}`)

/** Day of week (0 = Sunday) of a local calendar date. */
export const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay()
