import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../lib/db'
import { equipmentLabels, exerciseImage, muscleLabels, type Exercise, type Muscle } from '../lib/workout'
import { Input } from './ui'

const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function ExerciseThumb({ exercise, size = 'h-12 w-12' }: { exercise: Exercise; size?: string }) {
  const src = exerciseImage(exercise)
  return src ? (
    <img src={src} alt="" loading="lazy" className={`${size} shrink-0 rounded-lg bg-white object-cover`} />
  ) : (
    <div className={`${size} shrink-0 rounded-lg bg-zinc-800 grid place-items-center text-xs text-zinc-500`}>
      {muscleLabels[exercise.primaryMuscle].slice(0, 3)}
    </div>
  )
}

export function ExercisePicker({ onSelect, onClose }: { onSelect: (exercise: Exercise) => void; onClose: () => void }) {
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [], [])
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<Muscle | null>(null)

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    return exercises.filter(
      (e) => (!muscle || e.primaryMuscle === muscle) && (!q || normalize(e.name).includes(q)),
    )
  }, [exercises, query, muscle])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      <header className="flex items-center gap-3 border-b border-zinc-900 p-4">
        <button onClick={onClose} className="text-zinc-400">Fechar</button>
        <Input autoFocus placeholder="Buscar exercício" value={query} onChange={(e) => setQuery(e.target.value)} />
      </header>

      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {(Object.keys(muscleLabels) as Muscle[]).map((m) => (
          <button
            key={m}
            onClick={() => setMuscle(muscle === m ? null : m)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
              muscle === m ? 'border-lime-400 bg-lime-400/10 text-lime-300' : 'border-zinc-800 text-zinc-400'
            }`}
          >
            {muscleLabels[m]}
          </button>
        ))}
      </div>

      <ul className="flex-1 overflow-y-auto px-4 pb-8">
        {filtered.map((exercise) => (
          <li key={exercise.id}>
            <button
              onClick={() => onSelect(exercise)}
              className="flex w-full items-center gap-3 border-b border-zinc-900 py-3 text-left"
            >
              <ExerciseThumb exercise={exercise} />
              <div>
                <p className="font-medium">{exercise.name}</p>
                <p className="text-sm text-zinc-500">
                  {muscleLabels[exercise.primaryMuscle]} · {equipmentLabels[exercise.equipment]}
                  {exercise.ownerId && ' · personalizado'}
                </p>
              </div>
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="py-10 text-center text-zinc-500">Nenhum exercício encontrado.</li>}
      </ul>
    </div>
  )
}
