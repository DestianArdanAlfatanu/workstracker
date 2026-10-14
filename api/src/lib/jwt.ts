import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { ACCESS_TOKEN_TTL_SECONDS, env } from './env';

export function signAccessToken(userId: bigint): string {
  return jwt.sign({}, env.jwtAccessSecret, {
    subject: userId.toString(),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    algorithm: 'HS256',
  });
}

/** Mengembalikan user id dari access token, atau null jika tidak valid/kedaluwarsa. */
export function verifyAccessToken(token: string): bigint | null {
  try {
    const payload = jwt.verify(token, env.jwtAccessSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub || !/^\d+$/.test(payload.sub)) return null;
    return BigInt(payload.sub);
  } catch {
    return null;
  }
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
