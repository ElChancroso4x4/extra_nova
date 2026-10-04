import { NavLink, Outlet } from 'react-router-dom'

export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="topnav">
        <div className="brand">
          <div className="brand-mark">
            Cau<span>dal</span>
          </div>
          <div className="brand-tag">finanzas personales</div>
        </div>
        <nav className="nav-links">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Inicio
          </NavLink>
          <NavLink
            to="/presupuesto"
            className={({ isActive }) => (isActive ? 'active' : undefined)}
          >
            Presupuesto
          </NavLink>
          <NavLink to="/balance" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Balance
          </NavLink>
          <NavLink
            to="/conectores"
            className={({ isActive }) => (isActive ? 'active' : undefined)}
          >
            Conectores
          </NavLink>
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
