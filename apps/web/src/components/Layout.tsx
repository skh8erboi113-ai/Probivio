import { NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { fonts, palette, spacing } from '../theme';

import { RealtimeIndicator } from './RealtimeIndicator';
import { Button } from './ui/Button';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/leads', label: 'Leads' },
  { to: '/buyers', label: 'Buyers' },
  { to: '/probate', label: 'Probate' },
  { to: '/automations', label: 'Gemini Agent' },
] as const;

export function Layout() {
  const { user, signOut } = useAuth();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '240px 1fr',
        minHeight: '100vh',
        background: palette.bg,
        color: palette.text,
        fontFamily: fonts.sans,
      }}
    >
      <aside
        aria-label="Main navigation"
        style={{
          background: palette.surface,
          borderRight: `1px solid ${palette.border}`,
          padding: spacing.lg,
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.xl,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            aria-hidden="true"
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: `linear-gradient(135deg, ${palette.accent}, ${palette.accentDim})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            🏛️
          </div>
          <div>
            <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 16 }}>
              Probivio
            </div>
            <div style={{ fontSize: 10, color: palette.textMuted, fontFamily: fonts.mono }}>
              v2.1
            </div>
          </div>
        </div>

        <RealtimeIndicator />

        <nav aria-label="Primary" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              style={({ isActive }) => ({
                padding: '10px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? palette.accent : palette.textMuted,
                background: isActive ? palette.accentGlow : 'transparent',
                textDecoration: 'none',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <div style={{ fontSize: 11, color: palette.textDim, fontFamily: fonts.mono }}>
            {user?.email}
          </div>
          <Button variant="secondary" size="sm" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </aside>

      <main id="main-content" style={{ padding: spacing.xl, overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
