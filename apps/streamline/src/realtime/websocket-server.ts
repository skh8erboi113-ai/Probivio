
import { getFirebaseAuth } from '@probivio/db';
import { WebSocketServer, WebSocket } from 'ws';

import { getPubSub, type RealtimeEvent } from './pubsub.js';

import type { Logger } from '@probivio/logger';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';

/**
 * WebSocket server for real-time client updates.
 *
 * Auth flow:
 *   1. Client connects with ?token=<firebase-id-token> in query string
 *   2. Server verifies token
 *   3. Server subscribes connection to operator's channel
 *   4. Any event published for that operator is forwarded
 *
 * Ping/pong keepalive every 30s. Idle connections closed after 60s.
 */

const PING_INTERVAL_MS = 30_000;
const IDLE_TIMEOUT_MS = 60_000;
const MAX_CONNECTIONS_PER_OPERATOR = 5;
const PATH = '/ws';

interface AuthedSocket extends WebSocket {
  operatorId: string;
  isAlive: boolean;
  connectedAt: number;
  unsubscribe: () => void;
}

export class RealtimeWebSocketServer {
  private wss: WebSocketServer | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private readonly connectionsByOperator = new Map<string, Set<AuthedSocket>>();
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'websocket-server' });
  }

  public attach(httpServer: HttpServer): void {
    if (this.wss) return;

    this.wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

    httpServer.on('upgrade', (req, socket, head) => {
      this.handleUpgrade(req, socket, head);
    });

    this.wss.on('connection', (ws, req) => {
      void this.handleConnection(ws as AuthedSocket, req);
    });

    this.pingInterval = setInterval(() => {
      this.wss?.clients.forEach((client) => {
        const s = client as AuthedSocket;
        if (!s.isAlive) {
          s.terminate();
          return;
        }
        s.isAlive = false;
        s.ping();
      });
    }, PING_INTERVAL_MS);

    this.logger.info('WebSocket server attached', { path: PATH });
  }

  public async shutdown(): Promise<void> {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (!this.wss) return;

    const closePromises: Promise<void>[] = [];
    this.wss.clients.forEach((client) => {
      closePromises.push(
        new Promise((resolve) => {
          client.once('close', () => resolve());
          client.close(1001, 'Server shutting down');
        }),
      );
    });

    await Promise.race([
      Promise.all(closePromises),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);

    this.wss.close();
    this.wss = null;
    this.connectionsByOperator.clear();
    this.logger.info('WebSocket server shut down');
  }

  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (!this.wss) {
      socket.destroy();
      return;
    }
    if (!req.url?.startsWith(PATH)) {
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss?.emit('connection', ws, req);
    });
  }

  private async handleConnection(ws: AuthedSocket, req: IncomingMessage): Promise<void> {
    ws.isAlive = true;
    ws.connectedAt = Date.now();

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Extract token from query string
    const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Missing token');
      return;
    }

    let uid: string;
    try {
      const decoded = await getFirebaseAuth().verifyIdToken(token, true);
      uid = decoded.uid;
    } catch (err) {
      this.logger.warn('WebSocket auth failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      ws.close(4003, 'Invalid token');
      return;
    }

    ws.operatorId = uid;

    // Enforce per-operator connection limit
    const existing = this.connectionsByOperator.get(uid) ?? new Set<AuthedSocket>();
    if (existing.size >= MAX_CONNECTIONS_PER_OPERATOR) {
      ws.close(4008, 'Too many connections');
      return;
    }
    existing.add(ws);
    this.connectionsByOperator.set(uid, existing);

    // Subscribe to pub/sub for this operator
    const pubsub = getPubSub(this.logger);
    ws.unsubscribe = pubsub.subscribe(uid, (event: RealtimeEvent) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(event));
        } catch (err) {
          this.logger.debug('Failed to send event to socket', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });

    // Send welcome message
    ws.send(
      JSON.stringify({
        type: 'connected',
        operatorId: uid,
        timestamp: new Date().toISOString(),
      }),
    );

    // Handle incoming messages (mostly ping/pong style)
    ws.on('message', (data) => {
      try {
        const text = Buffer.isBuffer(data)
          ? data.toString('utf8')
          : Array.isArray(data)
            ? Buffer.concat(data).toString('utf8')
            : Buffer.from(data).toString('utf8');
        if (text.length > 1024) {
          ws.close(1009, 'Message too large');
          return;
        }
        // Currently we only accept "ping" from clients
        if (text === 'ping') ws.send('pong');
      } catch {
        /* ignore */
      }
    });

    ws.on('close', () => this.handleClose(ws));
    ws.on('error', (err) => {
      this.logger.warn('WebSocket error', {
        operatorId: uid,
        error: err.message,
      });
    });

    // Idle timeout
    const idleTimer = setTimeout(() => {
      if (Date.now() - ws.connectedAt > IDLE_TIMEOUT_MS && !ws.isAlive) {
        ws.terminate();
      }
    }, IDLE_TIMEOUT_MS);
    ws.on('close', () => clearTimeout(idleTimer));

    this.logger.info('WebSocket connected', {
      operatorId: uid,
      activeForOperator: existing.size,
      totalActive: this.wss?.clients.size ?? 0,
    });
  }

  private handleClose(ws: AuthedSocket): void {
    try {
      ws.unsubscribe?.();
    } catch {
      /* ignore */
    }

    const set = this.connectionsByOperator.get(ws.operatorId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) this.connectionsByOperator.delete(ws.operatorId);
    }

    this.logger.debug('WebSocket disconnected', {
      operatorId: ws.operatorId,
      remainingForOperator: set?.size ?? 0,
    });
  }
}

export function createRealtimeWebSocketServer(logger: Logger): RealtimeWebSocketServer {
  return new RealtimeWebSocketServer(logger);
  }
