import Dexie, { type EntityTable } from 'dexie'
import type { Best, Exercise, RecordKind, SetType, Template } from './workout'

export type ActiveSet = {
  id: string
  setType: SetType
  weightKg: number | null
  reps: number | null
  completedAt: string | null
  records: RecordKind[]
}

export type ActiveExercise = {
  exerciseId: string
  restSeconds: number
  repMin: number | null
  repMax: number | null
  sets: ActiveSet[]
}

export type ActiveSession = {
  id: 'active'
  sessionId: string
  templateId: string | null
  name: string
  startedAt: string | null
  elapsedMs: number
  runningSince: number | null
  restEndsAt: number | null
  restTotalMs?: number
  exercises: ActiveExercise[]
}

export type LastPerformance = {
  exerciseId: string
  sets: { setType: SetType; weightKg: number; reps: number }[]
}

export type PendingSession = {
  id: string
  payload: unknown
  createdAt: number
}

export const db = new Dexie('duofit') as Dexie & {
  exercises: EntityTable<Exercise, 'id'>
  templates: EntityTable<Template, 'id'>
  bests: EntityTable<Best, 'exerciseId'>
  lastPerformance: EntityTable<LastPerformance, 'exerciseId'>
  active: EntityTable<ActiveSession, 'id'>
  outbox: EntityTable<PendingSession, 'id'>
}

db.version(1).stores({
  exercises: 'id, name, primaryMuscle',
  templates: 'id',
  bests: 'exerciseId',
  lastPerformance: 'exerciseId',
  active: 'id',
  outbox: 'id, createdAt',
})

db.version(2).stores({}).upgrade((tx) =>
  tx.table('active').toCollection().modify((session) => {
    session.elapsedMs ??= 0
    session.runningSince ??= session.startedAt ? Date.parse(session.startedAt) : null
  }),
)
