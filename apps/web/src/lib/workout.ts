export type Muscle =
  | 'chest' | 'back' | 'lower_back' | 'shoulders' | 'traps' | 'biceps' | 'triceps' | 'forearms'
  | 'quads' | 'hamstrings' | 'glutes' | 'adductors' | 'abductors' | 'calves' | 'abs'
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'smith' | 'cable' | 'ez_bar' | 'bodyweight' | 'other'
export type SetType = 'normal' | 'warmup' | 'drop' | 'failure'
export type RecordKind = 'weight' | 'e1rm' | 'reps'

export type Exercise = {
  id: string
  name: string
  primaryMuscle: Muscle
  secondaryMuscles: Muscle[]
  equipment: Equipment
  imagePath: string | null
  ownerId: string | null
}

export type TemplateItem = {
  exerciseId: string
  targetSets: number
  repMin: number
  repMax: number
  restSeconds: number
  notes: string | null
}

export type Template = {
  id: string
  name: string
  weekdays: number[]
  items: TemplateItem[]
}

export type Best = {
  exerciseId: string
  weight: number
  e1rm: number
  repsByWeight: Record<string, number>
}

export const muscleLabels: Record<Muscle, string> = {
  chest: 'Peito',
  back: 'Costas',
  lower_back: 'Lombar',
  shoulders: 'Ombros',
  traps: 'Trapézio',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  forearms: 'Antebraço',
  quads: 'Quadríceps',
  hamstrings: 'Posterior',
  glutes: 'Glúteos',
  adductors: 'Adutores',
  abductors: 'Abdutores',
  calves: 'Panturrilha',
  abs: 'Abdômen',
}

export const equipmentLabels: Record<Equipment, string> = {
  barbell: 'Barra',
  dumbbell: 'Halter',
  machine: 'Máquina',
  smith: 'Smith',
  cable: 'Polia',
  ez_bar: 'Barra W',
  bodyweight: 'Peso corporal',
  other: 'Outro',
}

export const setTypeInfo: Record<SetType, { short: string; label: string; className: string }> = {
  normal: { short: '', label: 'Normal', className: 'text-zinc-300' },
  warmup: { short: 'A', label: 'Aquecimento', className: 'text-amber-400' },
  drop: { short: 'D', label: 'Drop set', className: 'text-sky-400' },
  failure: { short: 'F', label: 'Até a falha', className: 'text-red-400' },
}

export const setTypeOrder: SetType[] = ['normal', 'warmup', 'drop', 'failure']

export const recordLabels: Record<RecordKind, string> = {
  weight: 'Maior carga',
  e1rm: '1RM estimado',
  reps: 'Mais repetições',
}

export const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'
export const exerciseImage = (exercise: Pick<Exercise, 'imagePath'>) =>
  exercise.imagePath ? IMAGE_BASE + exercise.imagePath : null

export const estimateOneRepMax = (weightKg: number, reps: number) => weightKg * (1 + reps / 30)

export const countsForRecords = (type: SetType) => type === 'normal' || type === 'failure'

type SetLike = { setType: SetType; weightKg: number; reps: number }

// First time doing an exercise is never a PR: there is nothing to beat yet.
export function detectRecords(set: SetLike, best: Best | undefined): RecordKind[] {
  if (!best || !countsForRecords(set.setType) || set.reps <= 0) return []
  const kinds: RecordKind[] = []
  if (set.weightKg > best.weight) kinds.push('weight')
  if (estimateOneRepMax(set.weightKg, set.reps) > best.e1rm + 0.01) kinds.push('e1rm')
  const previousReps = best.repsByWeight[String(set.weightKg)]
  if (previousReps !== undefined && set.reps > previousReps) kinds.push('reps')
  return kinds
}

export function mergeBest(best: Best | undefined, exerciseId: string, set: SetLike): Best {
  const current = best ?? { exerciseId, weight: 0, e1rm: 0, repsByWeight: {} }
  if (!countsForRecords(set.setType) || set.reps <= 0) return current
  const key = String(set.weightKg)
  return {
    exerciseId,
    weight: Math.max(current.weight, set.weightKg),
    e1rm: Math.max(current.e1rm, estimateOneRepMax(set.weightKg, set.reps)),
    repsByWeight: { ...current.repsByWeight, [key]: Math.max(current.repsByWeight[key] ?? 0, set.reps) },
  }
}

export const formatKg = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ','))

export const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = Math.max(0, seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
