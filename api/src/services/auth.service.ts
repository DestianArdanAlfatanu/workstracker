import { Prisma, type User } from '@prisma/client';
import { hasFeature } from '@wt/shared';
import bcrypt from 'bcrypt';
import { REFRESH_TOKEN_TTL_MS } from '../lib/env';
import { AppError } from '../lib/http';
import { generateRefreshToken, hashToken, signAccessToken } from '../lib/jwt';
import { BCRYPT_COST, hashPassword } from '../lib/password';
import { prisma } from '../lib/prisma';

// Hash dummy agar waktu respons login sama walau email tidak terdaftar.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

const invalidSession = () => new AppError('UNAUTHORIZED', 'Sesi berakhir, silakan login kembali');
const suspendedError = () => new AppError('FORBIDDEN', 'Akun Anda dinonaktifkan. Hubungi admin.');

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export async function issueTokens(userId: bigint, tx: Prisma.TransactionClient = prisma): Promise<IssuedTokens> {
  const refreshToken = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await tx.refreshToken.create({
    data: { userId, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiresAt },
  });
  return { accessToken: signAccessToken(userId), refreshToken, refreshExpiresAt };
}

/** Cabut semua refresh token user (mis. setelah suspend / reset password). */
export async function revokeAllSessions(userId: bigint, tx: Prisma.TransactionClient = prisma) {
  await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || user.isDemo) throw new AppError('UNAUTHORIZED', 'Email atau password salah');
  if (user.status === 'suspended') throw suspendedError();
  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { user: updated, tokens: await issueTokens(user.id) };
}

/** Rotasi refresh token: token lama dicabut, token baru diterbitkan. */
export async function refresh(rawToken: string | undefined) {
  if (!rawToken) throw invalidSession();
  const tokenHash = hashToken(rawToken);
  return prisma.$transaction(async (tx) => {
    const stored = await tx.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) throw invalidSession();
    if (stored.user.status === 'suspended') throw suspendedError();
    if (stored.user.isDemo && stored.user.demoExpiresAt && stored.user.demoExpiresAt <= new Date()) throw invalidSession();
    const revoked = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) throw invalidSession();
    return { user: stored.user, tokens: await issueTokens(stored.userId, tx) };
  });
}

/**
 * Sesi untuk Chrome Extension: memakai refresh cookie milik website TANPA merotasinya
 * (rotasi bersamaan dengan website bisa membuat website ter-logout). Hanya menerbitkan
 * access token singkat; logout/ganti password/suspend di website otomatis memutus extension.
 */
export async function extensionSession(rawToken: string | undefined) {
  if (!rawToken) throw invalidSession();
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(rawToken) }, include: { user: true } });
  if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) throw invalidSession();
  if (stored.user.status === 'suspended') throw suspendedError();
  if (stored.user.isDemo) {
    throw new AppError('FORBIDDEN', 'Chrome Extension tidak tersedia di mode demo. Beli akses untuk memakainya.');
  }
  if (stored.user.mustChangePassword) {
    throw new AppError('PASSWORD_CHANGE_REQUIRED', 'Buat password baru di website WorksTracker terlebih dahulu.');
  }
  if (!hasFeature(stored.user.plan, stored.user.role, 'extension')) {
    throw new AppError('PLAN_REQUIRED', 'Chrome Extension tersedia mulai paket Standar.', undefined, { requiredPlan: 'standard' });
  }
  return { user: stored.user, accessToken: signAccessToken(stored.userId) };
}

export async function logout(rawToken: string | undefined) {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getProfile(userId: bigint): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw invalidSession();
  return user;
}

export async function updateProfile(
  userId: bigint,
  input: { name?: string; currentPassword?: string; newPassword?: string },
  currentRefreshToken: string | undefined,
) {
  const user = await getProfile(userId);
  const data: Prisma.UserUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.newPassword) {
    const ok = await bcrypt.compare(input.currentPassword ?? '', user.passwordHash);
    if (!ok) {
      throw new AppError('VALIDATION_ERROR', 'Password saat ini salah', {
        currentPassword: 'Password saat ini salah',
      });
    }
    if (input.newPassword === input.currentPassword) {
      throw new AppError('VALIDATION_ERROR', 'Password baru harus berbeda dari password saat ini', {
        newPassword: 'Password baru harus berbeda dari password saat ini',
      });
    }
    data.passwordHash = await hashPassword(input.newPassword);
    data.mustChangePassword = false;
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: userId }, data });
    if (input.newPassword) {
      // Keluarkan sesi di perangkat lain; sesi saat ini tetap aktif.
      await tx.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(currentRefreshToken ? { NOT: { tokenHash: hashToken(currentRefreshToken) } } : {}),
        },
        data: { revokedAt: new Date() },
      });
    }
    return updated;
  });
}
