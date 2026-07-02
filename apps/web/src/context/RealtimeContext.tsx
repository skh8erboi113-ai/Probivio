import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from './AuthContext';
import { getRealtimeClient, type ConnectionStatus, type RealtimeEvent } from '../lib/websocket-client';

interface RealtimeContextValue {
  readonly status: ConnectionStatus;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/**
 * Provides the realtime connection lifecycle + auto-invalidates TanStack Query caches
 * when server-side events arrive. This gives instant UI updates without polling.
 */
export function RealtimeProvider({ children }: { readonly children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  useEffect(() => {
    const client = getRealtimeClient();

    if (!user) {
      client.disconnect();
      return;
    }

    const unsubStatus = client.onStatusChange(setStatus);

    const unsubEvents = client.subscribe((event: RealtimeEvent) => {
      switch (event.type) {
        case 'lead.created':
        case 'lead.updated':
        case 'lead.deleted':
        case 'lead.scored':
          queryClient.invalidateQueries({ queryKey: ['leads'] });
          break;
        case 'buyer.created':
        case 'buyer.updated':
          queryClient.invalidateQueries({ queryKey: ['buyers'] });
          break;
        case 'interaction.recorded': {
          const payload = event.payload as { readonly leadId?: string } | null;
          queryClient.invalidateQueries({ queryKey: ['interactions'] });
          if (payload?.leadId) {
            queryClient.invalidateQueries({ queryKey: ['leads', 'detail', payload.leadId] });
          }
          break;
        }
        case 'automation.triggered':
          queryClient.invalidateQueries({ queryKey: ['automations'] });
          break;
        default:
          break;
      }
    });

    void client.connect();

    return () => {
      unsubStatus();
      unsubEvents();
      client.disconnect();
    };
  }, [user, queryClient]);

  const value = useMemo(() => ({ status }), [status]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used inside RealtimeProvider');
  return ctx;
}
