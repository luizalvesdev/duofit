import { db, type ActiveExercise, type ActiveSession, type ActiveSet } from './db'
import { flushOutbox } from './sync'
import { detectRecords, mergeBest, type Best, type RecordKind, type SetType, type Template } from './workout'

const DEFAULT_REST = 90

const newSet = (setType: SetType = 'normal'): ActiveSet => ({
  id: crypto.randomUUID(),
  setType,
  weightKg: null,
  reps: null,
  completedAt: null,
  records: [],
})

async function prefill(exerciseId: string, count: number): Promise<ActiveSet[]> {
  const last = await db.lastPerformance.get(exerciseId)
  return Array.from({ length: count }, (_, index) => {
    const previous = last?.sets[index]
    return { ...newSet(previous?.setType), weightKg: previous?.weightKg ?? null, reps: previous?.reps ?? null }
  })
}

export async function startSession(template: Template | null) {
  const exercises: ActiveExercise[] = template
    ? await Promise.all(
        template.items.map(async (item) => ({
          exerciseId: item.exerciseId,
          restSeconds: item.restSeconds,
          repMin: item.repMin,
          repMax: item.repMax,
          sets: await prefill(item.exerciseId, item.targetSets),
        })),
      )
    : []

  await db.active.put({
    id: 'active',
    sessionId: crypto.randomUUID(),
    templateId: template?.id ?? null,
    name: template?.name ?? 'Treino livre',
    startedAt: null,
    elapsedMs: 0,
    runningSince: null,
    restEndsAt: null,
    exercises,
  })
}

async function mutate(change: (session: ActiveSession) => void) {
  await db.transaction('rw', db.active, async () => {
    const session = await db.active.get('active')
    if (!session) return
    change(session)
    await db.active.put(session)
  })
}

export const updateSet = (exerciseIndex: number, setIndex: number, patch: Partial<ActiveSet>) =>
  mutate((s) => Object.assign(s.exercises[exerciseIndex].sets[setIndex], patch))

export const cycleSetType = (exerciseIndex: number, setIndex: number, next: SetType) =>
  mutate((s) => {
    const set = s.exercises[exerciseIndex].sets[setIndex]
    set.setType = next
    if (set.completedAt) set.completedAt = null
    set.records = []
  })

// Bests stored locally + sets already completed earlier in this session.
async function runningBest(session: ActiveSession, exerciseId: string, skipSetId: string) {
  let best: Best | undefined = await db.bests.get(exerciseId)
  if (!best) return undefined
  for (const exercise of session.exercises) {
    if (exercise.exerciseId !== exerciseId) continue
    for (const set of exercise.sets) {
      if (set.id === skipSetId || !set.completedAt || set.weightKg === null || set.reps === null) continue
      best = mergeBest(best, exerciseId, { setType: set.setType, weightKg: set.weightKg, reps: set.reps })
    }
  }
  return best
}

export async function toggleComplete(exerciseIndex: number, setIndex: number): Promise<RecordKind[]> {
  const session = await db.active.get('active')
  if (!session) return []
  const exercise = session.exercises[exerciseIndex]
  const set = exercise.sets[setIndex]

  if (set.completedAt) {
    await mutate((s) => Object.assign(s.exercises[exerciseIndex].sets[setIndex], { completedAt: null, records: [] }))
    return []
  }
  if (set.weightKg === null || set.reps === null) return []

  const best = await runningBest(session, exercise.exerciseId, set.id)
  const records = detectRecords({ setType: set.setType, weightKg: set.weightKg, reps: set.reps }, best)

  await mutate((s) => {
    Object.assign(s.exercises[exerciseIndex].sets[setIndex], { completedAt: new Date().toISOString(), records })
    s.restEndsAt = Date.now() + exercise.restSeconds * 1000
    if (!s.startedAt) {
      s.startedAt = new Date().toISOString()
      s.runningSince = Date.now()
    }
  })
  return records
}

export const addSet = (exerciseIndex: number) =>
  mutate((s) => {
    const sets = s.exercises[exerciseIndex].sets
    const last = sets.at(-1)
    sets.push({ ...newSet(), weightKg: last?.weightKg ?? null, reps: last?.reps ?? null })
  })

export const removeSet = (exerciseIndex: number, setIndex: number) =>
  mutate((s) => {
    s.exercises[exerciseIndex].sets.splice(setIndex, 1)
  })

export async function addExercise(exerciseId: string) {
  const sets = await prefill(exerciseId, 3)
  await mutate((s) => {
    s.exercises.push({ exerciseId, restSeconds: DEFAULT_REST, repMin: null, repMax: null, sets })
  })
}

export const removeExercise = (exerciseIndex: number) =>
  mutate((s) => {
    s.exercises.splice(exerciseIndex, 1)
  })

export const elapsedSeconds = (session: Pick<ActiveSession, 'elapsedMs' | 'runningSince'>, now = Date.now()) =>
  Math.floor((session.elapsedMs + (session.runningSince ? now - session.runningSince : 0)) / 1000)

export const startClock = () =>
  mutate((s) => {
    if (s.runningSince) return
    s.startedAt ??= new Date().toISOString()
    s.runningSince = Date.now()
  })

export const pauseClock = () =>
  mutate((s) => {
    if (!s.runningSince) return
    s.elapsedMs += Date.now() - s.runningSince
    s.runningSince = null
  })

export const setRest = (restEndsAt: number | null) =>
  mutate((s) => {
    s.restEndsAt = restEndsAt
  })

export const discardSession = () => db.active.delete('active')

export async function finishSession() {
  const session = await db.active.get('active')
  if (!session) return

  const finishedAt = new Date().toISOString()
  const durationSeconds = elapsedSeconds(session)
  const sets = session.exercises.flatMap((exercise, exercisePosition) =>
    exercise.sets
      .filter((set) => set.completedAt && set.weightKg !== null && set.reps !== null)
      .map((set, setPosition) => ({
        id: set.id,
        exerciseId: exercise.exerciseId,
        exercisePosition,
        setPosition,
        setType: set.setType,
        weightKg: set.weightKg!,
        reps: set.reps!,
        completedAt: set.completedAt!,
        records: set.records,
      })),
  )

  // Keep only the final (highest) record per exercise and kind.
  const finalRecords = new Map<string, { setId: string; exerciseId: string; kind: RecordKind; value: number; achievedAt: string }>()
  for (const set of sets) {
    for (const kind of set.records) {
      const value = kind === 'weight' ? set.weightKg : kind === 'reps' ? set.reps : set.weightKg * (1 + set.reps / 30)
      const key = `${set.exerciseId}:${kind}`
      const current = finalRecords.get(key)
      if (!current || value >= current.value) {
        finalRecords.set(key, { setId: set.id, exerciseId: set.exerciseId, kind, value: Math.round(value * 100) / 100, achievedAt: set.completedAt })
      }
    }
  }

  const payload = {
    id: session.sessionId,
    templateId: session.templateId,
    name: session.name,
    startedAt: session.startedAt ?? finishedAt,
    finishedAt,
    durationSeconds,
    notes: null,
    sets: sets.map(({ records: _records, ...set }) => set),
    records: [...finalRecords.values()].map((r) => ({ id: crypto.randomUUID(), ...r })),
  }

  await db.transaction('rw', [db.active, db.outbox, db.bests, db.lastPerformance], async () => {
    await db.outbox.put({ id: session.sessionId, payload, createdAt: Date.now() })
    for (const exercise of session.exercises) {
      const done = sets.filter((s) => s.exerciseId === exercise.exerciseId)
      if (done.length === 0) continue
      let best = await db.bests.get(exercise.exerciseId)
      for (const set of done) best = mergeBest(best, exercise.exerciseId, set)
      if (best) await db.bests.put(best)
      await db.lastPerformance.put({
        exerciseId: exercise.exerciseId,
        sets: done.map(({ setType, weightKg, reps }) => ({ setType, weightKg, reps })),
      })
    }
    await db.active.delete('active')
  })

  flushOutbox().catch(() => {})
  return { sets: sets.length, records: payload.records.length }
}
