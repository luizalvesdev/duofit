// Creates (or recreates) the public demo account and a demo partner, filled with
// six weeks of workouts, records, body logs, a meal plan and a week of food diary.
// Safe to re-run: both demo users are deleted first (everything else cascades).
import { neon } from '@neondatabase/serverless'
import { inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from '../src/db/schema'
import { hashPassword } from '../src/lib/password'

const {
  bodyLogs, campaignMembers, campaigns, DEFAULT_MEALS, exercises, foodLogs, foods, goals, mealPlanItems, meals,
  personalRecords, profiles, sessionSets, templateExercises, users, workoutSessions, workoutTemplates,
} = schema

process.loadEnvFile('.dev.vars')
const db = drizzle(neon(process.env.DATABASE_URL!), { schema, casing: 'snake_case' })

export const DEMO_EMAIL = 'demo@duofit.demo'
export const DEMO_PASSWORD = 'duofit-demo'
const PARTNER_EMAIL = 'parceira@duofit.demo'
const WEEKS = 6

// Deterministic pseudo-random numbers so every reset produces the same data.
let seed = 42
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
const chance = (p: number) => rand() < p
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n: number) => {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}
const round = (value: number, step: number) => Math.round(value / step) * step

// ---------- reset ----------
await db.delete(users).where(inArray(users.email, [DEMO_EMAIL, PARTNER_EMAIL]))

const passwordHash = await hashPassword(DEMO_PASSWORD)
const [demo] = await db.insert(users).values({ email: DEMO_EMAIL, name: 'Visitante', passwordHash }).returning()
const [partner] = await db.insert(users).values({ email: PARTNER_EMAIL, name: 'Bia (demo)', passwordHash }).returning()

// ---------- catalog lookups ----------
const exerciseRows = await db.select({ id: exercises.id, slug: exercises.slug }).from(exercises)
const exerciseId = (slug: string) => {
  const row = exerciseRows.find((e) => e.slug === slug)
  if (!row) throw new Error(`exercise not found: ${slug}`)
  return row.id
}
const foodRows = await db.select().from(foods)
const food = (name: string) => {
  const row = foodRows.find((f) => f.name === name && f.ownerId === null)
  if (!row) throw new Error(`food not found: ${name}`)
  return row
}

// ---------- profile, goal, body ----------
type Person = { id: string; sex: 'male' | 'female'; birthDate: string; heightCm: number; startKg: number; endKg: number; age: number }
const people: Person[] = [
  { id: demo.id, sex: 'male', birthDate: '1996-04-12', heightCm: 178, startKg: 82.4, endKg: 79.1, age: 30 },
  { id: partner.id, sex: 'female', birthDate: '1998-09-03', heightCm: 165, startKg: 66.8, endKg: 64.2, age: 28 },
]

for (const p of people) {
  await db.insert(profiles).values({ userId: p.id, sex: p.sex, birthDate: p.birthDate, heightCm: p.heightCm, activityLevel: 'moderate' })
  // Same Mifflin-St Jeor math as web/src/lib/nutrition.ts (objective: lose).
  const bmr = 10 * p.startKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161)
  const kcal = round(bmr * 1.55 * 0.8, 10)
  const proteinG = Math.round(p.startKg * 2)
  const fatG = Math.round(p.startKg * 0.8)
  const carbsG = Math.round((kcal - proteinG * 4 - fatG * 9) / 4)
  await db.insert(goals).values({
    userId: p.id, objective: 'lose', targetWeightKg: p.endKg - 3, kcal, proteinG, carbsG, fatG, startedAt: daysAgo(WEEKS * 7 + 1),
  })

  const logs = []
  for (let day = WEEKS * 7; day >= 0; day -= 3) {
    const progress = 1 - day / (WEEKS * 7)
    const weightKg = Math.round((p.startKg + (p.endKg - p.startKg) * progress + (rand() - 0.5) * 0.6) * 10) / 10
    const waist = p.sex === 'male' ? 92 - 3.5 * progress : 76 - 2.5 * progress
    logs.push({ userId: p.id, loggedOn: iso(daysAgo(day)), weightKg, waistCm: day % 9 === 0 ? Math.round(waist * 10) / 10 : null })
  }
  await db.insert(bodyLogs).values(logs)
}

// ---------- workouts ----------
type Plan = { name: string; weekday: number; items: { slug: string; sets: number; repMin: number; repMax: number; rest: number; startKg: number; stepKg: number }[] }

const demoPlans: Plan[] = [
  { name: 'Treino A · Peito e tríceps', weekday: 1, items: [
    { slug: 'Barbell_Bench_Press_-_Medium_Grip', sets: 4, repMin: 6, repMax: 10, rest: 120, startKg: 60, stepKg: 2.5 },
    { slug: 'Incline_Dumbbell_Press', sets: 3, repMin: 8, repMax: 12, rest: 90, startKg: 22, stepKg: 2 },
    { slug: 'Cable_Crossover', sets: 3, repMin: 10, repMax: 15, rest: 60, startKg: 15, stepKg: 2.5 },
    { slug: 'Triceps_Pushdown_-_Rope_Attachment', sets: 3, repMin: 10, repMax: 12, rest: 60, startKg: 22.5, stepKg: 2.5 },
  ] },
  { name: 'Treino B · Costas e bíceps', weekday: 3, items: [
    { slug: 'Wide-Grip_Lat_Pulldown', sets: 4, repMin: 8, repMax: 12, rest: 90, startKg: 55, stepKg: 2.5 },
    { slug: 'Bent_Over_Barbell_Row', sets: 4, repMin: 6, repMax: 10, rest: 120, startKg: 50, stepKg: 2.5 },
    { slug: 'Seated_Cable_Rows', sets: 3, repMin: 10, repMax: 12, rest: 90, startKg: 50, stepKg: 2.5 },
    { slug: 'Barbell_Curl', sets: 3, repMin: 8, repMax: 12, rest: 60, startKg: 25, stepKg: 2.5 },
  ] },
  { name: 'Treino C · Pernas e ombros', weekday: 5, items: [
    { slug: 'Barbell_Squat', sets: 4, repMin: 6, repMax: 10, rest: 150, startKg: 70, stepKg: 5 },
    { slug: 'Leg_Press', sets: 3, repMin: 10, repMax: 12, rest: 120, startKg: 160, stepKg: 10 },
    { slug: 'Lying_Leg_Curls', sets: 3, repMin: 10, repMax: 12, rest: 60, startKg: 35, stepKg: 2.5 },
    { slug: 'Dumbbell_Shoulder_Press', sets: 3, repMin: 8, repMax: 12, rest: 90, startKg: 18, stepKg: 2 },
    { slug: 'Side_Lateral_Raise', sets: 3, repMin: 12, repMax: 15, rest: 60, startKg: 8, stepKg: 1 },
  ] },
]

const partnerPlans: Plan[] = [
  { name: 'Inferiores', weekday: 2, items: [
    { slug: 'Barbell_Squat', sets: 4, repMin: 8, repMax: 12, rest: 120, startKg: 35, stepKg: 2.5 },
    { slug: 'Romanian_Deadlift', sets: 3, repMin: 8, repMax: 12, rest: 120, startKg: 30, stepKg: 2.5 },
    { slug: 'Leg_Extensions', sets: 3, repMin: 12, repMax: 15, rest: 60, startKg: 30, stepKg: 2.5 },
    { slug: 'Standing_Calf_Raises', sets: 3, repMin: 12, repMax: 15, rest: 45, startKg: 40, stepKg: 5 },
  ] },
  { name: 'Superiores', weekday: 4, items: [
    { slug: 'Wide-Grip_Lat_Pulldown', sets: 3, repMin: 10, repMax: 12, rest: 90, startKg: 30, stepKg: 2.5 },
    { slug: 'Dumbbell_Bench_Press', sets: 3, repMin: 8, repMax: 12, rest: 90, startKg: 10, stepKg: 1 },
    { slug: 'Seated_Cable_Rows', sets: 3, repMin: 10, repMax: 12, rest: 90, startKg: 30, stepKg: 2.5 },
    { slug: 'Side_Lateral_Raise', sets: 3, repMin: 12, repMax: 15, rest: 45, startKg: 4, stepKg: 1 },
  ] },
]

type Best = { weight: number; e1rm: number; repsByWeight: Record<string, number> }
const e1rm = (kg: number, reps: number) => kg * (1 + reps / 30)

async function seedWorkouts(userId: string, plans: Plan[], skipChance: number) {
  const templateIds: string[] = []
  for (const [position, plan] of plans.entries()) {
    const [template] = await db.insert(workoutTemplates).values({ userId, name: plan.name, weekdays: [plan.weekday], position }).returning()
    templateIds.push(template.id)
    await db.insert(templateExercises).values(plan.items.map((item, i) => ({
      templateId: template.id, exerciseId: exerciseId(item.slug), position: i,
      targetSets: item.sets, repMin: item.repMin, repMax: item.repMax, restSeconds: item.rest,
    })))
  }

  const bests = new Map<string, Best>()
  const sessions = []
  const sets = []
  const records: (typeof personalRecords.$inferInsert & { value: number })[] = []

  for (let day = WEEKS * 7; day >= 1; day--) {
    const date = daysAgo(day)
    const planIndex = plans.findIndex((p) => p.weekday === date.getDay())
    if (planIndex < 0 || chance(skipChance)) continue
    const plan = plans[planIndex]
    const week = Math.floor((WEEKS * 7 - day) / 7)

    const sessionId = crypto.randomUUID()
    const startedAt = new Date(date)
    startedAt.setHours(18, Math.floor(rand() * 40), 0, 0)
    let clock = startedAt.getTime() + 5 * 60_000
    const sessionRecords = new Map<string, (typeof records)[number]>()

    for (const [exercisePosition, item] of plan.items.entries()) {
      const exId = exerciseId(item.slug)
      // Load goes up every ~2 weeks, with a stall now and then.
      const steps = Math.floor(week / 2) + (week >= 4 && chance(0.4) ? 1 : 0)
      const weightKg = item.startKg + steps * item.stepKg
      const best = bests.get(exId)

      for (let setPosition = 0; setPosition < item.sets; setPosition++) {
        const reps = Math.max(item.repMin, item.repMax - setPosition - (chance(0.3) ? 1 : 0) + (week % 2))
        clock += (item.rest + 40) * 1000
        const setId = crypto.randomUUID()
        sets.push({ id: setId, sessionId, exerciseId: exId, exercisePosition, setPosition, setType: 'normal' as const, weightKg, reps, completedAt: new Date(clock) })

        if (best) {
          const kinds: { kind: 'weight' | 'e1rm' | 'reps'; value: number }[] = []
          if (weightKg > best.weight) kinds.push({ kind: 'weight', value: weightKg })
          if (e1rm(weightKg, reps) > best.e1rm + 0.01) kinds.push({ kind: 'e1rm', value: Math.round(e1rm(weightKg, reps) * 100) / 100 })
          const previousReps = best.repsByWeight[String(weightKg)]
          if (previousReps !== undefined && reps > previousReps) kinds.push({ kind: 'reps', value: reps })
          for (const { kind, value } of kinds) {
            const key = `${exId}:${kind}`
            const current = sessionRecords.get(key)
            if (!current || value > current.value) {
              sessionRecords.set(key, { id: crypto.randomUUID(), userId, exerciseId: exId, setId, kind, value, achievedAt: new Date(clock) })
            }
          }
        }
      }

      // Update all-time bests after the session (the app compares against previous sessions).
      const done = sets.filter((s) => s.sessionId === sessionId && s.exerciseId === exId)
      const next: Best = best ?? { weight: 0, e1rm: 0, repsByWeight: {} }
      for (const s of done) {
        next.weight = Math.max(next.weight, s.weightKg)
        next.e1rm = Math.max(next.e1rm, e1rm(s.weightKg, s.reps))
        next.repsByWeight[String(s.weightKg)] = Math.max(next.repsByWeight[String(s.weightKg)] ?? 0, s.reps)
      }
      bests.set(exId, next)
    }

    const finishedAt = new Date(clock + 3 * 60_000)
    sessions.push({
      id: sessionId, userId, templateId: templateIds[planIndex], name: plan.name, startedAt, finishedAt,
      durationSeconds: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
    })
    records.push(...sessionRecords.values())
  }

  await db.insert(workoutSessions).values(sessions)
  for (let i = 0; i < sets.length; i += 200) await db.insert(sessionSets).values(sets.slice(i, i + 200))
  if (records.length) await db.insert(personalRecords).values(records)
  return { sessions: sessions.length, sets: sets.length, records: records.length }
}

const demoStats = await seedWorkouts(demo.id, demoPlans, 0.1)
const partnerStats = await seedWorkouts(partner.id, partnerPlans, 0.15)

// ---------- diet ----------
type MealPlan = Record<string, [string, number][]>

const demoMealPlan: MealPlan = {
  'Café da manhã': [['Pão, trigo, francês', 50], ['Ovo, de galinha, inteiro, cozido/10minutos', 100], ['Banana, prata, crua', 90], ['Café, infusão 10%', 150]],
  'Almoço': [['Arroz, tipo 1, cozido', 150], ['Feijão, carioca, cozido', 100], ['Frango, peito, sem pele, grelhado', 150], ['Alface, crespa, crua', 30], ['Tomate, com semente, cru', 60]],
  'Lanche': [['Iogurte, natural', 170], ['Aveia, flocos, crua', 30], ['Whey protein concentrado (rótulo típico)', 30]],
  'Jantar': [['Batata, doce, cozida', 200], ['Carne, bovina, patinho, sem gordura, grelhado', 140], ['Tomate, com semente, cru', 60]],
  'Ceia': [['Leite, de vaca, desnatado (rótulo típico)', 200], ['Maçã, Fuji, com casca, crua', 130]],
}

const partnerMealPlan: MealPlan = {
  'Café da manhã': [['Pão, trigo, forma, integral', 50], ['Queijo, minas, frescal', 30], ['Café, infusão 10%', 150]],
  'Almoço': [['Arroz, tipo 1, cozido', 100], ['Feijão, carioca, cozido', 80], ['Frango, peito, sem pele, grelhado', 120], ['Alface, crespa, crua', 40]],
  'Lanche': [['Iogurte, natural', 170], ['Banana, prata, crua', 90]],
  'Jantar': [['Batata, doce, cozida', 150], ['Ovo, de galinha, inteiro, cozido/10minutos', 100], ['Tomate, com semente, cru', 60]],
  'Ceia': [['Maçã, Fuji, com casca, crua', 130]],
}

const scale = (per100: number, grams: number) => Math.round(((per100 * grams) / 100) * 10) / 10

async function seedDiet(userId: string, mealPlan: MealPlan) {
  const mealRows = await db.insert(meals).values(DEFAULT_MEALS.map((name, position) => ({ userId, name, position }))).returning()
  const planRows = await db.insert(mealPlanItems).values(
    Object.entries(mealPlan).flatMap(([mealName, items]) => {
      const meal = mealRows.find((m) => m.name === mealName)!
      return items.map(([foodName, grams], position) => ({ userId, mealId: meal.id, foodId: food(foodName).id, grams, position }))
    }),
  ).returning()

  // Last 7 days plus today (today only up to lunch). Mostly follows the plan, with some misses and portion drift.
  const logs = []
  for (let day = 7; day >= 0; day--) {
    for (const item of planRows) {
      const meal = mealRows.find((m) => m.id === item.mealId)!
      if (day === 0 && meal.position > 1) continue
      if (!chance(day === 0 ? 1 : 0.85)) continue
      const f = foodRows.find((x) => x.id === item.foodId)!
      const grams = round(item.grams * (0.85 + rand() * 0.35), 5)
      logs.push({
        userId, loggedOn: iso(daysAgo(day)), mealId: item.mealId, foodId: f.id, foodName: f.name, grams,
        kcal: scale(f.kcal, grams), protein: scale(f.protein, grams), carbs: scale(f.carbs, grams), fat: scale(f.fat, grams),
        planItemId: item.id,
      })
    }
  }
  await db.insert(foodLogs).values(logs)
  return logs.length
}

const demoLogs = await seedDiet(demo.id, demoMealPlan)
const partnerLogs = await seedDiet(partner.id, partnerMealPlan)

// ---------- duo ----------
const [campaign] = await db.insert(campaigns).values({
  name: 'Projeto Verão', inviteCode: `DEMO${Math.floor(rand() * 9000 + 1000)}`, startsOn: iso(daysAgo(WEEKS * 7)), createdBy: demo.id,
}).returning()
await db.insert(campaignMembers).values([
  { campaignId: campaign.id, userId: demo.id, shareDiet: true },
  { campaignId: campaign.id, userId: partner.id, shareDiet: true },
])

console.log(`demo account: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`)
console.log(`demo: ${JSON.stringify(demoStats)}, ${demoLogs} food logs`)
console.log(`partner: ${JSON.stringify(partnerStats)}, ${partnerLogs} food logs`)
