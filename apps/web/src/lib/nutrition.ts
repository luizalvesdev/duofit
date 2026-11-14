import type { ActivityLevel, Objective, Sex } from './types'

export const activityLabels: Record<ActivityLevel, { label: string; factor: number }> = {
  sedentary: { label: 'Sedentário (pouco ou nenhum exercício)', factor: 1.2 },
  light: { label: 'Leve (1 a 3 treinos por semana)', factor: 1.375 },
  moderate: { label: 'Moderado (3 a 5 treinos por semana)', factor: 1.55 },
  active: { label: 'Ativo (6 a 7 treinos por semana)', factor: 1.725 },
  very_active: { label: 'Muito ativo (treino pesado + trabalho físico)', factor: 1.9 },
}

export const objectiveLabels: Record<Objective, string> = {
  lose: 'Perder gordura',
  maintain: 'Manter',
  gain: 'Ganhar massa',
}

const objectiveAdjust: Record<Objective, number> = { lose: 0.8, maintain: 1, gain: 1.1 }
const proteinPerKg: Record<Objective, number> = { lose: 2.0, maintain: 1.8, gain: 1.8 }
const FAT_PER_KG = 0.8

export function ageFrom(birthDate: string, today = new Date()) {
  const birth = new Date(`${birthDate}T00:00:00`)
  let age = today.getFullYear() - birth.getFullYear()
  const hadBirthday =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate())
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
  const tdee = bmr * activityLabels[activityLevel].factor
  const kcal = Math.round((tdee * objectiveAdjust[objective]) / 10) * 10

  const proteinG = Math.round(weightKg * proteinPerKg[objective])
  const fatG = Math.round(weightKg * FAT_PER_KG)
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4))

  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, proteinG, carbsG, fatG }
}

export const kcalFromMacros = (p: number, c: number, f: number) => p * 4 + c * 4 + f * 9

export const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
