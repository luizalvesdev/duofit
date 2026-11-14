export type User = { id: string; email: string; name: string }

export type Sex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type Objective = 'lose' | 'maintain' | 'gain'

export type Profile = {
  sex: Sex
  birthDate: string
  heightCm: number
  activityLevel: ActivityLevel
}

export type Goal = {
  objective: Objective
  targetWeightKg: number | null
  targetDate: string | null
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

export type ProfileResponse = {
  profile: Profile | null
  goal: Goal | null
  lastWeight: { weightKg: number | null; loggedOn: string } | null
}
