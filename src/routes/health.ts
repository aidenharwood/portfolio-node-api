/**
 * Health check and monitoring endpoints for terminal services
 */
import { Request, Response } from 'express';
import { getK9sTerminalServer } from '../services/k9s-terminal-server';
import { createLogger } from '../utils/logger';
import { getConfig } from '../config/app-config';

const logger = createLogger('health-check');

/**
 * Basic health check endpoint
 */
export function healthCheck(req: Request, res: Response): void {
  try {
    const config = getConfig();
    const k9sServer = getK9sTerminalServer();
    const stats = k9sServer.getStats();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.environment,
      version: process.env.npm_package_version || 'unknown',
      services: {
        terminal: {
          status: 'active',
          activeConnections: stats.activeConnections,
          activeSessions: stats.activeSessions
        },
        k9s: {
          enabled: config.k9s.enabled,
          serviceAccount: config.k9s.rbacServiceAccount,
          namespace: config.k9s.namespace
        }
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
        }
      }
    };

    res.json(health);
    
    // Log health check requests in debug mode
    logger.debug('Health check requested', {
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      stats: stats
    });

  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(500).json({
      status: 'unhealthy',
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Detailed terminal statistics endpoint
 */
export function terminalStats(req: Request, res: Response): void {
  try {
    const k9sServer = getK9sTerminalServer();
    const stats = k9sServer.getStats();
    
    res.json({
      timestamp: new Date().toISOString(),
      connections: {
        active: stats.activeConnections,
        total: stats.activeConnections
      },
      sessions: {
        active: stats.activeSessions,
        all: stats.allSessions
      }
    });

  } catch (error) {
    logger.error('Terminal stats request failed', { error });
    res.status(500).json({
      error: 'Failed to retrieve terminal statistics',
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Configuration overview endpoint (non-sensitive data only)
 */
export function configInfo(req: Request, res: Response): void {
  try {
    const config = getConfig();
    
    const configInfo = {
      environment: config.environment,
      server: {
        port: config.server.port,
        host: config.server.host
      },
      terminal: {
        defaultSize: `${config.terminal.defaultCols}x${config.terminal.defaultRows}`,
        shell: config.terminal.shell,
        heartbeatInterval: config.terminal.heartbeatInterval,
        maxIdleTime: config.terminal.maxIdleTime
      },
      k9s: {
        enabled: config.k9s.enabled,
        serviceAccount: config.k9s.rbacServiceAccount,
        namespace: config.k9s.namespace
      },
      logging: {
        level: config.logging.level,
        debugEnabled: config.logging.enableDebug
      }
    };

    res.json(configInfo);

  } catch (error) {
    logger.error('Config info request failed', { error });
    res.status(500).json({
      error: 'Failed to retrieve configuration info',
      timestamp: new Date().toISOString()
    });
  }
}