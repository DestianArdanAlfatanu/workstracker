import { createApp } from '../src/app';
import { REFRESH_COOKIE } from '../src/lib/env';
import { prisma } from '../src/lib/prisma';
import { serializeUser } from '../src/lib/serialize';
import { hashPassword } from '../src/lib/password';
import * as auth from '../src/services/auth.service';

export const API = '/api/v1';

export async function resetDb() {
  await prisma.passwordResetToken.deleteMany();
  await prisma.aiCreditLedger.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.aiGeneration.deleteMany();
  await prisma.careerProfile.deleteMany();
  await prisma.announcementRead.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.task.deleteMany();
  await prisma.statusHistory.deleteMany();
  await prisma.application.deleteMany();
  await prisma.cvDocument.deleteMany();
  await prisma.paymentOrder.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.license.deleteMany();
  await prisma.user.deleteMany();
}

let counter = 0;

/**
 * Registrasi publik ditutup, jadi user test dibuat langsung di database lalu login
 * lewat service (tidak lewat HTTP agar tidak terkena rate limit login).
 * Default paket Standar (semua fitur kecuali AI); tes AI memakai `plan: 'premium'`.
 */
export async function registerUser(
  app = createApp(),
  overrides: Partial<{
    name: string;
    email: string;
    password: string;
    role: 'user' | 'admin';
    plan: 'basic' | 'standard' | 'premium';
    aiCredits: number;
  }> = {},
) {
  counter += 1;
  const body = {
    name: `User ${counter}`,
    email: `user${counter}-${Date.now()}@example.com`,
    password: 'rahasia123',
    ...overrides,
  };
  await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      role: overrides.role ?? 'user',
      plan: overrides.plan ?? 'standard',
      aiCredits: overrides.aiCredits ?? 0,
      passwordHash: await hashPassword(body.password),
    },
  });
  const session = await auth.login({ email: body.email, password: body.password });
  const cookie = [`${REFRESH_COOKIE}=${session.tokens.refreshToken}; Path=/api/v1; HttpOnly; SameSite=Lax`];
  return { app, token: session.tokens.accessToken, cookie, user: serializeUser(session.user), body };
}

export const registerAdmin = (app = createApp()) => registerUser(app, { role: 'admin', name: 'Admin Test' });

export const validApplication = (overrides: Record<string, unknown> = {}) => ({
  company: 'Tokopedia',
  position: 'Frontend Engineer',
  appliedAt: '2026-10-01',
  ...overrides,
});

export function daysAgoISO(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}
