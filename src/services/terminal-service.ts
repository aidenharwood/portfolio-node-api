/**
 * Terminal Service - Manages PTY processes and their lifecycle
 */
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { PassThrough } from 'stream';
import { k9sPodManifest } from '../k9s/k9s';
import { createPod, deletePod, createExec } from '../utils/k8s';
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
  private childProcess: ChildProcessWithoutNullStreams | null = null;
  private podName: string | null = null;
  private podNamespace: string = 'k9s';
  private execStream: PassThrough | null = null;
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
    if (this.childProcess || this.execStream) {
      throw new Error('Terminal session already started');
    }

    // Step 1: Create the pod using the k9sPodManifest
    const pod = await createPod(k9sPodManifest, {});
    if (!pod || !pod.metadata || !pod.metadata.name) {
      throw new Error('Failed to create pod');
    }
    this.podName = pod.metadata.name;

    // Step 2: Wait for pod to be running
    let phase = '';
    for (let i = 0; i < 30; i++) {
      const statusPod = await (await import('../utils/k8s')).getPodStatus(pod);
  phase = statusPod?.status?.phase || '';
      if (phase === 'Running') break;
      await new Promise(res => setTimeout(res, 1000));
    }
    if (phase !== 'Running') {
      throw new Error('Pod did not become ready');
    }

    // Step 3: Exec into the pod shell
    const exec = await createExec();
    if (!exec) throw new Error('Failed to create exec');
    const stream = new PassThrough();
    this.execStream = stream;
    exec.exec(
      this.podNamespace,
      this.podName!,
      'k9s', // container name
      ['/bin/sh'],
      stream,
      stream,
      stream,
      true, // tty
      (status: any) => {
        if (status && status.status !== 'Success') {
          this.emit('error', new Error('Exec failed: ' + JSON.stringify(status)));
        }
      }
    );
    this.setupStreamHandlers();
    this.emit('started', { pod: this.podName });
  }

  private setupStreamHandlers(): void {
    if (!this.execStream) return;
    this.execStream.on('data', (data: Buffer) => {
      if (!this.closed) {
        this.emit('data', data.toString());
      }
    });
    this.execStream.on('error', (err) => {
      this.emit('error', err);
    });
    // No exit event for stream, rely on session close
  }

  write(data: string): void {
    if (this.execStream && !this.closed) {
      this.execStream.write(data);
    }
  }

  // Resize is not supported with child_process.spawn (no PTY). Stub for compatibility.
  resize(cols: number, rows: number): void {
    this.config.cols = cols;
    this.config.rows = rows;
  }

  kill(signal?: string): void {
    this.close();
  }

  close(): void {
    this.cleanup();
    this.emit('closed');
  }

  private async cleanup(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.execStream) {
      this.execStream.end();
      this.execStream = null;
    }
    if (this.podName) {
      try {
        await deletePod({ metadata: { name: this.podName, namespace: this.podNamespace } } as any);
      } catch (e) {
        console.warn('Error deleting pod:', e);
      }
      this.podName = null;
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
    return !this.closed && this.childProcess !== null;
  }

  get pid(): number | undefined {
    return this.childProcess?.pid;
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