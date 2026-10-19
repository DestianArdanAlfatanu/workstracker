function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Environment variable ${name} wajib diisi`);
  return value;
}

const MIN_PROD_SECRET_LENGTH = 32;

function jwtSecret(): string {
  const value = required('JWT_ACCESS_SECRET');
  if (process.env.NODE_ENV === 'production' && (value.length < MIN_PROD_SECRET_LENGTH || value === 'change-me')) {
    throw new Error(`JWT_ACCESS_SECRET terlalu lemah untuk production (minimal ${MIN_PROD_SECRET_LENGTH} karakter acak)`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT ?? 4000),
  jwtAccessSecret: jwtSecret(),
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const REFRESH_COOKIE = 'rt';
// Bukan hanya /auth: PATCH /me juga butuh cookie agar sesi saat ini tidak ikut dicabut.
export const REFRESH_COOKIE_PATH = '/api/v1';
export const SOFT_DELETE_RETENTION_DAYS = 30;
