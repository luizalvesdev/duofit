import { NavLink, Outlet } from 'react-router'
import { Page, PageTitle } from '../../components/AppLayout'

const tabs = [
  { to: '/progresso', label: 'Histórico', end: true },
  { to: '/progresso/recordes', label: 'Recordes' },
  { to: '/progresso/corpo', label: 'Corpo' },
]

export function ProgressPage() {
  return (
    <Page wide>
      <PageTitle
        aside={
          <nav aria-label="Seções de progresso" className="flex w-full gap-1 rounded-[14px] border border-line bg-surface p-1 sm:w-auto">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `grid h-11 flex-1 place-items-center rounded-[10px] px-5 text-sm ${isActive ? 'bg-line-strong font-bold text-zinc-50' : 'font-semibold text-zinc-400'}`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        }
      >
        Progresso
      </PageTitle>
      <Outlet />
    </Page>
  )
}
