import { useCallback, useRef, useState } from 'react'

export const EXIT_MS = 180

// Lets an overlay play its exit animation before it unmounts: bind `closing` to `data-closing`
// (see .anim-* in index.css) and call `dismiss(fn)` instead of `fn` directly.
export function useDismiss() {
  const [closing, setClosing] = useState(false)
  const busy = useRef(false)
  const dismiss = useCallback((after: () => void) => {
    if (busy.current) return
    busy.current = true
    setClosing(true)
    setTimeout(after, EXIT_MS)
  }, [])
  return { closing, dismiss }
}
