import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, ErrorText, Input } from '../../components/ui'
import { api } from '../../lib/api'
import type { Meal } from '../../lib/diet'
import { Loading, Offline, useApi } from '../../lib/useApi'

const MAX_MEALS = 12
const SUGGESTIONS = ['Café da manhã', 'Lanche da manhã', 'Almoço', 'Lanche da tarde', 'Pré-treino', 'Pós-treino', 'Jantar', 'Ceia']

const normalize = (name: string) => name.trim().toLocaleLowerCase('pt-BR')

function MealRow({ meal, first, last, onRename, onMove, onRemove }: {
  meal: Meal
  first: boolean
  last: boolean
  onRename: (name: string) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) {
  const [name, setName] = useState(meal.name)
  const [confirming, setConfirming] = useState(false)

  function commit() {
    const trimmed = name.trim()
    if (!trimmed) return setName(meal.name)
    if (trimmed !== meal.name) onRename(trimmed)
  }

  return (
    <div className="flex items-center gap-1 border-b border-zinc-900 py-2 last:border-0">
      <input
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label="Nome da refeição"
        className="h-10 w-full min-w-0 flex-1 rounded-lg bg-transparent px-2 font-semibold outline-none focus:bg-surface-2"
      />
      {confirming ? (
        <>
          <button onClick={() => setConfirming(false)} className="px-2 py-2 text-sm text-zinc-400">Cancelar</button>
          <button onClick={onRemove} className="rounded-lg bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-300">Remover</button>
        </>
      ) : (
        <>
          <button onClick={() => onMove(-1)} disabled={first} aria-label="Subir" className="px-2.5 py-2 text-zinc-400 disabled:opacity-20">↑</button>
          <button onClick={() => onMove(1)} disabled={last} aria-label="Descer" className="px-2.5 py-2 text-zinc-400 disabled:opacity-20">↓</button>
          <button onClick={() => setConfirming(true)} aria-label={`Remover ${meal.name}`} className="px-2.5 py-2 text-zinc-600">✕</button>
        </>
      )}
    </div>
  )
}

export function MealsPage() {
  const navigate = useNavigate()
  const { data, error, reload, setData } = useApi<{ meals: Meal[] }>('/diet/meals')
  const [newName, setNewName] = useState('')
  const [failure, setFailure] = useState('')

  const meals = data?.meals ?? []
  const full = meals.length >= MAX_MEALS
  const suggestions = SUGGESTIONS.filter((s) => !meals.some((m) => normalize(m.name) === normalize(s)))

  async function run(action: () => Promise<unknown>) {
    setFailure('')
    try {
      await action()
    } catch {
      setFailure('Não foi possível salvar. Verifique a conexão.')
    }
    reload()
  }

  const add = (name: string) =>
    run(async () => {
      const trimmed = name.trim()
      if (!trimmed || full) return
      await api('/diet/meals', { method: 'POST', body: { name: trimmed } })
      setNewName('')
    })

  const rename = (meal: Meal, name: string) => run(() => api(`/diet/meals/${meal.id}`, { method: 'PATCH', body: { name } }))

  const remove = (meal: Meal) => run(() => api(`/diet/meals/${meal.id}`, { method: 'DELETE' }))

  const move = (index: number, direction: -1 | 1) => {
    const next = [...meals]
    const [moved] = next.splice(index, 1)
    next.splice(index + direction, 0, moved)
    setData({ meals: next })
    return run(() => api('/diet/meals/order', { method: 'PUT', body: { ids: next.map((m) => m.id) } }))
  }

  return (
    <main className="mx-auto grid max-w-md gap-5 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-12 lg:py-10">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-zinc-400">Voltar</button>
        <h1 className="text-lg font-bold">Refeições</h1>
        <span className="w-12" />
      </header>
      <p className="text-sm text-zinc-500">
        Monte as refeições do seu dia. Toque no nome para renomear. Remover tira a refeição do plano; o que já foi registrado continua no histórico.
      </p>

      {error && !data && <Offline />}
      {!data && !error && <Loading />}
      {data && (
        <>
          <section className="card px-3 py-1">
            {meals.map((meal, index) => (
              <MealRow
                key={meal.id}
                meal={meal}
                first={index === 0}
                last={index === meals.length - 1}
                onRename={(name) => rename(meal, name)}
                onMove={(direction) => move(index, direction)}
                onRemove={() => remove(meal)}
              />
            ))}
            {meals.length === 0 && <p className="py-4 text-center text-sm text-zinc-500">Nenhuma refeição ainda.</p>}
          </section>

          <ErrorText>{failure}</ErrorText>

          {full ? (
            <p className="text-center text-sm text-zinc-500">Limite de {MAX_MEALS} refeições.</p>
          ) : (
            <section className="grid gap-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  add(newName)
                }}
                className="flex gap-2"
              >
                <div className="min-w-0 flex-1">
                  <Input value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} placeholder="Nova refeição" />
                </div>
                <Button type="submit" disabled={!newName.trim()} className="shrink-0">Adicionar</Button>
              </form>
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => add(s)} className="rounded-full border border-line-strong px-3 py-1.5 text-sm text-zinc-300">
                      + {s}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </main>
  )
}
