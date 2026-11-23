import { useEffect, useRef } from 'react'

// Overlays (pickers, previews, dialogs) aren't routes, so the Android back button must close them first.
// The last one registered is the top-most. A handler returning nothing closes it; BackButton calls it.
const stack: (() => void)[] = []

export const closeTopOverlay = () => {
  const top = stack.at(-1)
  if (!top) return false
  top()
  return true
}

export function useBackClose(onBack: () => void) {
  const latest = useRef(onBack)
  useEffect(() => {
    latest.current = onBack
  })
  useEffect(() => {
    const handler = () => latest.current()
    stack.push(handler)
    return () => {
      const i = stack.lastIndexOf(handler)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [])
}
