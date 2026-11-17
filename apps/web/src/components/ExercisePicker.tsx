import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { db } from '../lib/db'
import { refreshCache } from '../lib/sync'
import { equipmentLabels, exerciseImage, muscleLabels, type Equipment, type Exercise, type Muscle } from '../lib/workout'
import { Button, ErrorText, Field, Input, Select } from './ui'

function CreateExercise({ initialName, onCreated, onCancel }: {
  initialName: string
  onCreated: (exercise: Exercise) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [primaryMuscle, setMuscle] = useState<Muscle>('chest')
  const [equipment, setEquipment] = useState<Equipment>('machine')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (name.trim().length < 2) return setError('Dê um nome ao exercício.')
    setSaving(true)
    try {
      const { exercise } = await api<{ exercise: Exercise }>('/exercises', {
        method: 'POST',
        body: { name, primaryMuscle, equipment },
      })
      await refreshCache()
      onCreated(exercise)
    } catch {
      setError('Não foi possível criar. Precisa de internet.')
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4 p-4">
      <h2 className="text-lg font-semibold">Novo exercício</h2>
      <Field label="Nome">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Supino máquina articulada" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Músculo principal">
          <Select value={primaryMuscle} onChange={(e) => setMuscle(e.target.value as Muscle)}>
            {Object.entries(muscleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
        <Field label="Equipamento">
          <Select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
            {Object.entries(equipmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
      <Button onClick={save} disabled={saving}>{saving ? 'Criando…' : 'Criar e adicionar'}</Button>
      <button onClick={onCancel} className="text-sm text-zinc-500">Cancelar</button>
    </div>
  )
}

const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function ExerciseThumb({ exercise, size = 'h-12 w-12 rounded-lg' }: { exercise: Exercise; size?: string }) {
  const src = exerciseImage(exercise)
  return src ? (
    <img src={src} alt="" loading="lazy" className={`${size} shrink-0 bg-white object-cover`} />
  ) : (
    <div className={`${size} grid shrink-0 place-items-center bg-surface-2 text-xs text-zinc-500`}>
      {muscleLabels[exercise.primaryMuscle].slice(0, 3)}
    </div>
  )
}

export function ExercisePicker({ onSelect, onClose }: { onSelect: (exercise: Exercise) => void; onClose: () => void }) {
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [], [])
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<Muscle | null>(null)
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    return exercises.filter(
      (e) => (!muscle || e.primaryMuscle === muscle) && (!q || normalize(e.name).includes(q)),
    )
  }, [exercises, query, muscle])

  if (creating) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <CreateExercise initialName={query} onCreated={onSelect} onCancel={() => setCreating(false)} />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="flex items-center gap-3 border-b border-zinc-900 p-4">
        <button onClick={onClose} className="shrink-0 text-zinc-400">Fechar</button>
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
        {filtered.length === 0 && <li className="py-6 text-center text-zinc-500">Nenhum exercício encontrado.</li>}
        <li>
          <button onClick={() => setCreating(true)} className="w-full py-4 text-center text-lime-400">
            + Criar exercício {query.trim() && `"${query.trim()}"`}
          </button>
        </li>
      </ul>
    </div>
  )
}
