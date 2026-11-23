import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDismiss } from '../lib/useDismiss'
import { equipmentLabels, exerciseImage, muscleLabels, type Exercise } from '../lib/workout'
import { ExerciseThumb } from './ExercisePicker'
import { Icon } from './Icon'

// free-exercise-db ships two frames per exercise (…/0.jpg start, …/1.jpg end).
const secondFrame = (src: string) => (/\/0\.\w+$/.test(src) ? src.replace(/\/0(\.\w+)$/, '/1$1') : null)

function ExercisePreview({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const first = exerciseImage(exercise)
  const second = first ? secondFrame(first) : null
  const [frame, setFrame] = useState(0)
  const [secondOk, setSecondOk] = useState(true)
  const animated = Boolean(second) && secondOk
  const { closing, dismiss } = useDismiss()
  const close = () => dismiss(onClose)

  useEffect(() => {
    if (!animated) return
    const timer = setInterval(() => setFrame((f) => 1 - f), 900)
    return () => clearInterval(timer)
  }, [animated])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss(onClose)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dismiss, onClose])

  const src = animated && frame === 1 ? second : first

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Prévia de ${exercise.name}`}
      onClick={close}
      data-closing={closing || undefined}
      className="anim-backdrop fixed inset-0 z-60 grid place-items-center bg-black/80 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div onClick={(e) => e.stopPropagation()} data-closing={closing || undefined} className="anim-dialog w-full max-w-md overflow-hidden rounded-3xl border border-line-strong bg-surface">
        <div className="relative aspect-square bg-white">
          {src ? (
            <>
              <img src={src} alt={exercise.name} className="h-full w-full object-contain" onError={() => frame === 1 && setSecondOk(false)} />
              {/* preload the other frame so the loop doesn't flicker */}
              {second && <img src={second} alt="" className="hidden" onError={() => setSecondOk(false)} />}
            </>
          ) : (
            <div className="grid h-full place-items-center text-zinc-500">Sem imagem para este exercício</div>
          )}
          <button
            onClick={close}
            aria-label="Fechar"
            className="absolute top-3 right-3 grid h-11 w-11 place-items-center rounded-full bg-black/60 text-zinc-50"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="grid gap-1 p-4">
          <h2 className="text-lg font-bold">{exercise.name}</h2>
          <p className="text-sm text-zinc-400">
            {muscleLabels[exercise.primaryMuscle]}
            {exercise.secondaryMuscles.length > 0 && ` + ${exercise.secondaryMuscles.map((m) => muscleLabels[m]).join(', ')}`}
            {' · '}{equipmentLabels[exercise.equipment]}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Thumbnail that opens the movement preview when tapped.
export function PreviewThumb({ exercise, size }: { exercise: Exercise; size?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ver movimento de ${exercise.name}`}
        className="shrink-0"
      >
        <ExerciseThumb exercise={exercise} size={size} />
      </button>
      {open && <ExercisePreview exercise={exercise} onClose={() => setOpen(false)} />}
    </>
  )
}
