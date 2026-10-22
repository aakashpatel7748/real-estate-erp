import pino from 'pino';

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info');

export const logger = pino({
  level,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
    ],
    censor: '[redacted]',
  },
  transport:
    process.env.NODE_ENV === 'development' && process.stdout.isTTY ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
});
