import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router'
import { startBackgroundSync } from '../lib/sync'

const tabs = [
  { to: '/', label: 'Início' },
  { to: '/treinos', label: 'Treinos' },
]

export function AppLayout() {
  useEffect(() => startBackgroundSync(), [])

  return (
    <div className="min-h-dvh pb-20">
      <Outlet />
      <nav className="fixed inset-x-0 bottom-0 border-t border-zinc-900 bg-zinc-950/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-md grid-cols-2">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) => `py-4 text-center text-sm ${isActive ? 'text-lime-400' : 'text-zinc-500'}`}
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
