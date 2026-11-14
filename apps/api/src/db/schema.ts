import { sql } from 'drizzle-orm'
import { check, date, index, integer, numeric, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const sexEnum = pgEnum('sex', ['male', 'female'])
export const objectiveEnum = pgEnum('objective', ['lose', 'maintain', 'gain'])
export const activityEnum = pgEnum('activity_level', ['sedentary', 'light', 'moderate', 'active', 'very_active'])

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const profiles = pgTable('profiles', {
  userId: uuid().primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  sex: sexEnum().notNull(),
  birthDate: date().notNull(),
  heightCm: smallint().notNull(),
  activityLevel: activityEnum().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const goals = pgTable('goals', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  objective: objectiveEnum().notNull(),
  targetWeightKg: numeric({ precision: 5, scale: 2, mode: 'number' }),
  targetDate: date(),
  kcal: integer().notNull(),
  proteinG: smallint().notNull(),
  carbsG: smallint().notNull(),
  fatG: smallint().notNull(),
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [index().on(t.userId, t.startedAt)])

export const bodyLogs = pgTable('body_logs', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  loggedOn: date().notNull(),
  weightKg: numeric({ precision: 5, scale: 2, mode: 'number' }),
  waistCm: numeric({ precision: 5, scale: 1, mode: 'number' }),
  hipCm: numeric({ precision: 5, scale: 1, mode: 'number' }),
  armCm: numeric({ precision: 5, scale: 1, mode: 'number' }),
  thighCm: numeric({ precision: 5, scale: 1, mode: 'number' }),
}, (t) => [uniqueIndex().on(t.userId, t.loggedOn)])

export const muscleEnum = pgEnum('muscle', [
  'chest', 'back', 'lower_back', 'shoulders', 'traps', 'biceps', 'triceps', 'forearms',
  'quads', 'hamstrings', 'glutes', 'adductors', 'abductors', 'calves', 'abs',
])
export const equipmentEnum = pgEnum('equipment', ['barbell', 'dumbbell', 'machine', 'smith', 'cable', 'ez_bar', 'bodyweight', 'other'])
export const setTypeEnum = pgEnum('set_type', ['normal', 'warmup', 'drop', 'failure'])
export const recordKindEnum = pgEnum('record_kind', ['weight', 'e1rm', 'reps'])

export type Muscle = (typeof muscleEnum.enumValues)[number]
export type Equipment = (typeof equipmentEnum.enumValues)[number]

export const exercises = pgTable('exercises', {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().unique(),
  name: text().notNull(),
  primaryMuscle: muscleEnum().notNull(),
  secondaryMuscles: muscleEnum().array().notNull().default(sql`'{}'`),
  equipment: equipmentEnum().notNull(),
  imagePath: text(),
  ownerId: uuid().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [index().on(t.ownerId)])

export const workoutTemplates = pgTable('workout_templates', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  weekdays: smallint().array().notNull().default(sql`'{}'`),
  position: smallint().notNull().default(0),
  archivedAt: timestamp({ withTimezone: true }),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [index().on(t.userId)])

export const templateExercises = pgTable('template_exercises', {
  id: uuid().primaryKey().defaultRandom(),
  templateId: uuid().notNull().references(() => workoutTemplates.id, { onDelete: 'cascade' }),
  exerciseId: uuid().notNull().references(() => exercises.id),
  position: smallint().notNull(),
  targetSets: smallint().notNull(),
  repMin: smallint().notNull(),
  repMax: smallint().notNull(),
  restSeconds: smallint().notNull(),
  notes: text(),
}, (t) => [index().on(t.templateId), check('rep_range', sql`${t.repMin} <= ${t.repMax}`)])

export const workoutSessions = pgTable('workout_sessions', {
  id: uuid().primaryKey(),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  templateId: uuid().references(() => workoutTemplates.id, { onDelete: 'set null' }),
  name: text().notNull(),
  startedAt: timestamp({ withTimezone: true }).notNull(),
  finishedAt: timestamp({ withTimezone: true }).notNull(),
  notes: text(),
}, (t) => [index().on(t.userId, t.startedAt)])

export const sessionSets = pgTable('session_sets', {
  id: uuid().primaryKey(),
  sessionId: uuid().notNull().references(() => workoutSessions.id, { onDelete: 'cascade' }),
  exerciseId: uuid().notNull().references(() => exercises.id),
  exercisePosition: smallint().notNull(),
  setPosition: smallint().notNull(),
  setType: setTypeEnum().notNull().default('normal'),
  weightKg: numeric({ precision: 6, scale: 2, mode: 'number' }).notNull(),
  reps: smallint().notNull(),
  completedAt: timestamp({ withTimezone: true }).notNull(),
}, (t) => [index().on(t.sessionId), index().on(t.exerciseId)])

export const personalRecords = pgTable('personal_records', {
  id: uuid().primaryKey(),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  exerciseId: uuid().notNull().references(() => exercises.id),
  setId: uuid().notNull().references(() => sessionSets.id, { onDelete: 'cascade' }),
  kind: recordKindEnum().notNull(),
  value: numeric({ precision: 7, scale: 2, mode: 'number' }).notNull(),
  achievedAt: timestamp({ withTimezone: true }).notNull(),
}, (t) => [index().on(t.userId, t.exerciseId)])
