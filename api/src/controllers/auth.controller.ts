import { hasFeature } from '@wt/shared';
import { AppError } from '../lib/http';
import type { CookieOptions, Request, Response } from 'express';
import { env, REFRESH_COOKIE, REFRESH_COOKIE_PATH } from '../lib/env';
import { serializeUser } from '../lib/serialize';
import { currentUserId } from '../middlewares/auth';
import * as auth from '../services/auth.service';
import { sendDigest } from '../services/reminder.service';
import { describeMailError } from '../lib/mailer';
import { prisma } from '../lib/prisma';

const cookieBase: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProd,
  path: REFRESH_COOKIE_PATH,
};

export function sendSession(res: Response, result: { user: Parameters<typeof serializeUser>[0]; tokens: auth.IssuedTokens }, status = 200) {
  res.cookie(REFRESH_COOKIE, result.tokens.refreshToken, { ...cookieBase, expires: result.tokens.refreshExpiresAt });
  res.status(status).json({
    data: { accessToken: result.tokens.accessToken, user: serializeUser(result.user) },
  });
}

const readRefreshCookie = (req: Request): string | undefined => req.cookies?.[REFRESH_COOKIE];

export async function login(req: Request, res: Response) {
  sendSession(res, await auth.login(req.body));
}

export async function refresh(req: Request, res: Response) {
  try {
    sendSession(res, await auth.refresh(readRefreshCookie(req)));
  } catch (e) {
    res.clearCookie(REFRESH_COOKIE, cookieBase);
    throw e;
  }
}

/** Chrome Extension: access token dari sesi website (cookie tidak dirotasi / tidak diubah). */
export async function extensionSession(req: Request, res: Response) {
  const { user, accessToken } = await auth.extensionSession(readRefreshCookie(req));
  res.json({ data: { accessToken, user: serializeUser(user) } });
}

export async function logout(req: Request, res: Response) {
  await auth.logout(readRefreshCookie(req));
  res.clearCookie(REFRESH_COOKIE, cookieBase);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  res.json({ data: serializeUser(await auth.getProfile(currentUserId(req))) });
}

export async function updateMe(req: Request, res: Response) {
  if (req.isDemo && req.body.newPassword) {
    throw new AppError('FORBIDDEN', 'Ganti password tidak tersedia di mode demo.');
  }
  const user = await auth.updateProfile(currentUserId(req), req.body, readRefreshCookie(req));
  res.json({ data: serializeUser(user) });
}

export async function updatePreferences(req: Request, res: Response) {
  // Email pengingat termasuk paket Standar; mematikannya selalu boleh.
  if (req.body.emailReminders === true && !hasFeature(req.userPlan ?? 'basic', req.userRole ?? 'user', 'reminders')) {
    throw new AppError('PLAN_REQUIRED', 'Email pengingat tersedia mulai paket Standar.', undefined, { requiredPlan: 'standard' });
  }
  const user = await prisma.user.update({ where: { id: currentUserId(req) }, data: req.body });
  res.json({ data: serializeUser(user) });
}

/** Kirim email pengingat sekarang (untuk mencoba pengaturan SMTP). */
export async function sendTestReminder(req: Request, res: Response) {
  const user = await auth.getProfile(currentUserId(req));
  let result: Awaited<ReturnType<typeof sendDigest>>;
  try {
    result = await sendDigest(user, { force: true });
  } catch (err) {
    throw new AppError('SERVICE_UNAVAILABLE', describeMailError(err));
  }
  res.json({ data: { sent: result.sent, previewMode: result.preview !== null, total: result.total } });
}
