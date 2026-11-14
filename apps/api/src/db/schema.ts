import { date, integer, numeric, pgEnum, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const sexEnum = pgEnum('sex', ['male', 'female'])
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
  targetWeightKg: numeric({ precision: 5, scale: 2, mode: 'number' }),
  targetDate: date(),
  kcal: integer().notNull(),
  proteinG: smallint().notNull(),
  carbsG: smallint().notNull(),
  fatG: smallint().notNull(),
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const bodyLogs = pgTable('body_logs', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  loggedOn: date().notNull(),
  weightKg: numeric({ precision: 5, scale: 2, mode: 'number' }),
  waistCm: numeric({ precision: 5, scale: 1, mode: 'number' }),
  hipCm: numeric({ precision: 5, scale: 1, mode: 'number' }),
  armCm: numeric({ precision: 5, scale: 1, mode: 'number' }),
  thighCm: numeric({ precision: 5, scale: 1, mode: 'number' }),
})
