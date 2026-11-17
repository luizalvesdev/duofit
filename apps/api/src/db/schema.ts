import { sql } from 'drizzle-orm'
import { boolean, check, date, index, integer, numeric, pgEnum, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

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
  exerciseId: uuid().notNull().references(() => exercises.id, { onDelete: 'cascade' }),
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
  durationSeconds: integer().notNull().default(0),
  notes: text(),
}, (t) => [index().on(t.userId, t.startedAt)])

export const sessionSets = pgTable('session_sets', {
  id: uuid().primaryKey(),
  sessionId: uuid().notNull().references(() => workoutSessions.id, { onDelete: 'cascade' }),
  exerciseId: uuid().notNull().references(() => exercises.id, { onDelete: 'cascade' }),
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
  exerciseId: uuid().notNull().references(() => exercises.id, { onDelete: 'cascade' }),
  setId: uuid().notNull().references(() => sessionSets.id, { onDelete: 'cascade' }),
  kind: recordKindEnum().notNull(),
  value: numeric({ precision: 7, scale: 2, mode: 'number' }).notNull(),
  achievedAt: timestamp({ withTimezone: true }).notNull(),
}, (t) => [index().on(t.userId, t.exerciseId)])

export const foodSourceEnum = pgEnum('food_source', ['taco', 'reference', 'custom'])

const per100 = (precision = 6) => numeric({ precision, scale: 1, mode: 'number' }).notNull()

export const foods = pgTable('foods', {
  id: uuid().primaryKey().defaultRandom(),
  source: foodSourceEnum().notNull(),
  sourceKey: text().unique(),
  name: text().notNull(),
  searchName: text().notNull(),
  category: text(),
  kcal: per100(),
  protein: per100(),
  carbs: per100(),
  fat: per100(),
  fiber: per100(),
  servingName: text(),
  servingGrams: numeric({ precision: 6, scale: 1, mode: 'number' }),
  ownerId: uuid().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [index().on(t.ownerId)])

export const DEFAULT_MEALS = ['Café da manhã', 'Almoço', 'Lanche', 'Jantar', 'Ceia']

// User-defined meal slots. Removing a meal archives it so past diary entries keep their meal name.
export const meals = pgTable('meals', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  position: smallint().notNull(),
  archivedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [index().on(t.userId)])

export const mealPlanItems = pgTable('meal_plan_items', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  mealId: uuid().notNull().references(() => meals.id, { onDelete: 'cascade' }),
  foodId: uuid().notNull().references(() => foods.id, { onDelete: 'cascade' }),
  grams: numeric({ precision: 6, scale: 1, mode: 'number' }).notNull(),
  position: smallint().notNull(),
}, (t) => [index().on(t.userId)])

export const foodLogs = pgTable('food_logs', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  loggedOn: date().notNull(),
  mealId: uuid().notNull().references(() => meals.id, { onDelete: 'cascade' }),
  foodId: uuid().notNull().references(() => foods.id, { onDelete: 'cascade' }),
  foodName: text().notNull(),
  grams: numeric({ precision: 6, scale: 1, mode: 'number' }).notNull(),
  kcal: numeric({ precision: 7, scale: 1, mode: 'number' }).notNull(),
  protein: numeric({ precision: 6, scale: 1, mode: 'number' }).notNull(),
  carbs: numeric({ precision: 6, scale: 1, mode: 'number' }).notNull(),
  fat: numeric({ precision: 6, scale: 1, mode: 'number' }).notNull(),
  planItemId: uuid().references(() => mealPlanItems.id, { onDelete: 'set null' }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [index().on(t.userId, t.loggedOn)])

export const campaigns = pgTable('campaigns', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  inviteCode: text().notNull().unique(),
  startsOn: date().notNull(),
  endsOn: date(),
  createdBy: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const campaignMembers = pgTable('campaign_members', {
  campaignId: uuid().notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  shareDiet: boolean().notNull().default(false),
  joinedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.campaignId, t.userId] }), index().on(t.userId)])

// One-time password reset links. Only a SHA-256 of the token is stored.
export const passwordResets = pgTable('password_resets', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text().notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  usedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [index().on(t.userId)])
