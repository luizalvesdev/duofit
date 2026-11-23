import { useEffect } from 'react'
import { pauseIfIdle, touchActivity } from '../lib/session'

// Mounted once, app-wide: tracks interaction and auto-pauses an idle workout clock,
// even if the user left the workout screen. The question itself is shown by SessionPage.
export function IdleGuard() {
  useEffect(() => {
    const check = () => void pauseIfIdle()
    // Check first, so the tap that wakes a long-idle app can't count as fresh activity.
    check()
    const timer = setInterval(check, 10_000)
    const onVisible = () => document.visibilityState === 'visible' && check()
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const
    for (const e of events) window.addEventListener(e, touchActivity, { passive: true, capture: true })
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      for (const e of events) window.removeEventListener(e, touchActivity, { capture: true })
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return null
}
