import { NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/leads', label: 'Leads' },
  { to: '/buyers', label: 'Buyers' },
  { to: '/probate', label: 'Probate' },
  { to: '/automations', label: 'Automations' },
] as const;

export function Layout(): JSX.Element {
  const { user, signOut } = useAuth();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0b0f', color: '#e8e4d9' }}>
      <aside
        style={{
          width: 240,
          background: '#111318',
          borderRight: '1px solid #1e2535',
          padding: 24,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 32 }}>ListingLogic</div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              style={({ isActive }) => ({
                padding: '10px 12px',
                borderRadius: 6,
                color: isActive ? '#c9a84c' : '#7a8094',
                background: isActive ? 'rgba(201,168,76,0.1)' : 'transparent',
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: isActive ? 600 : 500,
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ position: 'absolute', bottom: 24, left: 24, right: 24 }}>
          {user && (
            <>
              <div style={{ fontSize: 12, color: '#7a8094', marginBottom: 8 }}>
                {user.email}
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: '1px solid #1e2535',
                  color: '#e8e4d9',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </aside>

      <main style={{ flex: 1, padding: 32, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
