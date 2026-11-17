import { round, type Macros } from '../lib/diet'
import type { Goal } from '../lib/types'

function Bar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0
  const over = target > 0 && value > target * 1.05
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-1 text-[13px]">
        <span className={`font-semibold ${over ? 'text-red-300' : ''}`}>{label}</span>
        <span className={`num text-[17px] ${over ? 'text-red-400' : 'text-zinc-400'}`}>
          <b className={over ? '' : 'text-zinc-50'}>{round(value)}</b>/{target} g
        </span>
      </div>
      <div className={`h-2.5 overflow-hidden rounded-full ${over ? 'bg-red-400/20' : 'bg-surface-2'}`}>
        <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: over ? '#f87171' : color }} />
      </div>
    </div>
  )
}

export function MacroBars({ total, goal, title, action }: { total: Macros; goal: Goal | null; title?: string; action?: React.ReactNode }) {
  const kcalTarget = goal?.kcal ?? 0
  const remaining = kcalTarget - round(total.kcal)
  return (
    <section className="card grid gap-4 p-5 lg:p-6">
      {(title || action) && (
        <div className="flex items-center justify-between">
          <span className="label-caps">{title}</span>
          {action}
        </div>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="num text-5xl leading-none font-bold">
          {round(total.kcal).toLocaleString('pt-BR')}
          <span className="ml-1.5 text-xl font-semibold text-zinc-400">/ {kcalTarget.toLocaleString('pt-BR')} kcal</span>
        </span>
        {goal && (
          <span className={`text-[15px] font-bold ${remaining < 0 ? 'text-red-400' : 'text-lime-400'}`}>
            {remaining >= 0 ? `faltam ${remaining}` : `${-remaining} acima`}
          </span>
        )}
      </div>
      <div className="grid gap-3.5 lg:grid-cols-3 lg:gap-5">
        <Bar label="Proteína" value={total.protein} target={goal?.proteinG ?? 0} color="var(--color-protein)" />
        <Bar label="Carbo" value={total.carbs} target={goal?.carbsG ?? 0} color="var(--color-carbs)" />
        <Bar label="Gordura" value={total.fat} target={goal?.fatG ?? 0} color="var(--color-fat)" />
      </div>
    </section>
  )
}
