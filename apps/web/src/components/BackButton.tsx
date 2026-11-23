import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { closeTopOverlay, useBackClose } from '../lib/backStack'
import { useDismiss } from '../lib/useDismiss'

// Top-level screens: back here asks before leaving the app instead of walking through the tab history.
const ROOTS = /^\/(?:progresso(?:\/(?:recordes|corpo))?|treinos|dieta|dupla(?:\/dieta)?|login|cadastro)?$/

function ExitDialog({ onCancel, onExit }: { onCancel: () => void; onExit: () => void }) {
  const { closing, dismiss } = useDismiss()
  useBackClose(() => dismiss(onCancel))
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="exit-title"
      data-closing={closing || undefined}
      onClick={() => dismiss(onCancel)}
      className="anim-backdrop fixed inset-0 z-60 grid place-items-center bg-black/80 p-4"
    >
      <div data-closing={closing || undefined} onClick={(e) => e.stopPropagation()} className="anim-dialog card grid w-full max-w-sm gap-4 p-6 text-center">
        <h2 id="exit-title" className="num text-3xl font-bold uppercase">Sair do DuoFit?</h2>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => dismiss(onCancel)} className="h-12 rounded-[14px] border border-line-strong font-bold">Ficar</button>
          <button onClick={onExit} className="h-12 rounded-[14px] bg-lime-400 font-extrabold text-ink">Sair</button>
        </div>
      </div>
    </div>
  )
}

// Android hardware/gesture back: close the top overlay, else go to the previous screen,
// else (on a top-level screen) ask before exiting. Renders only the exit confirmation.
export function BackButton() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [asking, setAsking] = useState(false)
  const pathRef = useRef(pathname)
  useEffect(() => {
    pathRef.current = pathname
  }, [pathname])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const listener = App.addListener('backButton', () => {
      if (closeTopOverlay()) return
      if (ROOTS.test(pathRef.current)) return setAsking(true)
      // Opened straight onto a deep screen (no history): go home rather than leave the app.
      if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
      else navigate('/', { replace: true })
    })
    return () => void listener.then((l) => l.remove())
  }, [navigate])

  return asking ? <ExitDialog onCancel={() => setAsking(false)} onExit={() => void App.exitApp()} /> : null
}
