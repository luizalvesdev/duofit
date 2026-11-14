import { useEffect } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { startBackgroundSync } from '../lib/sync'
import { Icon, type IconName } from './Icon'

const tabs: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Início', icon: 'home' },
  { to: '/treinos', label: 'Treinos', icon: 'dumbbell' },
  { to: '/dieta', label: 'Dieta', icon: 'fork' },
  { to: '/progresso', label: 'Progresso', icon: 'chart' },
  { to: '/dupla', label: 'Dupla', icon: 'duo' },
]

export function Logo({ className = 'text-[34px]' }: { className?: string }) {
  return <span className={`num font-bold ${className}`}>Duo<span className="text-lime-400">Fit</span></span>
}

export function AppLayout() {
  const { user } = useAuth()
  useEffect(() => startBackgroundSync(), [])

  return (
    <div className="min-h-dvh lg:flex">
      <nav aria-label="Navegação principal" className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r border-[#1f1f23] bg-[#0c0c0f] px-4 py-7 lg:flex">
        <Logo className="px-3 pb-5 text-[34px]" />
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `flex min-h-12 items-center gap-3 rounded-xl px-3 ${isActive ? 'bg-lime-400/12 font-bold text-lime-400' : 'font-semibold text-zinc-400 hover:text-zinc-200'}`
            }
          >
            <Icon name={tab.icon} />
            {tab.label}
          </NavLink>
        ))}
        <div className="flex-1" />
        <Link to="/perfil" className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-lime-400 font-extrabold text-ink">{user?.name.charAt(0).toUpperCase()}</span>
          <span className="flex flex-col">
            <b className="text-sm">{user?.name}</b>
            <span className="text-xs text-muted">Perfil e metas</span>
          </span>
        </Link>
      </nav>

      <div className="min-w-0 flex-1 pb-24 lg:pb-0">
        <Outlet />
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#1f1f23] bg-[#0c0c0f]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${isActive ? 'text-lime-400' : 'text-zinc-500'}`}
            >
              <Icon name={tab.icon} size={22} />
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

export function Page({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto grid gap-5 px-4 py-6 sm:px-6 lg:px-12 lg:py-10 ${wide ? 'max-w-[1120px]' : 'max-w-md lg:max-w-3xl'}`}>
      {children}
    </main>
  )
}

export function PageTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="num text-4xl leading-none font-bold uppercase lg:text-5xl">{children}</h1>
      {aside}
    </header>
  )
}
