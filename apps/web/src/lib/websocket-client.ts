import { getEnv } from './env';
import { getFirebaseAuth } from './firebase';

/**
 * Auto-reconnecting WebSocket client for real-time events.
 *
 * - Automatically refreshes Firebase token before reconnecting
 * - Exponential backoff up to 30s
 * - Ping every 25s (server pings at 30s so we stay ahead of the deadline)
 * - Exposes subscribe(handler) → unsubscribe function
 */

export interface RealtimeEvent<T = unknown> {
  readonly type: string;
  readonly operatorId: string;
  readonly payload: T;
  readonly timestamp: string;
}

type EventHandler = (event: RealtimeEvent) => void;
type StatusHandler = (status: ConnectionStatus) => void;

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;
const PING_INTERVAL_MS = 25_000;

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private retryDelay = INITIAL_RETRY_MS;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private isShuttingDown = false;

  private readonly eventHandlers = new Set<EventHandler>();
  private readonly statusHandlers = new Set<StatusHandler>();
  private currentStatus: ConnectionStatus = 'disconnected';

  public async connect(): Promise<void> {
    this.isShuttingDown = false;
    await this.openConnection();
  }

  public disconnect(): void {
    this.isShuttingDown = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  public subscribe(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  public onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.currentStatus);
    return () => this.statusHandlers.delete(handler);
  }

  private async openConnection(): Promise<void> {
    const env = getEnv();
    const auth = getFirebaseAuth();

    if (!auth.currentUser) {
      this.setStatus('disconnected');
      return;
    }

    let token: string;
    try {
      token = await auth.currentUser.getIdToken();
    } catch {
      this.scheduleReconnect();
      return;
    }

    // Convert http(s) to ws(s) and append /ws
    const wsUrl = env.VITE_API_URL.replace(/^http/, 'ws') + `/ws?token=${encodeURIComponent(token)}`;

    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.addEventListener('open', () => {
      this.retryDelay = INITIAL_RETRY_MS;
      this.setStatus('connected');
      this.startPingLoop();
    });

    this.ws.addEventListener('message', (msg) => {
      try {
        if (msg.data === 'pong') return;
        const event = JSON.parse(msg.data) as RealtimeEvent;
        if (event.type === 'connected') return; // welcome handshake
        this.eventHandlers.forEach((h) => {
          try {
            h(event);
          } catch {
            /* subscriber errors shouldn't kill the socket */
          }
        });
      } catch {
        /* ignore malformed messages */
      }
    });

    this.ws.addEventListener('close', (evt) => {
      this.clearTimers();
      this.setStatus('disconnected');

      // Auth failures — don't retry blindly, just wait for external reconnect trigger
      if (evt.code === 4001 || evt.code === 4003) {
        return;
      }
      if (!this.isShuttingDown) this.scheduleReconnect();
    });

    this.ws.addEventListener('error', () => {
      this.setStatus('error');
    });
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown) return;
    if (this.reconnectTimer !== null) return;

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.openConnection();
    }, this.retryDelay);

    this.retryDelay = Math.min(MAX_RETRY_MS, this.retryDelay * 2);
  }

  private startPingLoop(): void {
    this.pingTimer = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send('ping');
        } catch {
          /* ignore */
        }
      }
    }, PING_INTERVAL_MS);
  }

  private clearTimers(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.currentStatus === status) return;
    this.currentStatus = status;
    this.statusHandlers.forEach((h) => h(status));
  }
}

let cached: RealtimeClient | null = null;

export function getRealtimeClient(): RealtimeClient {
  if (!cached) cached = new RealtimeClient();
  return cached;
                             }
