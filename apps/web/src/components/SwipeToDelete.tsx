import { useRef, useState, type ReactNode } from 'react'

const REVEAL = 88

export function SwipeToDelete({ children, onDelete }: { children: ReactNode; onDelete: () => void }) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number; base: number; locked: boolean | null } | null>(null)

  return (
    <div className="relative overflow-hidden rounded-lg">
      <button
        onClick={() => {
          setOffset(0)
          onDelete()
        }}
        className="absolute inset-y-0 right-0 bg-red-500 font-semibold text-white"
        style={{ width: REVEAL }}
        tabIndex={offset ? 0 : -1}
      >
        Excluir
      </button>
      <div
        className="relative bg-zinc-900"
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? 'none' : 'transform 150ms', touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && (e.target as HTMLElement).closest('input, button')) return
          if (e.pointerType === 'mouse') e.currentTarget.setPointerCapture(e.pointerId)
          start.current = { x: e.clientX, y: e.clientY, base: offset, locked: null }
        }}
        onPointerMove={(e) => {
          const s = start.current
          if (!s) return
          const dx = e.clientX - s.x
          const dy = e.clientY - s.y
          if (s.locked === null && Math.hypot(dx, dy) > 8) s.locked = Math.abs(dx) > Math.abs(dy)
          if (!s.locked) return
          setDragging(true)
          setOffset(Math.min(0, Math.max(-REVEAL - 24, s.base + dx)))
        }}
        onPointerUp={() => {
          if (start.current?.locked) setOffset((current) => (current < -REVEAL / 2 ? -REVEAL : 0))
          start.current = null
          setDragging(false)
        }}
        onPointerCancel={() => {
          start.current = null
          setDragging(false)
          setOffset(0)
        }}
      >
        {children}
      </div>
    </div>
  )
}
