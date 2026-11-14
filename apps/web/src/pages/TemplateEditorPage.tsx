import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ExercisePicker, ExerciseThumb } from '../components/ExercisePicker'
import { Button, ErrorText, Field, Input } from '../components/ui'
import { api } from '../lib/api'
import { db } from '../lib/db'
import { refreshCache } from '../lib/sync'
import { weekdayLabels, type TemplateItem } from '../lib/workout'

const defaults = { targetSets: 3, repMin: 8, repMax: 12, restSeconds: 90, notes: null }

function NumberCell({ label, value, onChange, min = 0, max = 600 }: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}) {
  return (
    <label className="grid gap-1 text-center">
      <span className="text-xs text-zinc-500">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 text-center outline-none focus:border-lime-400"
      />
    </label>
  )
}

export function TemplateEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [])
  const [name, setName] = useState('')
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [items, setItems] = useState<TemplateItem[]>([])
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const byId = new Map(exercises.map((e) => [e.id, e]))

  useEffect(() => {
    if (!id) return
    db.templates.get(id).then((template) => {
      if (!template) return navigate('/treinos', { replace: true })
      setName(template.name)
      setWeekdays(template.weekdays)
      setItems(template.items.map(({ exerciseId, targetSets, repMin, repMax, restSeconds, notes }) => ({ exerciseId, targetSets, repMin, repMax, restSeconds, notes })))
    })
  }, [id, navigate])

  const patchItem = (index: number, patch: Partial<TemplateItem>) =>
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  const move = (index: number, delta: number) =>
    setItems((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

  async function save() {
    setError('')
    if (!name.trim()) return setError('Dê um nome para a ficha.')
    if (items.length === 0) return setError('Adicione pelo menos um exercício.')
    if (items.some((i) => i.repMin > i.repMax)) return setError('Repetição mínima maior que a máxima.')

    setSaving(true)
    try {
      const body = { name, weekdays: [...weekdays].sort(), items }
      await api(id ? `/templates/${id}` : '/templates', { method: id ? 'PUT' : 'POST', body })
      await refreshCache()
      navigate('/treinos')
    } catch {
      setError('Não foi possível salvar. Editar fichas precisa de internet.')
    } finally {
      setSaving(false)
    }
  }

  async function archive() {
    if (!id || !confirm('Excluir esta ficha? O histórico de treinos continua salvo.')) return
    await api(`/templates/${id}`, { method: 'DELETE' })
    await refreshCache()
    navigate('/treinos')
  }

  return (
    <main className="mx-auto grid max-w-md gap-4 px-5 py-8">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate('/treinos')} className="text-zinc-400">Voltar</button>
        <h1 className="text-lg font-bold">{id ? 'Editar ficha' : 'Nova ficha'}</h1>
        <span className="w-12" />
      </header>

      <Field label="Nome">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="A - Peito e tríceps" maxLength={60} />
      </Field>

      <div className="grid gap-1.5">
        <span className="text-sm text-zinc-400">Dias da semana</span>
        <div className="grid grid-cols-7 gap-1">
          {weekdayLabels.map((label, day) => (
            <button
              key={label}
              onClick={() => setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))}
              className={`rounded-lg border py-2 text-xs ${
                weekdays.includes(day) ? 'border-lime-400 bg-lime-400/10 text-lime-300' : 'border-zinc-800 text-zinc-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ol className="grid gap-3">
        {items.map((item, index) => {
          const exercise = byId.get(item.exerciseId)
          return (
            <li key={`${item.exerciseId}-${index}`} className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="flex items-center gap-3">
                {exercise && <ExerciseThumb exercise={exercise} size="h-10 w-10" />}
                <p className="flex-1 font-medium">{exercise?.name ?? '…'}</p>
                <div className="flex gap-1 text-zinc-500">
                  <button onClick={() => move(index, -1)} aria-label="Subir" className="px-2">↑</button>
                  <button onClick={() => move(index, 1)} aria-label="Descer" className="px-2">↓</button>
                  <button onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))} aria-label="Remover" className="px-2 text-red-400">✕</button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <NumberCell label="Séries" value={item.targetSets} min={1} max={10} onChange={(v) => patchItem(index, { targetSets: v })} />
                <NumberCell label="Reps mín" value={item.repMin} min={1} max={100} onChange={(v) => patchItem(index, { repMin: v })} />
                <NumberCell label="Reps máx" value={item.repMax} min={1} max={100} onChange={(v) => patchItem(index, { repMax: v })} />
                <NumberCell label="Descanso (s)" value={item.restSeconds} max={600} onChange={(v) => patchItem(index, { restSeconds: v })} />
              </div>
            </li>
          )
        })}
      </ol>

      <button onClick={() => setPicking(true)} className="rounded-xl border border-dashed border-zinc-700 py-3 text-lime-400">
        + Adicionar exercício
      </button>

      <ErrorText>{error}</ErrorText>
      <Button onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar ficha'}</Button>
      {id && <button onClick={archive} className="py-2 text-sm text-red-400">Excluir ficha</button>}

      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onSelect={(exercise) => {
            setItems((prev) => [...prev, { exerciseId: exercise.id, ...defaults }])
            setPicking(false)
          }}
        />
      )}
    </main>
  )
}
