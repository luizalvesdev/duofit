import { useState } from 'react'

export type Series = {
  label: string
  color: string
  points: { x: number; y: number }[]
  dashed?: boolean
  dots?: boolean
}

const W = 340
const H = 180
const PAD = { top: 12, right: 12, bottom: 22, left: 36 }

const shortDate = (ms: number) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

export function LineChart({ series, target, unit = '' }: { series: Series[]; target?: number | null; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const all = series.flatMap((s) => s.points)
  if (all.length === 0) return <p className="py-10 text-center text-sm text-zinc-500">Sem dados ainda.</p>

  const xs = all.map((p) => p.x)
  const ys = [...all.map((p) => p.y), ...(target ? [target] : [])]
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)]
  let [minY, maxY] = [Math.min(...ys), Math.max(...ys)]
  const padY = (maxY - minY || maxY || 1) * 0.1
  minY -= padY
  maxY += padY

  const sx = (x: number) => PAD.left + (maxX === minX ? (W - PAD.left - PAD.right) / 2 : ((x - minX) / (maxX - minX)) * (W - PAD.left - PAD.right))
  const sy = (y: number) => PAD.top + (1 - (y - minY) / (maxY - minY)) * (H - PAD.top - PAD.bottom)
  const ticks = [0, 0.5, 1].map((t) => minY + t * (maxY - minY))
  const main = series[0].points
  const hovered = hover !== null ? main[hover] : null

  return (
    <div className="grid gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * W
          let nearest = 0
          main.forEach((p, i) => {
            if (Math.abs(sx(p.x) - x) < Math.abs(sx(main[nearest].x) - x)) nearest = i
          })
          setHover(nearest)
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)} stroke="#27272a" />
            <text x={PAD.left - 6} y={sy(t) + 4} textAnchor="end" fontSize="10" fill="#71717a">
              {Math.round(t)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 6} fontSize="10" fill="#71717a">{shortDate(minX)}</text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize="10" fill="#71717a">{shortDate(maxX)}</text>

        {target && (
          <line x1={PAD.left} x2={W - PAD.right} y1={sy(target)} y2={sy(target)} stroke="#a3e635" strokeDasharray="4 4" opacity="0.6" />
        )}

        {series.map((s) => (
          <g key={s.label}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeDasharray={s.dashed ? '5 4' : undefined}
              strokeLinejoin="round"
              points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')}
            />
            {s.dots && s.points.map((p) => <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r="2.5" fill={s.color} />)}
          </g>
        ))}

        {hovered && (
          <g>
            <line x1={sx(hovered.x)} x2={sx(hovered.x)} y1={PAD.top} y2={H - PAD.bottom} stroke="#52525b" />
            <circle cx={sx(hovered.x)} cy={sy(hovered.y)} r="4" fill={series[0].color} />
          </g>
        )}
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
        <div className="flex flex-wrap gap-3">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
          {target && <span className="text-lime-400/80">- - meta {target}{unit}</span>}
        </div>
        {hovered && (
          <span className="text-zinc-300">
            {shortDate(hovered.x)}: {hovered.y.toLocaleString('pt-BR')}{unit}
          </span>
        )}
      </div>
    </div>
  )
}
