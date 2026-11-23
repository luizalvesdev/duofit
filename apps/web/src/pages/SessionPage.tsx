import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { ExercisePicker } from '../components/ExercisePicker'
import { PreviewThumb } from '../components/ExercisePreview'
import { Collapse } from '../components/Collapse'
import { useBackClose } from '../lib/backStack'
import { useDismiss } from '../lib/useDismiss'
import { Icon } from '../components/Icon'
import { NumericInput } from '../components/NumericInput'
import { SwipeToDelete } from '../components/SwipeToDelete'
import { db, type ActiveExercise, type ActiveSession, type LastPerformance } from '../lib/db'
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
  replaceExercise,
  resumeAfterIdle,
  setExerciseRest,
  setRest,
  startClock,
  toggleComplete,
  updateSet,
} from '../lib/session'
import { enableRestAlert, getRestAlertStatus, playRestEnd, type RestAlertStatus } from '../lib/restAlert'
import {
  equipmentLabels,
  formatDuration,
  formatKg,
  recordLabels,
  setTypeInfo,
  setTypeOrder,
  type Exercise,
  type RecordKind,
  type SetType,
} from '../lib/workout'

const typeStyle: Record<SetType, string> = {
  normal: 'bg-surface-2 text-zinc-50',
  warmup: 'bg-amber-400/16 text-amber-400',
  drop: 'bg-blue-400/16 text-blue-400',
  failure: 'bg-red-400/16 text-red-400',
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

const fallbackFor = (last: LastPerformance | undefined, exercise: Exercise | undefined, setIndex: number) => {
  const previous = last?.sets[setIndex]
  return {
    weightKg: previous?.weightKg ?? (exercise?.equipment === 'bodyweight' ? 0 : null),
    reps: previous?.reps ?? null,
  }
}

function RestPanel({ session, variant }: { session: ActiveSession; variant: 'bar' | 'card' }) {
  const now = useNow(250)
  const endsAt = session.restEndsAt
  const remaining = endsAt ? Math.ceil((endsAt - now) / 1000) : null

  useEffect(() => {
    if (remaining === 0) playRestEnd()
  }, [remaining])

  const total = (session.restTotalMs ?? 90_000) / 1000
  const active = remaining !== null && remaining > -3
  const done = remaining !== null && remaining <= 0
  const shown = formatDuration(Math.max(0, remaining ?? 0))
  const pct = remaining !== null ? Math.min(100, Math.max(0, ((total - remaining) / total) * 100)) : 0
  const adjust = (delta: number) => endsAt && setRest(endsAt + delta)

  if (variant === 'bar') {
    // Always mounted so it can slide in and out; `inert` while hidden.
    return (
      <div inert={!active} className={`fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] transition-[transform,background-color] duration-300 ease-out lg:hidden ${active ? 'translate-y-0' : 'translate-y-full'} ${done ? 'border-lime-400 bg-lime-400 text-ink' : 'border-line-strong bg-surface'}`}>
        <div className="h-1 bg-surface-2"><div className="h-full bg-lime-400" style={{ width: `${pct}%` }} /></div>
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-3">
          <button onClick={() => adjust(-15_000)} className={`num h-13 w-16 rounded-[14px] text-xl font-bold ${done ? 'bg-ink/10' : 'border border-line-strong bg-surface-2'}`}>−15</button>
          <div className="text-center">
            <p className="text-xs font-bold tracking-[0.08em] uppercase opacity-70">{done ? 'Bora!' : `Descanso · de ${formatDuration(total)}`}</p>
            <p role="timer" className="num text-5xl leading-none font-bold">{shown}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => adjust(15_000)} className={`num h-13 w-16 rounded-[14px] text-xl font-bold ${done ? 'bg-ink/10' : 'border border-line-strong bg-surface-2'}`}>+15</button>
            <button onClick={() => setRest(null)} className="h-13 px-2 text-sm font-bold">Pular</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <section aria-label="Timer de descanso" className={`flex flex-col gap-3.5 rounded-3xl border p-5 ${done && active ? 'border-lime-400 bg-lime-400 text-ink' : 'border-line-strong bg-surface'}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold tracking-[0.08em] uppercase opacity-70">{done && active ? 'Bora!' : 'Descanso'}</span>
        <span className="text-[13px] opacity-70">de {formatDuration(total)}</span>
      </div>
      <span role="timer" className="num text-center text-[88px] leading-[.9] font-bold">{active ? shown : '--:--'}</span>
      <div className="h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full bg-lime-400" style={{ width: `${active ? pct : 0}%` }} /></div>
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => adjust(-15_000)} disabled={!active} className="num h-13 rounded-[14px] border border-line-strong bg-surface-2 text-xl font-bold disabled:opacity-40">−15</button>
        <button onClick={() => adjust(15_000)} disabled={!active} className="num h-13 rounded-[14px] border border-line-strong bg-surface-2 text-xl font-bold disabled:opacity-40">+15</button>
        <button onClick={() => setRest(null)} disabled={!active} className="h-13 rounded-[14px] border border-line-strong font-bold disabled:opacity-40">Pular</button>
      </div>
      <p className="text-center text-[13px] opacity-70">
        Atalho <kbd className="rounded-md border border-line-strong px-1.5 py-0.5 text-xs">Espaço</kbd> marca ✓ na próxima série
      </p>
    </section>
  )
}

// Android only: shows until the app may post the rest-over alarm. Needs a tap to open the system prompts.
function RestAlertSetup() {
  const [status, setStatus] = useState<RestAlertStatus | null>(null)

  useEffect(() => {
    const refresh = () => void getRestAlertStatus().then(setStatus)
    refresh()
    // Coming back from the system settings screen.
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [])

  if (!status || (status.notifications && status.exact)) return null
  return (
    <div role="alert" className="card grid gap-2 border-amber-400/50 p-4">
      <p className="font-bold text-amber-400">Alarme do descanso desativado</p>
      <p className="text-sm text-zinc-400">
        {status.notifications
          ? 'Falta liberar "Alarmes e lembretes" para o aviso tocar na hora certa com a tela apagada.'
          : 'Ative as notificações para o DuoFit avisar com som e vibração quando o descanso acabar, mesmo com a tela apagada.'}
      </p>
      <button onClick={() => void enableRestAlert().then(setStatus)} className="h-11 rounded-xl bg-amber-400 font-extrabold text-ink">Ativar</button>
      {!status.notifications && <p className="text-xs text-muted">Se nada aparecer, ative em Configurações › Apps › DuoFit › Notificações.</p>}
    </div>
  )
}

// The clock was auto-paused after 20 min without interaction (see IdleGuard).
function IdleDialog({ onFinish }: { onFinish: () => void }) {
  const { closing, dismiss } = useDismiss()
  useBackClose(() => {}) // must be answered: back does nothing here
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-title"
      data-closing={closing || undefined}
      className="anim-backdrop fixed inset-0 z-60 grid place-items-center bg-black/80 p-4"
    >
      <div data-closing={closing || undefined} className="anim-dialog card grid w-full max-w-sm gap-4 p-6 text-center">
        <h2 id="idle-title" className="num text-3xl font-bold uppercase">Ainda está treinando?</h2>
        <p className="text-sm text-zinc-400">Ficou 20 minutos sem mexer, então pausei o cronômetro. O tempo parado não foi contado.</p>
        <button onClick={() => dismiss(() => void resumeAfterIdle())} className="h-13 rounded-[14px] bg-lime-400 font-extrabold text-ink">
          Sim, continuar
        </button>
        <button onClick={onFinish} className="h-12 rounded-[14px] border border-line-strong font-bold">
          Finalizar treino
        </button>
      </div>
    </div>
  )
}

function SetRow({ exercise, block, index, setIndex, number, last, missing, onComplete }: {
  exercise: Exercise | undefined
  block: ActiveExercise
  index: number
  setIndex: number
  number: number
  last: LastPerformance | undefined
  missing: ('weight' | 'reps')[] | null
  onComplete: () => void
}) {
  const [menu, setMenu] = useState(false)
  const set = block.sets[setIndex]
  const previous = last?.sets[setIndex]
  const fallback = fallbackFor(last, exercise, setIndex)
  const done = Boolean(set.completedAt)
  const isPr = set.records.length > 0
  const rowBg = done ? (isPr ? 'bg-pr/14' : 'bg-lime-400/12') : ''
  const inputClass = `h-12 rounded-xl text-2xl font-bold num ${done ? 'bg-zinc-950/35 border border-transparent' : 'bg-surface-2 border border-line-strong'}`
  const missingWeight = missing?.includes('weight') && set.weightKg === null
  const missingReps = missing?.includes('reps') && set.reps === null

  return (
    <div>
      <SwipeToDelete onDelete={() => removeSet(index, setIndex)}>
        <div className={`grid min-h-14.5 grid-cols-[44px_minmax(0,1fr)_76px_64px_48px] items-center gap-1.5 px-3 py-1 ${rowBg}`}>
          <button
            onClick={() => setMenu((v) => !v)}
            aria-label={`Tipo da série ${setTypeInfo[set.setType].label}`}
            className={`relative grid h-11 place-items-center rounded-[10px] ${typeStyle[set.setType]}`}
          >
            <span className="num text-xl font-bold">{setTypeInfo[set.setType].short || number}</span>
            {isPr && (
              <span className="absolute -top-1 -right-1.5 grid h-5 w-5 place-items-center rounded-full border-2 border-surface bg-pr text-pr-ink">
                <Icon name="trophy" size={11} strokeWidth={3} />
              </span>
            )}
          </button>
          <span className="num truncate text-[17px] text-muted">{previous ? `${formatKg(previous.weightKg)} × ${previous.reps}` : '—'}</span>
          <NumericInput
            decimal
            value={set.weightKg}
            onCommit={(v) => updateSet(index, setIndex, { weightKg: v })}
            placeholder={fallback.weightKg !== null ? formatKg(fallback.weightKg) : 'kg'}
            invalid={missingWeight}
            className={inputClass}
          />
          <NumericInput
            value={set.reps}
            onCommit={(v) => updateSet(index, setIndex, { reps: v })}
            placeholder={previous ? String(previous.reps) : block.repMin !== null ? `${block.repMin}-${block.repMax}` : '—'}
            invalid={missingReps}
            className={inputClass}
          />
          <button
            onClick={onComplete}
            aria-label="Concluir série"
            aria-pressed={done}
            className={`grid h-11 w-11 place-items-center justify-self-center rounded-xl ${done ? `animate-pop ${isPr ? 'bg-pr text-pr-ink' : 'bg-lime-400 text-ink'}` : 'border-2 border-line-strong text-transparent hover:text-zinc-600'}`}
          >
            <Icon name="check" size={22} strokeWidth={3.2} />
          </button>
        </div>
      </SwipeToDelete>

      {(missingWeight || missingReps) && !done && (
        <p role="alert" className="flex items-center gap-1.5 px-3 pb-2 pl-15.5 text-[13px] text-red-300">
          <Icon name="alert" size={15} strokeWidth={2.2} />
          Preencha {[missingWeight && 'a carga (kg)', missingReps && 'as repetições'].filter(Boolean).join(' e ')}
        </p>
      )}

      <Collapse open={menu}>
        <div className="flex flex-wrap gap-2 px-3 pb-3 pl-15.5">
          {setTypeOrder.map((type) => (
            <button
              key={type}
              onClick={() => {
                cycleSetType(index, setIndex, type)
                setMenu(false)
              }}
              className={`h-9 rounded-full px-3.5 text-sm font-semibold ${typeStyle[type]} ${set.setType === type ? 'ring-2 ring-lime-400' : ''}`}
            >
              {setTypeInfo[type].label}
            </button>
          ))}
          <button
            onClick={() => {
              removeSet(index, setIndex)
              setMenu(false)
            }}
            className="h-9 rounded-full border border-red-500/40 px-3.5 text-sm font-semibold text-red-400"
          >
            Remover série
          </button>
        </div>
      </Collapse>
    </div>
  )
}

function ExerciseCard({ exercise, block, index, last, missing, onComplete, onSwap }: {
  exercise: Exercise | undefined
  block: ActiveExercise
  index: number
  last: LastPerformance | undefined
  missing: { setIndex: number; fields: ('weight' | 'reps')[] } | null
  onComplete: (setIndex: number) => void
  onSwap: () => void
}) {
  const [menu, setMenu] = useState(false)
  const prSet = block.sets.find((s) => s.records.length > 0)
  const numbers = block.sets.reduce<number[]>((acc, s) => [...acc, (acc.at(-1) ?? 0) + (s.setType === 'warmup' ? 0 : 1)], [])

  return (
    <article className={`overflow-hidden rounded-[20px] border bg-surface ${prSet ? 'border-pr/55' : 'border-line'}`}>
      {prSet && (
        <div role="status" className="flex animate-pop items-center gap-2.5 bg-pr px-3.5 py-2.5 text-pr-ink">
          <Icon name="trophy" size={22} strokeWidth={2.4} />
          <span className="flex flex-1 flex-col">
            <b className="text-base font-extrabold">Novo PR! {prSet.records.map((k: RecordKind) => recordLabels[k]).join(' · ')}</b>
            <span className="num text-[15px] font-semibold">{formatKg(prSet.weightKg ?? 0)} kg × {prSet.reps}</span>
          </span>
          <span aria-hidden="true" className="flex gap-1">
            <span className="h-1.5 w-1.5 rotate-20 rounded-[2px] bg-lime-400" />
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-50" />
            <span className="h-1.5 w-1.5 -rotate-30 rounded-[2px] bg-fat" />
          </span>
        </div>
      )}

      <div className="flex items-center gap-3 px-3 pt-3 pb-2">
        {exercise ? <PreviewThumb exercise={exercise} size="h-13 w-13 rounded-[14px]" /> : <div className="h-13 w-13 rounded-[14px] bg-surface-2" />}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-base font-semibold">{exercise?.name ?? '…'}</h2>
          <span className="text-[13px] text-zinc-400">
            {block.repMin !== null && `${block.repMin}–${block.repMax} reps · `}descanso {block.restSeconds} s
            {exercise && ` · ${equipmentLabels[exercise.equipment]}`}
          </span>
        </div>
        <button onClick={() => setMenu((v) => !v)} aria-label="Opções do exercício" className="grid h-11 w-11 place-items-center text-muted">
          <Icon name="dots" size={20} />
        </button>
      </div>

      <Collapse open={menu}>
        <div className="grid gap-2 px-3 pb-2">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-1.5">
            <span className="text-sm font-semibold">Descanso</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setExerciseRest(index, block.restSeconds - 15)} aria-label="Menos 15 segundos" className="num h-10 w-12 rounded-lg border border-line-strong text-lg font-bold">−15</button>
              <span className="num w-16 text-center text-xl font-bold">{formatDuration(block.restSeconds)}</span>
              <button onClick={() => setExerciseRest(index, block.restSeconds + 15)} aria-label="Mais 15 segundos" className="num h-10 w-12 rounded-lg border border-line-strong text-lg font-bold">+15</button>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setMenu(false)
                onSwap()
              }}
              className="h-10 flex-1 rounded-xl border border-line-strong px-4 text-sm font-semibold"
            >
              Trocar exercício
            </button>
            <button
              onClick={() => confirm('Remover este exercício do treino?') && removeExercise(index)}
              className="h-10 flex-1 rounded-xl border border-red-500/40 px-4 text-sm font-semibold text-red-400"
            >
              Remover exercício
            </button>
          </div>
        </div>
      </Collapse>

      <div className="grid grid-cols-[44px_minmax(0,1fr)_76px_64px_48px] gap-1.5 px-3 pb-1 text-[11px] font-bold tracking-[0.04em] text-muted uppercase">
        <span className="text-center">Série</span><span>Anterior</span><span className="text-center">kg</span><span className="text-center">Reps</span><span className="text-center">✓</span>
      </div>

      {block.sets.map((set, setIndex) => (
        <SetRow
          key={set.id}
          exercise={exercise}
          block={block}
          index={index}
          setIndex={setIndex}
          number={numbers[setIndex]}
          last={last}
          missing={missing?.setIndex === setIndex ? missing.fields : null}
          onComplete={() => onComplete(setIndex)}
        />
      ))}

      <button onClick={() => addSet(index)} className="mt-1 flex h-12 w-full items-center justify-center gap-1.5 border-t border-[#232327] font-bold text-lime-400">
        <Icon name="plus" size={18} strokeWidth={2.6} />Série
      </button>
    </article>
  )
}

export function SessionPage() {
  const navigate = useNavigate()
  const session = useLiveQuery(() => db.active.get('active').then((s) => s ?? null), [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [])
  const lastPerformance = useLiveQuery(() => db.lastPerformance.toArray(), [], [])
  const [picking, setPicking] = useState(false)
  const [swapping, setSwapping] = useState<number | null>(null)
  const [missing, setMissing] = useState<{ index: number; setIndex: number; fields: ('weight' | 'reps')[] } | null>(null)
  const [summary, setSummary] = useState<{ sets: number; records: number } | null>(null)
  const now = useNow()

  const byId = new Map(exercises.map((e) => [e.id, e]))
  const lastById = new Map(lastPerformance.map((l) => [l.exerciseId, l]))

  async function complete(index: number, setIndex: number) {
    if (!session) return
    const block = session.exercises[index]
    const result = await toggleComplete(index, setIndex, fallbackFor(lastById.get(block.exerciseId), byId.get(block.exerciseId), setIndex))
    if (!result.ok) return setMissing({ index, setIndex, fields: result.missing })
    setMissing(null)
    if (result.records.length) navigator.vibrate?.(300)
  }

  useEffect(() => {
    let lock: WakeLockSentinel | undefined
    navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    return () => void lock?.release()
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.code !== 'Space' || (event.target as HTMLElement).closest('input, textarea, button')) return
      if (!session) return
      for (const [index, block] of session.exercises.entries()) {
        const setIndex = block.sets.findIndex((s) => !s.completedAt)
        if (setIndex >= 0) {
          event.preventDefault()
          complete(index, setIndex)
          return
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (summary) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-content-center gap-4 px-5 text-center">
        <div className="mx-auto grid h-24 w-24 animate-pop place-items-center rounded-full bg-lime-400 text-ink"><Icon name="check" size={48} strokeWidth={3} /></div>
        <h1 className="num text-5xl font-bold uppercase">Treino concluído!</h1>
        <p className="num text-2xl text-zinc-400">
          {summary.sets} séries
          {summary.records > 0 && <span className="text-purple-300"> · {summary.records} PR{summary.records > 1 ? 's' : ''} 🏆</span>}
        </p>
        <button onClick={() => navigate('/')} className="mt-4 h-13 rounded-[14px] bg-lime-400 px-6 font-extrabold text-ink">Voltar ao início</button>
      </main>
    )
  }

  if (session === undefined) return null
  if (session === null) return <Navigate to="/treinos" replace />

  const elapsed = elapsedSeconds(session, now)
  const running = session.runningSince !== null
  const notStarted = session.startedAt === null
  const totalSets = session.exercises.reduce((sum, e) => sum + e.sets.length, 0)
  const completed = session.exercises.reduce((sum, e) => sum + e.sets.filter((s) => s.completedAt).length, 0)
  const currentIndex = session.exercises.findIndex((e) => e.sets.some((s) => !s.completedAt))

  async function finish() {
    if (completed === 0) return alert('Conclua pelo menos uma série antes de finalizar.')
    const pendingSets = totalSets - completed
    if (pendingSets > 0 && !confirm(`${pendingSets} série(s) não concluída(s) serão descartadas. Finalizar?`)) return
    setSummary((await finishSession()) ?? null)
  }

  async function discard() {
    if (!confirm('Descartar este treino? Nada será salvo.')) return
    await discardSession()
    navigate('/treinos')
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-[env(safe-area-inset-top)] z-30 flex flex-wrap items-center gap-3 border-b border-[#1f1f23] bg-[#0c0c0f]/95 px-4 py-3 backdrop-blur lg:gap-4 lg:px-10 lg:py-4">
        {notStarted ? (
          <button onClick={() => navigate('/treinos')} aria-label="Voltar" className="grid h-12 w-12 place-items-center rounded-[14px] border border-line-strong bg-surface-2"><Icon name="back" /></button>
        ) : (
          <button
            onClick={running ? pauseClock : startClock}
            aria-label={running ? 'Pausar' : 'Retomar'}
            className={`grid h-12 w-12 place-items-center rounded-[14px] ${running ? 'border border-line-strong bg-surface-2' : 'bg-amber-400 text-ink'}`}
          >
            <Icon name={running ? 'pause' : 'play'} size={18} strokeWidth={3} />
          </button>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-zinc-400">{session.name}</span>
          <span className="flex items-baseline gap-3">
            <span className="num text-[34px] leading-none font-bold">{notStarted ? '0:00' : formatDuration(elapsed)}</span>
            <span className="num text-lg font-semibold text-muted">
              {!notStarted && !running ? <span className="text-amber-400">pausado</span> : `${completed}/${totalSets} séries`}
            </span>
          </span>
        </div>
        <div className="order-last h-2 w-full rounded-full bg-surface-2 lg:order-none lg:max-w-90 lg:flex-1">
          <div className="h-full rounded-full bg-lime-400 transition-[width]" style={{ width: `${totalSets ? (completed / totalSets) * 100 : 0}%` }} />
        </div>
        <button onClick={finish} className="h-12 rounded-[14px] bg-lime-400 px-5 font-extrabold text-ink">Finalizar</button>
      </header>

      <div className="mx-auto flex w-full max-w-300 flex-1 flex-wrap items-start gap-6 px-3 pt-4 pb-36 lg:px-10 lg:pt-6 lg:pb-10">
        <main className="flex min-w-0 flex-[999_1_520px] flex-col gap-4 lg:max-w-170">
          <RestAlertSetup />

          {notStarted && (
            <div className="card grid gap-3 p-5 text-center">
              <p className="text-zinc-400">Revise os exercícios e inicie quando for treinar.</p>
              <button onClick={startClock} className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-lime-400 text-lg font-extrabold text-ink">
                <Icon name="play" size={20} />Iniciar treino
              </button>
              <p className="text-xs text-muted">Se concluir uma série antes, o cronômetro começa sozinho.</p>
            </div>
          )}

          {session.exercises.map((block, index) => (
            <ExerciseCard
              key={`${block.exerciseId}-${index}`}
              exercise={byId.get(block.exerciseId)}
              block={block}
              index={index}
              last={lastById.get(block.exerciseId)}
              missing={missing?.index === index ? missing : null}
              onComplete={(setIndex) => complete(index, setIndex)}
              onSwap={() => setSwapping(index)}
            />
          ))}

          <p className="text-center text-xs text-muted">Deslize uma série para a esquerda (ou toque no número dela) para excluir.</p>
          <button onClick={() => setPicking(true)} className="flex h-13 items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong font-bold text-lime-400">
            <Icon name="plus" size={18} strokeWidth={2.6} />Adicionar exercício
          </button>
          <button onClick={discard} className="py-2 text-sm font-semibold text-red-400">Descartar treino</button>
        </main>

        <aside className="hidden min-w-0 flex-[1_1_320px] flex-col gap-4 lg:sticky lg:top-28 lg:flex">
          <RestPanel session={session} variant="card" />
          <section className="card px-2 pt-2 pb-3">
            <h2 className="label-caps px-3 pt-3 pb-2">Sequência</h2>
            <ol className="flex flex-col gap-0.5">
              {session.exercises.map((block, index) => {
                const current = index === currentIndex
                const doneSets = block.sets.filter((s) => s.completedAt).length
                return (
                  <li key={`${block.exerciseId}-${index}`} className={`flex min-h-13 items-center gap-3 rounded-xl px-3 ${current ? 'bg-lime-400/10' : ''}`}>
                    <span className={`num grid h-7 w-7 place-items-center rounded-full text-[15px] font-bold ${current ? 'bg-lime-400 text-ink' : 'bg-surface-2 text-zinc-400'}`}>{index + 1}</span>
                    <span className={`flex-1 text-sm ${current ? 'font-bold' : 'font-medium'}`}>{byId.get(block.exerciseId)?.name ?? '…'}</span>
                    <span className="num text-base text-muted">{doneSets}/{block.sets.length}</span>
                  </li>
                )
              })}
            </ol>
          </section>
        </aside>
      </div>

      <RestPanel session={session} variant="bar" />
      {session.idlePrompt && <IdleDialog onFinish={finish} />}
      {swapping !== null && (
        <ExercisePicker
          onClose={() => setSwapping(null)}
          onSelect={(exercise) => {
            replaceExercise(swapping, exercise.id)
            setSwapping(null)
          }}
        />
      )}
      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onSelect={(exercise) => {
            addExercise(exercise.id)
            setPicking(false)
          }}
        />
      )}
    </div>
  )
}
