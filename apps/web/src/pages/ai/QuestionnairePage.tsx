import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Page, PageTitle } from '../../components/AppLayout'
import { AiConsent } from '../../components/AiConsent'
import { Button, ErrorText, Field, Input, Select } from '../../components/ui'
import { api } from '../../lib/api'
import type { AiProfile, Answers } from '../../lib/ai'
import { Loading, Offline, useApi } from '../../lib/useApi'
import { equipmentLabels, muscleLabels, type Equipment, type Muscle } from '../../lib/workout'

const STEPS = ['Treino', 'Dieta', 'Saúde'] as const

const experienceLabels = { beginner: 'Iniciante (menos de 6 meses)', intermediate: 'Intermediário (6 meses a 2 anos)', advanced: 'Avançado (mais de 2 anos)' }
const cardioLabels = { none: 'Não quero cardio', some: 'Um pouco', lots: 'Bastante' }
const restrictionLabels = { vegetarian: 'Vegetariano', vegan: 'Vegano', lactose_free: 'Sem lactose', gluten_free: 'Sem glúten' }
const budgetLabels = { low: 'Econômico', medium: 'Médio', high: 'Sem restrição' }
const screeningLabels = {
  pregnantOrNursing: 'Estou grávida ou amamentando',
  eatingDisorderHistory: 'Tenho ou já tive transtorno alimentar',
  relevantMedicalCondition: 'Tenho condição médica que afeta treino ou alimentação (ex.: cardiopatia, diabetes, hipertensão)',
  relevantMedication: 'Uso medicação que afeta treino ou alimentação',
}

const toggle = <T,>(list: T[] | undefined, value: T) => {
  const current = list ?? []
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
}

function Chips<T extends string>({ options, selected, onToggle }: { options: Record<T, string>; selected: T[] | undefined; onToggle: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(options) as T[]).map((value) => {
        const on = selected?.includes(value)
        return (
          <button
            key={value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(value)}
            className={`min-h-10 rounded-full border px-3.5 text-sm ${on ? 'border-lime-400 bg-lime-400/10 text-lime-300' : 'border-zinc-800 text-zinc-400'}`}
          >
            {value in options ? options[value] : value}
          </button>
        )
      })}
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-semibold text-zinc-400">{title}</span>
      {children}
    </div>
  )
}

function Form({ initial }: { initial: Answers }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') ?? '/'
  const [step, setStep] = useState(0)
  const [a, setA] = useState<Answers>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [blocked, setBlocked] = useState(false)
  const set = (patch: Partial<Answers>) => setA((prev) => ({ ...prev, ...patch }))
  const screening = a.screening ?? { pregnantOrNursing: false, eatingDisorderHistory: false, relevantMedicalCondition: false, relevantMedication: false }

  const trainingOk = !!a.experience && !!a.daysPerWeek && !!a.minutesPerSession && !!a.equipment?.length

  async function save() {
    setSaving(true)
    setError('')
    try {
      await api('/ai/profile', { method: 'PUT', body: { answers: { ...a, screening } } })
      if (Object.values(screening).some(Boolean)) setBlocked(true)
      else navigate(next)
    } catch {
      setError('Não foi possível salvar. Tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  if (blocked) {
    return (
      <section className="card grid gap-3 p-6">
        <h2 className="num text-2xl font-bold">Procure um profissional</h2>
        <p className="text-sm leading-relaxed text-zinc-400">
          Pelas suas respostas, o assistente de IA fica desativado: nesse caso o acompanhamento precisa ser feito por um médico, nutricionista ou educador físico. Suas respostas foram salvas e você pode mudá-las quando quiser.
        </p>
        <Link to="/" className="text-lime-400">Voltar ao início</Link>
      </section>
    )
  }

  return (
    <div className="grid gap-5">
      <div className="flex gap-2" aria-label={`Etapa ${step + 1} de ${STEPS.length}`}>
        {STEPS.map((label, i) => (
          <div key={label} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= step ? 'bg-lime-400' : 'bg-zinc-800'}`} />
            <span className={`mt-1 block text-xs ${i === step ? 'text-zinc-200' : 'text-muted'}`}>{label}</span>
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="grid gap-5">
          <Group title="Experiência com treino">
            <Chips options={experienceLabels} selected={a.experience ? [a.experience] : []} onToggle={(v) => set({ experience: v })} />
          </Group>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dias por semana">
              <Select value={a.daysPerWeek ?? ''} onChange={(e) => set({ daysPerWeek: Number(e.target.value) || undefined })}>
                <option value="">Escolha</option>
                {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} dias</option>)}
              </Select>
            </Field>
            <Field label="Minutos por treino">
              <Select value={a.minutesPerSession ?? ''} onChange={(e) => set({ minutesPerSession: Number(e.target.value) || undefined })}>
                <option value="">Escolha</option>
                {[30, 45, 60, 75, 90, 120].map((n) => <option key={n} value={n}>{n} min</option>)}
              </Select>
            </Field>
          </div>
          <Group title="Equipamentos disponíveis">
            <Chips<Equipment> options={equipmentLabels} selected={a.equipment} onToggle={(v) => set({ equipment: toggle(a.equipment, v) })} />
          </Group>
          <Group title="Músculos para dar mais foco (opcional)">
            <Chips<Muscle> options={muscleLabels} selected={a.focusMuscles} onToggle={(v) => set({ focusMuscles: toggle(a.focusMuscles, v) })} />
          </Group>
          <Group title="Regiões com lesão ou limitação (opcional)">
            <Chips<Muscle> options={muscleLabels} selected={a.injuryRegions} onToggle={(v) => set({ injuryRegions: toggle(a.injuryRegions, v) })} />
          </Group>
          <Field label="Detalhes sobre lesões (opcional)">
            <Input value={a.injuryNotes ?? ''} maxLength={500} onChange={(e) => set({ injuryNotes: e.target.value })} placeholder="Ex.: dor no ombro direito em desenvolvimento" />
          </Field>
          <Group title="Cardio">
            <Chips options={cardioLabels} selected={a.cardio ? [a.cardio] : []} onToggle={(v) => set({ cardio: v })} />
          </Group>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-5">
          <Field label="Refeições por dia">
            <Select value={a.mealsPerDay ?? ''} onChange={(e) => set({ mealsPerDay: Number(e.target.value) || undefined })}>
              <option value="">Escolha</option>
              {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} refeições</option>)}
            </Select>
          </Field>
          <Group title="Restrições alimentares">
            <Chips options={restrictionLabels} selected={a.dietRestrictions} onToggle={(v) => set({ dietRestrictions: toggle(a.dietRestrictions, v) })} />
          </Group>
          <Field label="Alergias (opcional)">
            <Input value={a.allergies ?? ''} maxLength={300} onChange={(e) => set({ allergies: e.target.value })} placeholder="Ex.: amendoim, frutos do mar" />
          </Field>
          <Field label="Alimentos que você não come (opcional)">
            <Input value={a.dislikedFoods ?? ''} maxLength={300} onChange={(e) => set({ dislikedFoods: e.target.value })} placeholder="Ex.: fígado, beterraba" />
          </Field>
          <Group title="Orçamento">
            <Chips options={budgetLabels} selected={a.budget ? [a.budget] : []} onToggle={(v) => set({ budget: v })} />
          </Group>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-4">
          <p className="text-sm leading-relaxed text-zinc-400">
            Algumas situações exigem acompanhamento profissional. Marque o que se aplica a você. Se marcar qualquer item, o assistente de IA fica desativado.
          </p>
          {(Object.keys(screeningLabels) as (keyof typeof screeningLabels)[]).map((key) => (
            <label key={key} className="card flex items-start gap-3 p-4 text-sm">
              <input
                type="checkbox"
                checked={screening[key]}
                onChange={(e) => set({ screening: { ...screening, [key]: e.target.checked } })}
                className="mt-0.5 h-5 w-5 shrink-0 accent-lime-400"
              />
              {screeningLabels[key]}
            </label>
          ))}
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      <div className="flex gap-3">
        {step > 0 && <button onClick={() => setStep(step - 1)} className="h-12 rounded-[14px] border border-line px-5 font-semibold text-zinc-300">Voltar</button>}
        {step < STEPS.length - 1 ? (
          <Button className="flex-1" onClick={() => setStep(step + 1)} disabled={step === 0 && !trainingOk}>Continuar</Button>
        ) : (
          <Button className="flex-1" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar respostas'}</Button>
        )}
      </div>
      {step === 0 && !trainingOk && <p className="text-xs text-muted">Escolha experiência, dias, duração e ao menos um equipamento para continuar.</p>}
    </div>
  )
}

export function QuestionnairePage() {
  const profile = useApi<AiProfile>('/ai/profile')
  const [consented, setConsented] = useState(false)

  return (
    <Page>
      <header className="flex items-center justify-between">
        <Link to="/" className="text-zinc-400">Voltar</Link>
      </header>
      <PageTitle>Questionário</PageTitle>
      {profile.error && <Offline />}
      {!profile.data && !profile.error && <Loading />}
      {profile.data && !profile.data.consentAt && !consented && <AiConsent onAccepted={() => setConsented(true)} />}
      {profile.data && (profile.data.consentAt || consented) && <Form initial={profile.data.answers} />}
    </Page>
  )
}
