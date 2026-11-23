import { Outlet, useLocation } from 'react-router'

// Progress tabs share one page shell: switching tabs shouldn't remount it.
const keyFor = (pathname: string) => (/^\/progresso\/(recordes|corpo)$/.test(pathname) ? '/progresso' : pathname)

// Opacity only: a transform would re-anchor `position: fixed` children (rest bar, bottom nav) while it runs.
export function RouteTransition() {
  const { pathname } = useLocation()
  return (
    <div key={keyFor(pathname)} className="anim-page">
      <Outlet />
    </div>
  )
}
