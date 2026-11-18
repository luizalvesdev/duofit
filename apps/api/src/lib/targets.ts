export type Sex = 'male' | 'female'
export type Objective = 'lose' | 'maintain' | 'gain'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'

// Copy of apps/web/src/lib/nutrition.ts, kept here so the API can compute targets itself.
const activityFactor: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}
const objectiveAdjust: Record<Objective, number> = { lose: 0.8, maintain: 1, gain: 1.1 }
const proteinPerKg: Record<Objective, number> = { lose: 2.0, maintain: 1.8, gain: 1.8 }
const FAT_PER_KG = 0.8

export function ageFrom(birthDate: string, today = new Date()) {
  const birth = new Date(`${birthDate}T00:00:00`)
  let age = today.getFullYear() - birth.getFullYear()
  const hadBirthday =
    today.getMonth() > birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate())
  if (!hadBirthday) age--
  return age
}

type Input = {
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  activityLevel: ActivityLevel
  objective: Objective
}

// Mifflin-St Jeor
export function suggestTargets({ sex, age, heightCm, weightKg, activityLevel, objective }: Input) {
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161)
  const tdee = bmr * activityFactor[activityLevel]
  const kcal = Math.round((tdee * objectiveAdjust[objective]) / 10) * 10

  const proteinG = Math.round(weightKg * proteinPerKg[objective])
  const fatG = Math.round(weightKg * FAT_PER_KG)
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4))

  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, proteinG, carbsG, fatG }
}
