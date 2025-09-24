/**
 * WebSocket Terminal Handler - Manages WebSocket connections for terminal sessions
 */
import { WebSocket } from 'ws';
import { TerminalService, TerminalSession, TerminalMessage } from './terminal-service';
import { Logger } from '../utils/logger';

export interface WebSocketTerminalConfig {
  defaultCols: number;
  defaultRows: number;
  heartbeatInterval: number;
  maxIdleTime: number;
}

export class WebSocketTerminalHandler {
  private session: TerminalSession | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();
  private logger: Logger;

  constructor(
    private ws: WebSocket,
    private terminalService: TerminalService,
    private config: WebSocketTerminalConfig,
    logger: Logger
  ) {
    this.logger = logger.child({ component: 'WebSocketTerminalHandler' });
    this.setupWebSocketHandlers();
    this.startHeartbeat();
  }

  private setupWebSocketHandlers(): void {
    this.ws.on('message', this.handleMessage.bind(this));
    this.ws.on('close', this.handleClose.bind(this));
    this.ws.on('error', this.handleError.bind(this));
    this.ws.on('pong', this.handlePong.bind(this));
  }

  private handleMessage(data: Buffer): void {
    this.updateActivity();

    try {
      // Try to parse as JSON message first
      const message = this.parseMessage(data);
      
      if (message) {
        this.handleStructuredMessage(message);
      } else {
        // Treat as raw terminal input
        this.handleTerminalInput(data.toString());
      }
    } catch (error) {
      this.logger.error('Error handling WebSocket message', { error });
    }
  }

  private parseMessage(data: Buffer): TerminalMessage | null {
    try {
      return JSON.parse(data.toString()) as TerminalMessage;
    } catch {
      return null; // Not a JSON message
    }
  }

  private handleStructuredMessage(message: TerminalMessage): void {
    this.logger.debug('Received structured message', { type: message.type });

    switch (message.type) {
      case 'init':
        this.initializeTerminal(message);
        break;
      case 'resize':
        this.handleResize(message);
        break;
      case 'ping':
        this.handlePing();
        break;
      case 'data':
        if (message.data) {
          this.handleTerminalInput(message.data);
        }
        break;
      default:
        this.logger.warn('Unknown message type', { type: message.type });
    }
  }

  private async initializeTerminal(message: TerminalMessage): Promise<void> {
    if (this.session?.isActive) {
      this.logger.warn('Terminal already initialized');
      return;
    }

    try {
      const cols = message.cols || this.config.defaultCols;
      const rows = message.rows || this.config.defaultRows;

      this.session = this.terminalService.createSession({
        cols,
        rows,
        welcomeMessage: 'Kubernetes Terminal Ready!\\nTry: k9s, kubectl, htop, nano'
      });

      this.setupTerminalHandlers();
      await this.session.start();

      this.sendMessage({
        type: 'data',
        data: `\r\n\x1b[32mTerminal initialized (${cols}x${rows})\x1b[0m\r\n`
      });

      this.logger.info('Terminal session initialized', { 
        sessionId: this.session.sessionId, 
        pid: this.session.pid,
        size: `${cols}x${rows}`
      });

    } catch (error) {
      this.logger.error('Failed to initialize terminal', { error });
      this.sendError('Failed to initialize terminal');
    }
  }

  private setupTerminalHandlers(): void {
    if (!this.session) return;

    this.session.on('data', (data: string) => {
      this.sendMessage({ type: 'data', data });
    });

    this.session.on('exit', ({ exitCode, signal }) => {
      this.logger.info('Terminal session exited', { exitCode, signal });
      this.sendMessage({
        type: 'data',
        data: `\r\n\x1b[31mSession ended (exit code: ${exitCode})\x1b[0m\r\n`
      });
      this.cleanup();
    });

    this.session.on('error', (error) => {
      this.logger.error('Terminal session error', { error });
      this.sendError(`Terminal error: ${error.message}`);
    });
  }

  private handleResize(message: TerminalMessage): void {
    if (!message.cols || !message.rows) {
      this.logger.warn('Invalid resize message', { message });
      return;
    }

    if (this.session?.isActive) {
      this.session.resize(message.cols, message.rows);
      this.logger.debug('Terminal resized', { 
        cols: message.cols, 
        rows: message.rows 
      });
    }
  }

  private handleTerminalInput(data: string): void {
    if (this.session?.isActive) {
      this.session.write(data);
    } else {
      this.logger.warn('Received input for inactive terminal session');
    }
  }

  private handlePing(): void {
    this.sendMessage({ type: 'ping' });
  }

  private handlePong(): void {
    this.updateActivity();
  }

  private handleClose(): void {
    this.logger.info('WebSocket connection closed');
    this.cleanup();
  }

  private handleError(error: Error): void {
    this.logger.error('WebSocket error', { error });
    this.cleanup();
  }

  private sendMessage(message: TerminalMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      try {
        if (message.type === 'data' && message.data) {
          // Send raw data for terminal output
          this.ws.send(message.data);
        } else {
          // Send structured messages as JSON
          this.ws.send(JSON.stringify(message));
        }
      } catch (error) {
        this.logger.error('Error sending WebSocket message', { error });
      }
    }
  }

  private sendError(message: string): void {
    this.sendMessage({
      type: 'data',
      data: `\r\n\x1b[31mError: ${message}\x1b[0m\r\n`
    });
  }

  private updateActivity(): void {
    this.lastActivity = Date.now();
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const idleTime = Date.now() - this.lastActivity;
      
      if (idleTime > this.config.maxIdleTime) {
        this.logger.info('Closing idle connection', { idleTime });
        this.cleanup();
        return;
      }

      // Send ping to keep connection alive
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, this.config.heartbeatInterval);
  }

  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.session?.isActive) {
      this.session.close();
    }

    if (this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.close();
      } catch (error) {
        this.logger.error('Error closing WebSocket', { error });
      }
    }
  }
}