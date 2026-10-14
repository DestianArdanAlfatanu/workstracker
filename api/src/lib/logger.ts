import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.isTest ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  transport: env.isProd || env.isTest ? undefined : { target: 'pino-pretty', options: { colorize: true } },
});
