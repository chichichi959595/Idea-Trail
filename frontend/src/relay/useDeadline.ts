import { useEffect, useState } from 'react'
import type { RelayClock } from './types'

/**
 * Seconds left until the server's deadline, ticking locally between polls.
 *
 * The deadline is the server's, never the phone's: every response carries the
 * server's own `now`, and the difference from the local clock is applied before
 * counting. A phone whose clock is a minute off would otherwise auto-submit a
 * minute early, or never. Returns null when there is no deadline.
 */
export function useDeadline(clock: Partial<RelayClock> | undefined): number | null {
  const deadlineAt = clock?.deadline_at ?? null
  const serverNow = clock?.server_now ?? null
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (deadlineAt === null) {
      setRemaining(null)
      return
    }
    const deadline = Date.parse(deadlineAt)
    // Re-measured on every poll, since each response carries a fresh `now`.
    const skew = serverNow ? Date.parse(serverNow) - Date.now() : 0
    const tick = () =>
      setRemaining(Math.max(0, Math.ceil((deadline - (Date.now() + skew)) / 1000)))
    tick()
    // Faster than once a second so the number never visibly skips one.
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [deadlineAt, serverNow])

  return remaining
}
