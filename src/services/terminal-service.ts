/**
 * Terminal Service - Manages PTY processes and their lifecycle
 */
import * as pty from 'node-pty';
import { EventEmitter } from 'events';

export interface TerminalConfig {
  shell?: string;
  shellArgs?: string[];
  cols: number;
  rows: number;
  cwd?: string;
  env?: Record<string, string>;
  welcomeMessage?: string;
}

export interface TerminalMessage {
  type: 'data' | 'resize' | 'init' | 'ping';
  data?: string;
  cols?: number;
  rows?: number;
  term?: string;
}

export class TerminalSession extends EventEmitter {
  private ptyProcess: pty.IPty | null = null;
  private closed = false;
  public readonly sessionId: string;

  constructor(
    sessionId: string,
    private config: TerminalConfig
  ) {
    super();
    this.sessionId = sessionId;
  }

  async start(): Promise<void> {
    if (this.ptyProcess) {
      throw new Error('Terminal session already started');
    }

    const defaultConfig = this.getDefaultConfig();
    const mergedConfig = { ...defaultConfig, ...this.config };

    try {
      this.ptyProcess = pty.spawn(
        mergedConfig.shell || 'sh',
        mergedConfig.shellArgs || ['-c', this.buildStartupCommand()],
        {
          name: 'xterm-256color',
          cols: mergedConfig.cols,
          rows: mergedConfig.rows,
          cwd: mergedConfig.cwd || process.env.HOME || '/tmp',
          env: mergedConfig.env || this.getDefaultEnv()
        }
      );

      this.setupPtyHandlers();
      this.emit('started', { pid: this.ptyProcess.pid });

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private setupPtyHandlers(): void {
    if (!this.ptyProcess) return;

    this.ptyProcess.onData((data: string) => {
      if (!this.closed) {
        this.emit('data', data);
      }
    });

    this.ptyProcess.onExit(({ exitCode, signal }) => {
      this.emit('exit', { exitCode, signal });
      this.cleanup();
    });
  }

  write(data: string): void {
    if (this.ptyProcess && !this.closed) {
      this.ptyProcess.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    if (this.ptyProcess && !this.closed) {
      this.ptyProcess.resize(cols, rows);
      this.config.cols = cols;
      this.config.rows = rows;
    }
  }

  kill(signal?: string): void {
    if (this.ptyProcess && !this.closed) {
      this.ptyProcess.kill(signal);
    }
  }

  close(): void {
    this.cleanup();
    this.emit('closed');
  }

  private cleanup(): void {
    if (this.closed) return;
    
    this.closed = true;
    if (this.ptyProcess) {
      try {
        this.ptyProcess.kill();
      } catch (error) {
        console.warn('Error killing PTY process:', error);
      }
      this.ptyProcess = null;
    }
  }

  private buildStartupCommand(): string {
    const envSetup = 'export TERM=xterm-256color COLORTERM=truecolor';
    const welcome = this.config.welcomeMessage || this.getDefaultWelcomeMessage();
    return `${envSetup} && echo "${welcome}" && sh`;
  }

  private getDefaultWelcomeMessage(): string {
    return 'Kubernetes Terminal ready!\\nAvailable: k9s, kubectl, nano, htop, tmux\\nRunning in-cluster with proper RBAC';
  }

  private getDefaultConfig(): Partial<TerminalConfig> {
    return {
      shell: 'sh',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME || '/tmp'
    };
  }

  private getDefaultEnv(): Record<string, string> {
    return {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      COLUMNS: this.config.cols.toString(),
      LINES: this.config.rows.toString(),
      FORCE_COLOR: '1'
    };
  }

  get isActive(): boolean {
    return !this.closed && this.ptyProcess !== null;
  }

  get pid(): number | undefined {
    return this.ptyProcess?.pid;
  }
}

/**
 * Terminal Service Manager - Manages multiple terminal sessions
 */
export class TerminalService {
  private sessions = new Map<string, TerminalSession>();
  private sessionCounter = 0;

  createSession(config: TerminalConfig): TerminalSession {
    const sessionId = `terminal-${++this.sessionCounter}-${Date.now()}`;
    const session = new TerminalSession(sessionId, config);
    
    // Auto-cleanup when session closes
    session.on('closed', () => {
      this.sessions.delete(sessionId);
    });

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): TerminalSession[] {
    return Array.from(this.sessions.values());
  }

  closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.close();
      return true;
    }
    return false;
  }

  closeAllSessions(): void {
    for (const session of this.sessions.values()) {
      session.close();
    }
    this.sessions.clear();
  }

  getActiveSessionCount(): number {
    return Array.from(this.sessions.values()).filter(s => s.isActive).length;
  }
}