import type { ReactNode } from 'react'

// Animated expand/collapse. Children stay mounted so both opening and closing animate;
// `inert` keeps hidden controls out of focus and the accessibility tree.
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`} inert={!open}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}
