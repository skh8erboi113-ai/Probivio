import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';

export function RequireAuth({ children }: { readonly children: ReactNode }): JSX.Element {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0b0f',
          color: '#e8e4d9',
        }}
      >
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
