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

type FoodLike = { category: string | null; searchName: string }

/**
 * A keyword the person can type ("porco", "frutos do mar") that stands for a whole food group, so the ban reaches
 * foods whose name never contains the typed word (pork is "pernil"/"lombo suíno", seafood is "merluza"/"abadejo").
 * `key` is tested against what the person wrote; a match drops every food in `category` or whose name matches `name`.
 */
const GROUPS: { key: RegExp; category?: string; name?: RegExp }[] = [
  { key: /fruto do mar|frutos do mar|marisco|camarao|lula|polvo|ostra|siri|caranguejo|mexilhao|lagosta|peixe|pescado/, category: 'Pescados e frutos do mar' },
  { key: /\bovo\b|\bovos\b|clara de ovo|gema/, category: 'Ovos e derivados' },
  { key: /\bleite\b|lactose|laticinio/, category: 'Leite e derivados', name: DAIRY_NAME },
  { key: /porco|suin|bacon|pernil|toucinho|panceta|presunto|lombo canadense|tender/, name: /suin|porco|pernil|bacon|toucinho|panceta|presunto|tender/ },
  { key: /frango|galinha|\bave\b/, name: /frango|galinha/ },
  { key: /\bcarne|\bboi\b|bovin|\bvaca\b/, category: 'Carnes e derivados' },
  { key: /amendoim/, name: /amendoim/ },
  { key: /soja|tofu/, name: /soja|tofu/ },
]

// One thing the person won't eat: a food group or a literal word, optionally with an exception kept in ("frango
// exceto peito de frango" bans chicken but keeps breast).
type BanRule = { category?: string; name?: RegExp; token?: string; except?: RegExp }

const EXCEPT = / exceto | excet | menos | so | somente /

/** Parses a free-text field ("porco, frango exceto peito de frango") into ban rules, one per listed item. */
function parseBans(text: string): BanRule[] {
  const s = searchable(text)
  if (!s) return []
  const rules: BanRule[] = []
  for (const clause of s.split(/,|;| e /).map((c) => c.trim()).filter(Boolean)) {
    const [banPart, exceptPart] = clause.split(EXCEPT)
    const banWords = new Set(banPart.split(' '))
    // Drop words shared with the ban ("frango" in "peito de frango") so the exception stays specific (just "peito").
    const exceptWords = (exceptPart ?? '').split(' ').filter((w) => w.length >= 3 && !banWords.has(w))
    const except = exceptWords.length ? new RegExp(exceptWords.join('|')) : undefined
    const group = GROUPS.find((g) => g.key.test(banPart))
    if (group) rules.push({ category: group.category, name: group.name, except })
    else for (const w of banPart.split(' ').filter((w) => w.length >= 3)) rules.push({ token: w, except })
  }
  return rules
}

const ruleHits = (f: FoodLike, r: BanRule) => {
  const hit = (r.category && f.category === r.category) || (r.name && r.name.test(f.searchName)) || (r.token && f.searchName.split(' ').includes(r.token))
  return !!hit && !(r.except && r.except.test(f.searchName))
}

/** Builds a reusable predicate `canEat(food)` for one person from their restrictions, allergies and dislikes. */
export function eaterFilter(answers: Answers) {
  const bans = [...parseBans(answers.allergies ?? ''), ...parseBans(answers.dislikedFoods ?? '')]
  return (f: FoodLike) => !excludedByRestrictions(f, answers) && !bans.some((r) => ruleHits(f, r))
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
/** The daily macro target for one person (their goal, or a Mifflin-St Jeor suggestion), clamped to safe bounds. */
export async function targetFor(db: Db, userId: string, profile: Profile) {
  const [weightKg, goal] = await Promise.all([latestWeight(db, userId), currentGoal(db, userId)])
  if (!weightKg || !goal) return null
  const suggested = suggestTargets({
    sex: profile.sex,
    age: ageFrom(profile.birthDate),
    heightCm: profile.heightCm,
    weightKg,
    activityLevel: profile.activityLevel,
    objective: goal.objective,
  })
  const clamped = clampTargets({ sex: profile.sex, weightKg, tdee: suggested.tdee, kcal: goal.kcal, proteinG: goal.proteinG, fatG: goal.fatG })
  const target: Macros = { kcal: clamped.kcal, proteinG: clamped.proteinG, carbsG: clamped.carbsG, fatG: clamped.fatG }
  return { target, objective: goal.objective }
}

export async function dietDraftContext(db: Db, userId: string, answers: Answers, profile: Profile) {
  const [computed, mealList] = await Promise.all([targetFor(db, userId, profile), activeMeals(db, userId)])
  if (!computed) throw new AiError('ai_profile_required', 422, 'Set a goal and log your weight first')
  const { target, objective } = computed

  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
  const [all, used] = await Promise.all([
    db
      .select({ id: foods.id, name: foods.name, searchName: foods.searchName, category: foods.category, ownerId: foods.ownerId, kcal: foods.kcal, protein: foods.protein, carbs: foods.carbs, fat: foods.fat })
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

  const canEat = eaterFilter(answers)
  const allowed = all.filter(canEat)
  const byId = new Map(allowed.map((f) => [f.id, f]))

  const picked = new Map<string, (typeof allowed)[number]>()
  // The person's own custom foods (e.g. a specific whey they registered) are always candidates.
  for (const f of allowed) if (f.ownerId) picked.set(f.id, f)
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
    objective,
    meals: mealList.map((m) => m.name),
    mealsPerDay: answers.mealsPerDay ?? null,
    restrictions: answers.dietRestrictions ?? [],
    allergies: answers.allergies ?? '',
    dislikedFoods: answers.dislikedFoods ?? '',
    preferences: answers.foodPreferences ?? '',
    supplements: answers.supplements ?? '',
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

type FitFood = { kcal: number; protein: number; carbs: number; fat: number }
const MACRO_KEYS = ['kcal', 'proteinG', 'carbsG', 'fatG'] as const
// How hard each macro is pulled toward target. Protein and calories matter most.
const MACRO_WEIGHT = { kcal: 1.5, proteinG: 2.5, carbsG: 1, fatG: 1 }

/**
 * Tunes each portion so the day hits all four macro targets at once (not just calories). Coordinate descent:
 * each food's grams is set to the value that minimises the weighted relative error across kcal/protein/carb/fat,
 * holding the others fixed, repeated until it settles. Bounded to 5-1000 g. Mutates `lines` in place.
 */
function fitPortions(lines: { food: FitFood; grams: number }[], target: Macros) {
  if (lines.length === 0) return
  const per = (f: FitFood) => ({ kcal: f.kcal / 100, proteinG: f.protein / 100, carbsG: f.carbs / 100, fatG: f.fat / 100 })
  const a = lines.map((l) => per(l.food))
  const tgt = { kcal: target.kcal || 1, proteinG: target.proteinG || 1, carbsG: target.carbsG || 1, fatG: target.fatG || 1 }

  for (let sweep = 0; sweep < 60; sweep++) {
    for (let i = 0; i < lines.length; i++) {
      let A = 0
      let B = 0
      for (const m of MACRO_KEYS) {
        let rest = 0
        for (let j = 0; j < lines.length; j++) if (j !== i) rest += lines[j].grams * a[j][m]
        const w = MACRO_WEIGHT[m] / (tgt[m] * tgt[m])
        A += w * a[i][m] * a[i][m]
        B += w * a[i][m] * (rest - tgt[m])
      }
      if (A > 0) lines[i].grams = Math.min(1000, Math.max(5, -B / A))
    }
  }
  for (const l of lines) l.grams = clampGrams(l.grams)
}

const MACRO_TOL = 0.1
/** Flags any macro (kcal/protein/carb/fat) that ended more than 10% off target after fitting. */
export function macroWarnings(totals: Macros, target: Macros): string[] {
  const w: string[] = []
  const off = (got: number, want: number) => want > 0 && Math.abs(got / want - 1) > MACRO_TOL
  if (off(totals.kcal, target.kcal)) w.push(`Calorias ficaram em ${Math.round(totals.kcal)} (meta ${target.kcal} kcal).`)
  if (off(totals.proteinG, target.proteinG)) w.push(`Proteína ficou em ${Math.round(totals.proteinG)} g (meta ${target.proteinG} g).`)
  if (off(totals.carbsG, target.carbsG)) w.push(`Carboidrato ficou em ${Math.round(totals.carbsG)} g (meta ${target.carbsG} g).`)
  if (off(totals.fatG, target.fatG)) w.push(`Gordura ficou em ${Math.round(totals.fatG)} g (meta ${target.fatG} g).`)
  return w
}

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

  fitPortions(meals.flatMap((m) => m.lines), ctx.target)

  const t = total()
  const totals: Macros = { kcal: Math.round(t.kcal), proteinG: round1(t.proteinG), carbsG: round1(t.carbsG), fatG: round1(t.fatG) }
  const warnings = macroWarnings(totals, ctx.target)

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

// ---------------------------------------------------------------------------
// Improve one meal: the user rewrites a single meal with a free-text instruction
// ---------------------------------------------------------------------------

export const improveMealSchema = z.object({
  items: z.array(z.object({ n: z.number().int(), grams: z.number() })).max(10),
})

export type DraftItem = DietDraft['meals'][number]['items'][number]

/** Maps one meal's model items (n, grams) to real foods with per-item macros. */
export function mealItemsFromModel(ctx: Awaited<ReturnType<typeof dietDraftContext>>, items: { n: number; grams: number }[]): DraftItem[] {
  const seen = new Set<number>()
  const out: DraftItem[] = []
  for (const it of items) {
    const food = ctx.byN.get(it.n)
    if (!food || seen.has(it.n) || !Number.isFinite(it.grams) || it.grams <= 0) continue
    seen.add(it.n)
    const g = clampGrams(it.grams)
    out.push({
      foodId: food.id,
      foodName: food.name,
      grams: g,
      kcal: Math.round((food.kcal * g) / 100),
      proteinG: round1((food.protein * g) / 100),
      carbsG: round1((food.carbs * g) / 100),
      fatG: round1((food.fat * g) / 100),
    })
  }
  return out
}

/** Sums the macros of a list of items, to recompute a plan's totals after a meal is edited. */
export function sumItems(items: DraftItem[]): Macros {
  return {
    kcal: items.reduce((s, i) => s + i.kcal, 0),
    proteinG: round1(items.reduce((s, i) => s + i.proteinG, 0)),
    carbsG: round1(items.reduce((s, i) => s + i.carbsG, 0)),
    fatG: round1(items.reduce((s, i) => s + i.fatG, 0)),
  }
}

// ---------------------------------------------------------------------------
// Duo (couple) diet: one complete, balanced plan per person, shown side by side
// ---------------------------------------------------------------------------

export type DuoMember = { userId: string; name: string; answers: Answers; profile: Profile }

/** Each member gets a full DietDraft (own meals, portions and totals), so each hits their own macros. */
export type DuoDietDraft = {
  members: ({ userId: string; name: string } & DietDraft)[]
}
