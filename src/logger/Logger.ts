import type { LogLevel } from '../types/index.js';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

/** Lightweight structured logger used internally by Storix. */
export class Logger {
  private readonly level: LogLevel;
  private readonly prefix: string;

  constructor(level: LogLevel = 'warn', prefix = '[Storix]') {
    this.level = level;
    this.prefix = prefix;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
  }

  private format(level: string, message: string, meta?: unknown): string {
    const ts = new Date().toISOString();
    const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${this.prefix} [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  debug(message: string, meta?: unknown): void {
    if (this.shouldLog('debug')) {
      console.warn(this.format('debug', message, meta));
    }
  }

  info(message: string, meta?: unknown): void {
    if (this.shouldLog('info')) {
      console.warn(this.format('info', message, meta));
    }
  }

  warn(message: string, meta?: unknown): void {
    if (this.shouldLog('warn')) {
      console.warn(this.format('warn', message, meta));
    }
  }

  error(message: string, meta?: unknown): void {
    if (this.shouldLog('error')) {
      console.error(this.format('error', message, meta));
    }
  }

  /** Create a child logger with an additional namespace segment. */
  child(namespace: string): Logger {
    return new Logger(this.level, `${this.prefix}[${namespace}]`);
  }
}
