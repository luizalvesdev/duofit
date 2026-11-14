import { NavLink, Outlet } from 'react-router'

const tabs = [
  { to: '/progresso', label: 'Histórico', end: true },
  { to: '/progresso/recordes', label: 'Recordes' },
  { to: '/progresso/corpo', label: 'Corpo' },
]

export function ProgressPage() {
  return (
    <main className="mx-auto grid max-w-md gap-4 px-5 py-8">
      <h1 className="text-2xl font-bold">Progresso</h1>
      <nav className="grid grid-cols-3 rounded-xl bg-zinc-900 p-1 text-sm">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `rounded-lg py-2 text-center ${isActive ? 'bg-zinc-800 text-lime-400' : 'text-zinc-500'}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </main>
  )
}
