import type { LoggerService } from '@nestjs/common';

type Level = 'info' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

/** Structured JSON-lines logger. Callers must never pass secrets or financial documents. */
export class JsonLogger implements LoggerService {
  constructor(private readonly enabled = true) {}

  log(message: unknown, ...rest: unknown[]) {
    this.write('info', message, rest);
  }
  error(message: unknown, ...rest: unknown[]) {
    this.write('error', message, rest);
  }
  warn(message: unknown, ...rest: unknown[]) {
    this.write('warn', message, rest);
  }
  debug(message: unknown, ...rest: unknown[]) {
    this.write('debug', message, rest);
  }
  verbose(message: unknown, ...rest: unknown[]) {
    this.write('verbose', message, rest);
  }
  fatal(message: unknown, ...rest: unknown[]) {
    this.write('fatal', message, rest);
  }

  private write(level: Level, message: unknown, rest: unknown[]) {
    if (!this.enabled) return;
    // Nest passes the context name as the last string argument.
    const context = typeof rest.at(-1) === 'string' ? (rest.at(-1) as string) : undefined;
    const fields = typeof message === 'object' && message !== null ? message : { msg: String(message) };
    const stack = level === 'error' && typeof rest[0] === 'string' && rest.length > 1 ? rest[0] : undefined;
    const line = JSON.stringify({ time: new Date().toISOString(), level, context, ...fields, stack });
    (level === 'error' || level === 'fatal' ? process.stderr : process.stdout).write(line + '\n');
  }
}
