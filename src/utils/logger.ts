/**
 * Structured logging utility
 * Provides consistent logging across all layers
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  layer: string;
  message: string;
  data?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private minLevel: LogLevel;
  private layer: string;

  constructor(layer: string, minLevel: LogLevel = 'info') {
    this.layer = layer;
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  private formatEntry(entry: LogEntry): string {
    const { timestamp, level, layer, message, data } = entry;
    const prefix = `[${timestamp}] [${level.toUpperCase().padEnd(5)}] [${layer}]`;

    if (data && Object.keys(data).length > 0) {
      // Sanitize data - never log anything that looks like a key
      const sanitizedData = this.sanitize(data);
      return `${prefix} ${message} ${JSON.stringify(sanitizedData)}`;
    }

    return `${prefix} ${message}`;
  }

  private sanitize(data: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ['secretKey', 'privateKey', 'secret', 'password', 'encryptedSecretKey'];
    // Keys that contain 'key' but are safe to log
    const safeKeys = ['publicKey', 'publickey', 'walletPublicKey'];
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      // Skip redaction for known-safe keys
      if (safeKeys.some((sk) => lowerKey === sk.toLowerCase())) {
        result[key] = value;
      } else if (sensitiveKeys.some((sk) => lowerKey.includes(sk.toLowerCase()))) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.sanitize(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      layer: this.layer,
      message,
      data,
    };

    const formatted = this.formatEntry(entry);

    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      default:
        // eslint-disable-next-line no-console
        console.log(formatted);
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }
}

/**
 * Create a logger for a specific layer
 */
export function createLogger(layer: string): Logger {
  const level = (process.env['LOG_LEVEL'] as LogLevel) || 'info';
  return new Logger(layer, level);
}
