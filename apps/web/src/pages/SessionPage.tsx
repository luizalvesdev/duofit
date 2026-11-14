import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { ExercisePicker, ExerciseThumb } from '../components/ExercisePicker'
import { NumericInput } from '../components/NumericInput'
import { SwipeToDelete } from '../components/SwipeToDelete'
import { db, type ActiveExercise, type LastPerformance } from '../lib/db'
import {
  addExercise,
  addSet,
  cycleSetType,
  discardSession,
  elapsedSeconds,
  finishSession,
  pauseClock,
  removeExercise,
  removeSet,
  setRest,
  startClock,
  toggleComplete,
  updateSet,
} from '../lib/session'
import {
  formatDuration,
  formatKg,
  recordLabels,
  setTypeInfo,
  setTypeOrder,
  type Exercise,
  type RecordKind,
} from '../lib/workout'

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

function RestTimer({ endsAt }: { endsAt: number }) {
  const now = useNow(250)
  const remaining = Math.ceil((endsAt - now) / 1000)

  useEffect(() => {
    if (remaining === 0) navigator.vibrate?.([200, 100, 200])
  }, [remaining])

  if (remaining <= -3) return null
  const done = remaining <= 0

  return (
    <div className={`fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] ${done ? 'border-lime-400 bg-lime-400 text-zinc-950' : 'border-zinc-800 bg-zinc-900'}`}>
      <div className="mx-auto flex max-w-md items-center justify-between px-5 py-3">
        <button onClick={() => setRest(endsAt - 15_000)} className="w-14 text-left font-semibold">−15</button>
        <div className="text-center">
          <p className="text-xs opacity-70">{done ? 'Bora!' : 'Descanso'}</p>
          <p className="text-2xl font-black tabular-nums">{formatDuration(Math.max(0, remaining))}</p>
        </div>
        <div className="flex w-14 flex-col items-end gap-1">
          <button onClick={() => setRest(endsAt + 15_000)} className="font-semibold">+15</button>
          <button onClick={() => setRest(null)} className="text-xs opacity-70">pular</button>
        </div>
      </div>
    </div>
  )
}

function ExerciseCard({ exercise, block, index, last }: {
  exercise: Exercise | undefined
  block: ActiveExercise
  index: number
  last: LastPerformance | undefined
}) {
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [celebrate, setCelebrate] = useState<RecordKind[] | null>(null)
  let workingNumber = 0

  async function complete(setIndex: number) {
    const records = await toggleComplete(index, setIndex)
    if (records.length) {
      setCelebrate(records)
      navigator.vibrate?.(300)
      setTimeout(() => setCelebrate(null), 3500)
    }
  }

  return (
    <section className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
      <header className="flex items-center gap-3">
        {exercise && <ExerciseThumb exercise={exercise} size="h-11 w-11" />}
        <div className="flex-1">
          <h2 className="font-semibold leading-tight">{exercise?.name ?? '…'}</h2>
          <p className="text-xs text-zinc-500">
            {block.repMin !== null && `${block.repMin}–${block.repMax} reps · `}descanso {formatDuration(block.restSeconds)}
          </p>
        </div>
        <button onClick={() => confirm('Remover este exercício do treino?') && removeExercise(index)} className="px-2 text-zinc-600">✕</button>
      </header>

      {celebrate && (
        <div className="animate-pulse rounded-xl bg-lime-400 px-3 py-2 text-center font-bold text-zinc-950">
          🏆 Novo PR! {celebrate.map((k) => recordLabels[k]).join(' · ')}
        </div>
      )}

      <div className="grid grid-cols-[2.5rem_1fr_4.5rem_4rem_2.75rem] items-center gap-2 text-xs text-zinc-500">
        <span className="text-center">Série</span>
        <span>Anterior</span>
        <span className="text-center">kg</span>
        <span className="text-center">Reps</span>
        <span />
      </div>

      {block.sets.map((set, setIndex) => {
        if (set.setType !== 'warmup') workingNumber++
        const info = setTypeInfo[set.setType]
        const previous = last?.sets[setIndex]
        const done = Boolean(set.completedAt)

        return (
          <div key={set.id} className="grid gap-2">
            <SwipeToDelete onDelete={() => removeSet(index, setIndex)}>
            <div className={`grid grid-cols-[2.5rem_1fr_4.5rem_4rem_2.75rem] items-center gap-2 rounded-lg ${done ? 'bg-lime-400/10' : ''}`}>
              <button
                onClick={() => setMenuFor(menuFor === setIndex ? null : setIndex)}
                className={`rounded-md py-2 text-center font-bold ${info.className}`}
              >
                {info.short || workingNumber}
              </button>
              <span className="truncate text-sm text-zinc-500">
                {previous ? `${formatKg(previous.weightKg)} × ${previous.reps}` : '—'}
              </span>
              <NumericInput decimal value={set.weightKg} onCommit={(v) => updateSet(index, setIndex, { weightKg: v })} placeholder="kg" />
              <NumericInput value={set.reps} onCommit={(v) => updateSet(index, setIndex, { reps: v })} placeholder="0" />
              <button
                onClick={() => complete(setIndex)}
                disabled={!done && (set.weightKg === null || set.reps === null)}
                aria-label="Concluir série"
                className={`h-9 rounded-lg font-bold disabled:opacity-30 ${done ? 'bg-lime-400 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}
              >
                ✓
              </button>
            </div>
            </SwipeToDelete>

            {set.records.length > 0 && (
              <p className="pl-12 text-xs font-semibold text-lime-400">🏆 {set.records.map((k) => recordLabels[k]).join(' · ')}</p>
            )}

            {menuFor === setIndex && (
              <div className="flex flex-wrap gap-2 pl-12">
                {setTypeOrder.map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      cycleSetType(index, setIndex, type)
                      setMenuFor(null)
                    }}
                    className={`rounded-full border px-3 py-1 text-xs ${set.setType === type ? 'border-lime-400 text-lime-300' : 'border-zinc-700'} ${setTypeInfo[type].className}`}
                  >
                    {setTypeInfo[type].label}
                  </button>
                ))}
                <button
                  onClick={() => {
                    removeSet(index, setIndex)
                    setMenuFor(null)
                  }}
                  className="rounded-full border border-red-500/40 px-3 py-1 text-xs text-red-400"
                >
                  Remover série
                </button>
              </div>
            )}
          </div>
        )
      })}

      <button onClick={() => addSet(index)} className="rounded-lg bg-zinc-800/60 py-2 text-sm text-zinc-300">+ Série</button>
      {block.sets.length > 0 && index === 0 && (
        <p className="text-center text-xs text-zinc-600">Para excluir uma série, deslize para a esquerda ou toque no número dela</p>
      )}
    </section>
  )
}

export function SessionPage() {
  const navigate = useNavigate()
  const session = useLiveQuery(() => db.active.get('active').then((s) => s ?? null), [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [])
  const lastPerformance = useLiveQuery(() => db.lastPerformance.toArray(), [], [])
  const [picking, setPicking] = useState(false)
  const [summary, setSummary] = useState<{ sets: number; records: number } | null>(null)
  const now = useNow()

  useEffect(() => {
    let lock: WakeLockSentinel | undefined
    navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    return () => void lock?.release()
  }, [])

  if (summary) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-content-center gap-4 px-5 text-center">
        <p className="text-5xl">💪</p>
        <h1 className="text-2xl font-bold">Treino concluído!</h1>
        <p className="text-zinc-400">{summary.sets} séries{summary.records > 0 && ` · ${summary.records} PR${summary.records > 1 ? 's' : ''} 🏆`}</p>
        <button onClick={() => navigate('/treinos')} className="mt-4 rounded-xl bg-lime-400 px-6 py-3 font-semibold text-zinc-950">Voltar</button>
      </main>
    )
  }

  if (session === undefined) return null
  if (session === null) return <Navigate to="/treinos" replace />

  const byId = new Map(exercises.map((e) => [e.id, e]))
  const lastById = new Map(lastPerformance.map((l) => [l.exerciseId, l]))
  const elapsed = elapsedSeconds(session, now)
  const running = session.runningSince !== null
  const notStarted = session.startedAt === null
  const completed = session.exercises.reduce((sum, e) => sum + e.sets.filter((s) => s.completedAt).length, 0)

  async function finish() {
    if (completed === 0) return alert('Conclua pelo menos uma série antes de finalizar.')
    const pendingSets = session!.exercises.reduce((sum, e) => sum + e.sets.filter((s) => !s.completedAt).length, 0)
    if (pendingSets > 0 && !confirm(`${pendingSets} série(s) não concluída(s) serão descartadas. Finalizar?`)) return
    setSummary((await finishSession()) ?? null)
  }

  async function discard() {
    if (!confirm('Descartar este treino? Nada será salvo.')) return
    await discardSession()
    navigate('/treinos')
  }

  return (
    <main className="mx-auto grid max-w-md gap-4 px-4 pb-32 pt-6">
      <header className="sticky top-0 z-30 -mx-4 flex items-center justify-between bg-zinc-950/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          {!notStarted && (
            <button
              onClick={running ? pauseClock : startClock}
              aria-label={running ? 'Pausar' : 'Retomar'}
              className={`grid h-10 w-10 place-items-center rounded-full ${running ? 'bg-zinc-800 text-zinc-200' : 'bg-amber-400 text-zinc-950'}`}
            >
              {running ? '❚❚' : '▶'}
            </button>
          )}
          <div>
            <h1 className="font-bold">{session.name}</h1>
            <p className="text-sm tabular-nums text-zinc-500">
              {notStarted ? 'Não iniciado' : formatDuration(elapsed)}
              {!notStarted && !running && <span className="ml-1 text-amber-400">pausado</span>}
              {' · '}{completed} séries
            </p>
          </div>
        </div>
        <button onClick={finish} className="rounded-xl bg-lime-400 px-4 py-2 font-semibold text-zinc-950">Finalizar</button>
      </header>

      {notStarted && (
        <div className="grid gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <p className="text-sm text-zinc-400">
            Revise os exercícios e inicie quando for treinar.
          </p>
          <button onClick={startClock} className="rounded-xl bg-lime-400 py-3 font-bold text-zinc-950">▶ Iniciar treino</button>
          <p className="text-xs text-zinc-600">Se você concluir uma série antes, o cronômetro começa sozinho.</p>
        </div>
      )}

      {session.exercises.map((block, index) => (
        <ExerciseCard
          key={`${block.exerciseId}-${index}`}
          exercise={byId.get(block.exerciseId)}
          block={block}
          index={index}
          last={lastById.get(block.exerciseId)}
        />
      ))}

      <button onClick={() => setPicking(true)} className="rounded-xl border border-dashed border-zinc-700 py-3 text-lime-400">
        + Adicionar exercício
      </button>
      <button onClick={discard} className="py-2 text-sm text-red-400">Descartar treino</button>

      {session.restEndsAt && <RestTimer endsAt={session.restEndsAt} />}
      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onSelect={(exercise) => {
            addExercise(exercise.id)
            setPicking(false)
          }}
        />
      )}
    </main>
  )
}
