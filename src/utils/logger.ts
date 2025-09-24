/**
 * Logger utility for structured logging throughout the application
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  component?: string;
  sessionId?: string;
  pid?: number;
  [key: string]: any;
}

export class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  child(additionalContext: LogContext): Logger {
    return new Logger({ ...this.context, ...additionalContext });
  }

  debug(message: string, context: LogContext = {}): void {
    this.log('debug', message, context);
  }

  info(message: string, context: LogContext = {}): void {
    this.log('info', message, context);
  }

  warn(message: string, context: LogContext = {}): void {
    this.log('warn', message, context);
  }

  error(message: string, context: LogContext = {}): void {
    this.log('error', message, context);
  }

  private log(level: LogLevel, message: string, context: LogContext = {}): void {
    const timestamp = new Date().toISOString();
    const mergedContext = { ...this.context, ...context };
    
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...mergedContext
    };

    // In production, you might want to use a proper logging library
    // For now, use console with structured output
    const output = this.formatLogEntry(logEntry);
    
    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'debug':
        if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
          console.debug(output);
        }
        break;
      default:
        console.log(output);
    }
  }

  private formatLogEntry(entry: any): string {
    // Pretty format for development, JSON for production
    if (process.env.NODE_ENV === 'production') {
      return JSON.stringify(entry);
    }

    const { timestamp, level, message, ...context } = entry;
    const contextStr = Object.keys(context).length > 0 
      ? ` ${JSON.stringify(context)}` 
      : '';
    
    return `[${timestamp}] ${level}: ${message}${contextStr}`;
  }
}

// Export a default logger instance
export const logger = new Logger({ component: 'portfolio-api' });

// Helper function to create component-specific loggers
export function createLogger(component: string, additionalContext: LogContext = {}): Logger {
  return logger.child({ component, ...additionalContext });
}