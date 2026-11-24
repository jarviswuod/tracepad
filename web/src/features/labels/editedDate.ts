const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function clock(date: Date): string {
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const suffix = date.getHours() >= 12 ? 'PM' : 'AM'
  let hours = date.getHours() % 12
  if (hours === 0) hours = 12
  return `${hours}:${minutes} ${suffix}`
}

/**
 * "Edited" time for an open note, in local time.
 * Today is the clock time, this year is "Nov 3", and older dates add the year.
 */
export function formatEditedDate(updatedAt: string, now: Date = new Date()): string {
  const date = new Date(updatedAt)
  if (Number.isNaN(date.getTime())) return 'Edited'
  if (sameDay(date, now)) return `Edited ${clock(date)}`
  const month = MONTHS[date.getMonth()]
  const day = date.getDate()
  if (date.getFullYear() === now.getFullYear()) return `Edited ${month} ${day}`
  return `Edited ${month} ${day}, ${date.getFullYear()}`
}
