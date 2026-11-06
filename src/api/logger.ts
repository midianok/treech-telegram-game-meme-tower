import { apiFetch } from '../api';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SOURCE = 'meme-tower';

function send(
  level: LogLevel,
  message: string,
  context: Record<string, unknown>,
  data?: Record<string, unknown>,
): void {
  const body = {
    source: SOURCE,
    level,
    message,
    data: { ...context, ...data },
  };

  apiFetch('/api/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {
    // Logging is best-effort; swallow network errors silently
  });
}

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  withContext(context: Record<string, unknown>): Logger;
}

function createLogger(context: Record<string, unknown> = {}): Logger {
  return {
    info: (message, data) => send('info', message, context, data),
    warn: (message, data) => send('warn', message, context, data),
    error: (message, data) => send('error', message, context, data),
    withContext: (extra) => createLogger({ ...context, ...extra }),
  };
}

export const logger = createLogger();
