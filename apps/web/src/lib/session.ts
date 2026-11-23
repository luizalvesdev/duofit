import { db, type ActiveExercise, type ActiveSession, type ActiveSet } from './db'
import { cancelRestAlert, prepareRestAlert, scheduleRestAlert } from './restAlert'
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

export async function startSession(template: Template) {
  prepareRestAlert()
  const exercises: ActiveExercise[] = await Promise.all(
    template.items.map(async (item) => ({
      exerciseId: item.exerciseId,
      restSeconds: item.restSeconds,
      repMin: item.repMin,
      repMax: item.repMax,
      sets: await prefill(item.exerciseId, item.targetSets),
    })),
  )

  await db.active.put({
    id: 'active',
    sessionId: crypto.randomUUID(),
    templateId: template.id,
    name: template.name,
    startedAt: null,
    elapsedMs: 0,
    runningSince: null,
    restEndsAt: null,
    exercises,
  })
}

export const IDLE_LIMIT_MS = 20 * 60 * 1000

// Freshest interaction seen by this page (any tap/key/scroll). Persisted to the session at most every 30 s
// (mutations persist it immediately), so a reopened app can still tell how long it was left alone.
let lastActivity = 0
let persistedAt = 0

export function touchActivity() {
  const now = Date.now()
  lastActivity = now
  if (now - persistedAt > 30_000) {
    persistedAt = now
    void db.active.update('active', { lastActivityAt: now })
  }
}

async function mutate(change: (session: ActiveSession) => void, touch = true) {
  await db.transaction('rw', db.active, async () => {
    const session = await db.active.get('active')
    if (!session) return
    change(session)
    if (touch) session.lastActivityAt = lastActivity = Date.now()
    await db.active.put(session)
  })
}

// Stops the clock at the moment of the last interaction once the user has been idle for IDLE_LIMIT_MS,
// so the idle time doesn't count as training. The UI then asks whether they're still training.
export async function pauseIfIdle() {
  const idleSince = (s: ActiveSession | undefined) => {
    if (!s?.runningSince || s.idlePrompt) return null
    const last = Math.max(lastActivity, s.lastActivityAt ?? s.runningSince)
    return Date.now() - last >= IDLE_LIMIT_MS ? last : null
  }
  // Cheap read first: this runs every few seconds and a write would re-render live queries.
  if (idleSince(await db.active.get('active')) === null) return
  await mutate((s) => {
    const last = idleSince(s)
    if (last === null || !s.runningSince) return
    s.elapsedMs += Math.max(0, last - s.runningSince)
    s.runningSince = null
    s.idlePrompt = true
  }, false)
}

export const resumeAfterIdle = () =>
  mutate((s) => {
    s.idlePrompt = false
    s.runningSince ??= Date.now()
  })

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

export type CompleteResult = { ok: true; records: RecordKind[] } | { ok: false; missing: ('weight' | 'reps')[] }

export async function toggleComplete(
  exerciseIndex: number,
  setIndex: number,
  fallback: { weightKg: number | null; reps: number | null },
): Promise<CompleteResult> {
  const session = await db.active.get('active')
  if (!session) return { ok: true, records: [] }
  const exercise = session.exercises[exerciseIndex]
  const set = exercise.sets[setIndex]

  if (set.completedAt) {
    await mutate((s) => Object.assign(s.exercises[exerciseIndex].sets[setIndex], { completedAt: null, records: [] }))
    return { ok: true, records: [] }
  }

  // Empty fields take the placeholder (last session / bodyweight = 0), like Hevy.
  const weightKg = set.weightKg ?? fallback.weightKg
  const reps = set.reps ?? fallback.reps
  const missing = [...(weightKg === null ? ['weight' as const] : []), ...(reps === null ? ['reps' as const] : [])]
  if (missing.length) return { ok: false, missing }
  set.weightKg = weightKg
  set.reps = reps

  const best = await runningBest(session, exercise.exerciseId, set.id)
  const records = detectRecords({ setType: set.setType, weightKg: weightKg!, reps: reps! }, best)

  await mutate((s) => {
    Object.assign(s.exercises[exerciseIndex].sets[setIndex], { weightKg, reps, completedAt: new Date().toISOString(), records })
    s.restEndsAt = Date.now() + exercise.restSeconds * 1000
    s.restTotalMs = exercise.restSeconds * 1000
    if (!s.startedAt) {
      s.startedAt = new Date().toISOString()
      s.runningSince = Date.now()
    }
  })
  void scheduleRestAlert(Date.now() + exercise.restSeconds * 1000)
  return { ok: true, records }
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

// Swap the exercise but keep the slot: same number of sets, rest and rep range.
// Sets are re-prefilled from the new exercise's history, so loads from the old one don't leak over.
export async function replaceExercise(exerciseIndex: number, exerciseId: string) {
  const session = await db.active.get('active')
  const count = session?.exercises[exerciseIndex]?.sets.length ?? 3
  const sets = await prefill(exerciseId, count)
  await mutate((s) => {
    const block = s.exercises[exerciseIndex]
    if (block) Object.assign(block, { exerciseId, sets })
  })
}

export const setExerciseRest = (exerciseIndex: number, restSeconds: number) =>
  mutate((s) => {
    const block = s.exercises[exerciseIndex]
    if (block) block.restSeconds = Math.min(600, Math.max(0, Math.round(restSeconds)))
  })

export const removeExercise = (exerciseIndex: number) =>
  mutate((s) => {
    s.exercises.splice(exerciseIndex, 1)
  })

export const elapsedSeconds = (session: Pick<ActiveSession, 'elapsedMs' | 'runningSince'>, now = Date.now()) =>
  Math.floor((session.elapsedMs + (session.runningSince ? now - session.runningSince : 0)) / 1000)

export const startClock = () =>
  mutate((s) => {
    s.idlePrompt = false
    if (s.runningSince) return
    s.startedAt ??= new Date().toISOString()
    s.runningSince = Date.now()
  })

export const pauseClock = () =>
  mutate((s) => {
    s.idlePrompt = false
    if (!s.runningSince) return
    s.elapsedMs += Date.now() - s.runningSince
    s.runningSince = null
  })

export async function setRest(restEndsAt: number | null) {
  await mutate((s) => {
    s.restEndsAt = restEndsAt
  })
  if (restEndsAt === null) void cancelRestAlert()
  else void scheduleRestAlert(restEndsAt)
}

export async function discardSession() {
  void cancelRestAlert()
  await db.active.delete('active')
}

export async function finishSession() {
  const session = await db.active.get('active')
  if (!session) return
  void cancelRestAlert()

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
