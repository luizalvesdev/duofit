import { round, type Macros } from '../lib/diet'
import type { Goal } from '../lib/types'

function Bar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0
  const over = target > 0 && value > target * 1.05
  return (
    <div className="grid gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className={over ? 'text-red-400' : 'text-zinc-300'}>{round(value)}/{target}g</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? '#f87171' : color }} />
      </div>
    </div>
  )
}

export function MacroBars({ total, goal }: { total: Macros; goal: Goal | null }) {
  const kcalTarget = goal?.kcal ?? 0
  const remaining = kcalTarget - round(total.kcal)
  return (
    <section className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-3xl font-black">{round(total.kcal)} <span className="text-base font-normal text-zinc-500">/ {kcalTarget} kcal</span></p>
        {goal && (
          <p className={`text-sm ${remaining < 0 ? 'text-red-400' : 'text-lime-400'}`}>
            {remaining >= 0 ? `faltam ${remaining}` : `${-remaining} acima`}
          </p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Bar label="Proteína" value={total.protein} target={goal?.proteinG ?? 0} color="#a3e635" />
        <Bar label="Carbo" value={total.carbs} target={goal?.carbsG ?? 0} color="#38bdf8" />
        <Bar label="Gordura" value={total.fat} target={goal?.fatG ?? 0} color="#fbbf24" />
      </div>
    </section>
  )
}
