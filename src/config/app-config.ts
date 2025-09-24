/**
 * Configuration management for terminal and K9s services
 */

export interface TerminalConfig {
  defaultCols: number;
  defaultRows: number;
  shell: string;
  shellArgs: string[];
  heartbeatInterval: number;
  maxIdleTime: number;
  welcomeMessage: string;
}

export interface K9sConfig {
  enabled: boolean;
  rbacServiceAccount: string;
  namespace: string;
  resources: {
    requests: {
      cpu: string;
      memory: string;
    };
    limits: {
      cpu: string;
      memory: string;
    };
  };
}

export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    origins: string[];
  };
}

export interface AppConfig {
  environment: 'development' | 'production' | 'test';
  server: ServerConfig;
  terminal: TerminalConfig;
  k9s: K9sConfig;
  logging: {
    level: string;
    enableDebug: boolean;
  };
}

class ConfigManager {
  private config: AppConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): AppConfig {
    const env = (process.env.NODE_ENV as AppConfig['environment']) || 'development';
    
    return {
      environment: env,
      server: {
        port: parseInt(process.env.PORT || '4000', 10),
        host: process.env.HOST || '0.0.0.0',
        cors: {
          origins: this.parseStringArray(process.env.CORS_ORIGINS) || ['*']
        }
      },
      terminal: {
        defaultCols: parseInt(process.env.TERMINAL_DEFAULT_COLS || '80', 10),
        defaultRows: parseInt(process.env.TERMINAL_DEFAULT_ROWS || '24', 10),
        shell: process.env.TERMINAL_SHELL || 'sh',
        shellArgs: this.parseStringArray(process.env.TERMINAL_SHELL_ARGS) || ['-c'],
        heartbeatInterval: parseInt(process.env.TERMINAL_HEARTBEAT_INTERVAL || '30000', 10),
        maxIdleTime: parseInt(process.env.TERMINAL_MAX_IDLE_TIME || '300000', 10), // 5 minutes
        welcomeMessage: process.env.TERMINAL_WELCOME_MESSAGE || 
          'Kubernetes Terminal Ready!\\nAvailable: k9s, kubectl, htop, nano, tmux\\nRunning in-cluster with RBAC'
      },
      k9s: {
        enabled: process.env.K9S_ENABLED !== 'false',
        rbacServiceAccount: process.env.K9S_SERVICE_ACCOUNT || 'portfolio-api-sa',
        namespace: process.env.K9S_NAMESPACE || process.env.POD_NAMESPACE || 'default',
        resources: {
          requests: {
            cpu: process.env.K9S_CPU_REQUEST || '100m',
            memory: process.env.K9S_MEMORY_REQUEST || '128Mi'
          },
          limits: {
            cpu: process.env.K9S_CPU_LIMIT || '200m',
            memory: process.env.K9S_MEMORY_LIMIT || '256Mi'
          }
        }
      },
      logging: {
        level: process.env.LOG_LEVEL || (env === 'development' ? 'debug' : 'info'),
        enableDebug: process.env.DEBUG === 'true' || env === 'development'
      }
    };
  }

  private parseStringArray(value: string | undefined): string[] | undefined {
    if (!value) return undefined;
    return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }

  get(): AppConfig {
    return this.config;
  }

  getServer(): ServerConfig {
    return this.config.server;
  }

  getTerminal(): TerminalConfig {
    return this.config.terminal;
  }

  getK9s(): K9sConfig {
    return this.config.k9s;
  }

  isProduction(): boolean {
    return this.config.environment === 'production';
  }

  isDevelopment(): boolean {
    return this.config.environment === 'development';
  }

  reload(): void {
    this.config = this.loadConfig();
  }
}

// Export singleton instance
export const config = new ConfigManager();

// Export individual config getters for convenience
export const getConfig = () => config.get();
export const getServerConfig = () => config.getServer();
export const getTerminalConfig = () => config.getTerminal();
export const getK9sConfig = () => config.getK9s();