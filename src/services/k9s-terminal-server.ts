/**
 * K9s Terminal Service - Refactored WebSocket terminal server
 */
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { TerminalService } from '../services/terminal-service';
import { WebSocketTerminalHandler } from '../services/websocket-terminal-handler';
import { createLogger } from '../utils/logger';
import { getTerminalConfig } from '../config/app-config';

const logger = createLogger('k9s-service');

export class K9sTerminalServer {
  private wss: WebSocketServer | null = null;
  private terminalService: TerminalService;
  private activeConnections = new Set<WebSocketTerminalHandler>();

  constructor() {
    this.terminalService = new TerminalService();
    this.setupGracefulShutdown();
  }

  /**
   * Initialize the WebSocket server
   */
  start(server: Server): void {
    const config = getTerminalConfig();
    
    this.wss = new WebSocketServer({ 
      server, 
      path: '/k9s'
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      this.handleConnection(ws, req);
    });

    logger.info('K9s WebSocket server started', { 
      path: '/k9s',
      config: {
        defaultSize: `${config.defaultCols}x${config.defaultRows}`,
        heartbeatInterval: config.heartbeatInterval,
        maxIdleTime: config.maxIdleTime
      }
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: any): void {
    const clientIp = req.socket.remoteAddress;
    const connectionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('New terminal connection', { 
      connectionId, 
      clientIp,
      activeConnections: this.activeConnections.size
    });

    const config = getTerminalConfig();
    const handler = new WebSocketTerminalHandler(
      ws,
      this.terminalService,
      {
        defaultCols: config.defaultCols,
        defaultRows: config.defaultRows,
        heartbeatInterval: config.heartbeatInterval,
        maxIdleTime: config.maxIdleTime
      },
      logger.child({ connectionId })
    );

    this.activeConnections.add(handler);

    // Clean up when connection closes
    ws.on('close', () => {
      this.activeConnections.delete(handler);
      logger.info('Terminal connection closed', { 
        connectionId,
        remainingConnections: this.activeConnections.size
      });
    });

    // Send initial connection message
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'connection',
        message: 'Connected to K9s Terminal Server',
        connectionId
      }));
    }
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      activeConnections: this.activeConnections.size,
      activeSessions: this.terminalService.getActiveSessionCount(),
      allSessions: this.terminalService.getAllSessions().map(s => ({
        sessionId: s.sessionId,
        isActive: s.isActive,
        pid: s.pid
      }))
    };
  }

  /**
   * Gracefully shutdown the server
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down K9s terminal server...');

    if (this.wss) {
      // Close all WebSocket connections
      for (const client of this.wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'server_shutdown',
            message: 'Server is shutting down'
          }));
          client.close(1001, 'Server shutdown');
        }
      }

      // Close the WebSocket server
      await new Promise<void>((resolve) => {
        this.wss!.close(() => {
          logger.info('WebSocket server closed');
          resolve();
        });
      });
    }

    // Close all terminal sessions
    this.terminalService.closeAllSessions();
    this.activeConnections.clear();

    logger.info('K9s terminal server shutdown complete');
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const handleShutdown = (signal: string) => {
      logger.info(`Received ${signal}, initiating graceful shutdown`);
      this.shutdown().then(() => {
        process.exit(0);
      }).catch((error) => {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      });
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error });
      this.shutdown().finally(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', { reason });
      this.shutdown().finally(() => process.exit(1));
    });
  }
}

// Export singleton instance and factory function
let serverInstance: K9sTerminalServer | null = null;

/**
 * Get or create the K9s terminal server instance
 */
export function getK9sTerminalServer(): K9sTerminalServer {
  if (!serverInstance) {
    serverInstance = new K9sTerminalServer();
  }
  return serverInstance;
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use getK9sTerminalServer().start(server) instead
 */
export function createWsServer(server: Server): void {
  const k9sServer = getK9sTerminalServer();
  k9sServer.start(server);
}