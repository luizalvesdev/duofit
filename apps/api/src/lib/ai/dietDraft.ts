import { and, desc, eq, gte, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { createDb } from '../../db/client'
import { bodyLogs, foodLogs, foods } from '../../db/schema'
import { activeMeals } from '../../routes/diet'
import { searchable } from '../search'
import { currentGoal } from '../stats'
import { ageFrom, suggestTargets } from '../targets'
import { AiError } from './errors'
import { clampTargets } from './guard'
import type { Answers } from './questionnaire'

type Db = ReturnType<typeof createDb>
type Profile = { sex: 'male' | 'female'; birthDate: string; heightCm: number; activityLevel: Parameters<typeof suggestTargets>[0]['activityLevel'] }

export type Macros = { kcal: number; proteinG: number; carbsG: number; fatG: number }
const round1 = (n: number) => Math.round(n * 10) / 10
const MAX_CANDIDATES = 150
const KCAL_TOLERANCE = 0.05

// How many candidates each TACO category contributes. The user's most-used foods always come first.
const QUOTA: Record<string, number> = {
  'Carnes e derivados': 28,
  'Pescados e frutos do mar': 10,
  'Ovos e derivados': 4,
  'Leite e derivados': 12,
  'Cereais e derivados': 22,
  'Leguminosas e derivados': 10,
  'Verduras, hortaliças e derivados': 22,
  'Frutas e derivados': 18,
  'Nozes e sementes': 6,
  'Gorduras e óleos': 4,
  Suplementos: 3,
}

const MEAT = ['Carnes e derivados', 'Pescados e frutos do mar']
const DAIRY_NAME = /leite|queijo|iogurte|requeijao|whey|manteiga|creme de leite/
const GLUTEN_NAME = /pao|macarrao|trigo|aveia|cevada|centeio|bolo|biscoito|bolacha|torrada|farinha de rosca|lasanha|pizza/
const PROCESSED = /embutid|linguica|salsicha|mortadela|presunto|bacon|torresmo|empanad|frit|refrigerante|cerveja|cacha|doce de|bolo|biscoito|sorvete|industrializ/
const RAW = /\bcru\b|\bcrua\b|\bcrus\b|\bcruas\b/
const PLAIN = /cozid|grelhad|assad|integral|natural|tipico/

function excludedByRestrictions(f: { category: string | null; searchName: string }, answers: Answers) {
  const r = answers.dietRestrictions ?? []
  if ((r.includes('vegetarian') || r.includes('vegan')) && f.category && MEAT.includes(f.category)) return true
  if (r.includes('vegan') && (f.category === 'Ovos e derivados' || f.category === 'Leite e derivados')) return true
  if (r.includes('lactose_free') && (f.category === 'Leite e derivados' || DAIRY_NAME.test(f.searchName))) return true
  if (r.includes('gluten_free') && GLUTEN_NAME.test(f.searchName)) return true
  return false
}

/** Words from free-text fields ("amendoim, frutos do mar") used to drop matching foods. */
function bannedWords(answers: Answers) {
  return searchable(`${answers.allergies ?? ''} ${answers.dislikedFoods ?? ''}`)
    .split(' ')
    .filter((w) => w.length >= 4)
}

function score(f: { category: string | null; searchName: string; name: string }) {
  let s = 0
  if (PLAIN.test(f.searchName)) s += 3
  if (PROCESSED.test(f.searchName)) s -= 4
  const rawIsNormal = f.category === 'Frutas e derivados' || f.category === 'Verduras, hortaliças e derivados' || f.category === 'Ovos e derivados'
  if (!rawIsNormal && RAW.test(f.searchName)) s -= 3
  return s
}

async function latestWeight(db: Db, userId: string) {
  const [row] = await db
    .select({ kg: bodyLogs.weightKg })
    .from(bodyLogs)
    .where(and(eq(bodyLogs.userId, userId), isNotNull(bodyLogs.weightKg)))
    .orderBy(desc(bodyLogs.loggedOn))
    .limit(1)
  return row?.kg ?? null
}

/**
 * Targets are computed here, never by the model: the user's goal (or a Mifflin-St Jeor suggestion when
 * there is none), clamped to the calorie floor, max deficit and protein range. The model only picks foods
 * and portions from a candidate list built in code.
 */
export async function dietDraftContext(db: Db, userId: string, answers: Answers, profile: Profile) {
  const [weightKg, goal, mealList] = await Promise.all([latestWeight(db, userId), currentGoal(db, userId), activeMeals(db, userId)])
  if (!weightKg || !goal) throw new AiError('ai_profile_required', 422, 'Set a goal and log your weight first')

  const suggested = suggestTargets({
    sex: profile.sex,
    age: ageFrom(profile.birthDate),
    heightCm: profile.heightCm,
    weightKg,
    activityLevel: profile.activityLevel,
    objective: goal.objective,
  })
  const clamped = clampTargets({
    sex: profile.sex,
    weightKg,
    tdee: suggested.tdee,
    kcal: goal.kcal,
    proteinG: goal.proteinG,
    fatG: goal.fatG,
  })
  const target: Macros = { kcal: clamped.kcal, proteinG: clamped.proteinG, carbsG: clamped.carbsG, fatG: clamped.fatG }

  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
  const [all, used] = await Promise.all([
    db
      .select({ id: foods.id, name: foods.name, searchName: foods.searchName, category: foods.category, kcal: foods.kcal, protein: foods.protein, carbs: foods.carbs, fat: foods.fat })
      .from(foods)
      .where(or(isNull(foods.ownerId), eq(foods.ownerId, userId))),
    db
      .select({ foodId: foodLogs.foodId })
      .from(foodLogs)
      .where(and(eq(foodLogs.userId, userId), gte(foodLogs.loggedOn, since)))
      .groupBy(foodLogs.foodId)
      .orderBy(desc(sql`count(*)`))
      .limit(40),
  ])

  const banned = bannedWords(answers)
  const allowed = all.filter((f) => !excludedByRestrictions(f, answers) && !banned.some((w) => f.searchName.includes(w)))
  const byId = new Map(allowed.map((f) => [f.id, f]))

  const picked = new Map<string, (typeof allowed)[number]>()
  for (const u of used) {
    const f = byId.get(u.foodId)
    if (f) picked.set(f.id, f)
  }
  for (const [category, quota] of Object.entries(QUOTA)) {
    const pool = allowed
      .filter((f) => f.category === category && !picked.has(f.id))
      .sort((a, b) => score(b) - score(a) || a.name.length - b.name.length)
    const have = [...picked.values()].filter((f) => f.category === category).length
    for (const f of pool.slice(0, Math.max(0, quota - have))) picked.set(f.id, f)
  }

  const candidates = [...picked.values()].slice(0, MAX_CANDIDATES)
  const byN = new Map(candidates.map((f, i) => [i + 1, f]))

  const input = {
    target,
    objective: goal.objective,
    meals: mealList.map((m) => m.name),
    mealsPerDay: answers.mealsPerDay ?? null,
    restrictions: answers.dietRestrictions ?? [],
    allergies: answers.allergies ?? '',
    dislikedFoods: answers.dislikedFoods ?? '',
    budget: answers.budget ?? null,
    candidates: candidates.map((f, i) => ({ n: i + 1, name: f.name, category: f.category, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat })),
  }

  return { input, byN, target, mealNames: mealList.map((m) => m.name), enough: candidates.length >= 20 }
}

export const dietDraftModelSchema = z.object({
  rationale: z.string().max(600),
  meals: z
    .array(
      z.object({
        name: z.string().max(40),
        items: z.array(z.object({ n: z.number().int(), grams: z.number() })).max(10),
      }),
    )
    .max(12),
})

type ModelDraft = z.infer<typeof dietDraftModelSchema>

export type DietDraft = {
  rationale: string
  target: Macros
  totals: Macros
  meals: {
    name: string
    items: ({ foodId: string; foodName: string; grams: number } & Macros)[]
  }[]
  warnings: string[]
}

const clampGrams = (g: number) => Math.min(Math.max(Math.round(g / 5) * 5, 5), 1000)

/**
 * Maps numeric ids to real foods, then scales every portion proportionally until total calories are within
 * +-5% of the target. When that does not converge, or protein is well under target, it says so in `warnings`.
 */
export function buildDietDraft(ctx: Awaited<ReturnType<typeof dietDraftContext>>, model: ModelDraft): DietDraft {
  type Line = { food: NonNullable<ReturnType<typeof ctx.byN.get>>; grams: number }
  const meals: { name: string; lines: Line[] }[] = []

  for (const m of model.meals) {
    const seen = new Set<number>()
    const lines: Line[] = []
    for (const it of m.items) {
      const food = ctx.byN.get(it.n)
      if (!food || seen.has(it.n) || !Number.isFinite(it.grams) || it.grams <= 0) continue
      seen.add(it.n)
      lines.push({ food, grams: clampGrams(it.grams) })
    }
    if (lines.length) meals.push({ name: m.name.trim() || `Refeição ${meals.length + 1}`, lines })
  }
  if (meals.length < 3 || meals.reduce((s, m) => s + m.lines.length, 0) < 8) {
    throw new AiError('ai_invalid_output', 502, 'The draft was too small to be a day plan')
  }

  const lineMacros = (l: Line): Macros => ({
    kcal: (l.food.kcal * l.grams) / 100,
    proteinG: (l.food.protein * l.grams) / 100,
    carbsG: (l.food.carbs * l.grams) / 100,
    fatG: (l.food.fat * l.grams) / 100,
  })
  const total = () => {
    const all = meals.flatMap((m) => m.lines.map(lineMacros))
    return {
      kcal: all.reduce((s, x) => s + x.kcal, 0),
      proteinG: all.reduce((s, x) => s + x.proteinG, 0),
      carbsG: all.reduce((s, x) => s + x.carbsG, 0),
      fatG: all.reduce((s, x) => s + x.fatG, 0),
    }
  }

  for (let i = 0; i < 4; i++) {
    const ratio = ctx.target.kcal / total().kcal
    if (Math.abs(ratio - 1) <= KCAL_TOLERANCE) break
    for (const m of meals) for (const l of m.lines) l.grams = clampGrams(l.grams * ratio)
  }

  const t = total()
  const totals: Macros = { kcal: Math.round(t.kcal), proteinG: round1(t.proteinG), carbsG: round1(t.carbsG), fatG: round1(t.fatG) }
  const warnings: string[] = []
  if (Math.abs(totals.kcal / ctx.target.kcal - 1) > KCAL_TOLERANCE) {
    warnings.push(`Não foi possível chegar a 5% da meta de ${ctx.target.kcal} kcal. Ajuste as porções antes de usar.`)
  }
  if (totals.proteinG < ctx.target.proteinG * 0.9) {
    warnings.push(`A proteína do rascunho (${totals.proteinG} g) ficou abaixo da meta (${ctx.target.proteinG} g).`)
  }

  return {
    rationale: model.rationale,
    target: ctx.target,
    totals,
    meals: meals.map((m) => ({
      name: m.name,
      items: m.lines.map((l) => {
        const x = lineMacros(l)
        return {
          foodId: l.food.id,
          foodName: l.food.name,
          grams: l.grams,
          kcal: Math.round(x.kcal),
          proteinG: round1(x.proteinG),
          carbsG: round1(x.carbsG),
          fatG: round1(x.fatG),
        }
      }),
    })),
    warnings,
  }
}
