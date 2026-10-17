import type { NextFunction, Request, Response } from 'express';
import { FEATURE_LABELS, hasFeature, PLANS, requiredPlan, type Feature, type Plan, type UserRole } from '@wt/shared';
import { AppError } from '../lib/http';
import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: bigint;
      userRole?: UserRole;
      userPlan?: Plan;
      isDemo?: boolean;
    }
  }
}

const sessionExpired = () => new AppError('UNAUTHORIZED', 'Sesi berakhir, silakan login kembali');

/**
 * Verifikasi access token lalu cek status akun di database, sehingga akun yang
 * dinonaktifkan admin langsung kehilangan akses walau token belum kedaluwarsa.
 */
function authenticate({ allowPasswordChange }: { allowPasswordChange: boolean }) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization ?? '';
      const [scheme, token] = header.split(' ');
      const userId = scheme === 'Bearer' && token ? verifyAccessToken(token) : null;
      if (!userId) return next(sessionExpired());

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, plan: true, status: true, mustChangePassword: true, isDemo: true, demoExpiresAt: true },
      });
      if (!user) return next(sessionExpired());
      if (user.isDemo && user.demoExpiresAt && user.demoExpiresAt <= new Date()) {
        return next(new AppError('UNAUTHORIZED', 'Sesi demo sudah berakhir. Silakan mulai demo baru.'));
      }
      if (user.status === 'suspended') {
        return next(new AppError('UNAUTHORIZED', 'Akun Anda dinonaktifkan. Hubungi admin.'));
      }
      if (user.mustChangePassword && !allowPasswordChange) {
        return next(new AppError('PASSWORD_CHANGE_REQUIRED', 'Silakan ganti password default Anda terlebih dahulu'));
      }
      req.userId = userId;
      req.userRole = user.role;
      req.userPlan = user.plan;
      req.isDemo = user.isDemo;
      next();
    } catch (e) {
      next(e);
    }
  };
}

export const requireAuth = authenticate({ allowPasswordChange: false });
/** Untuk /me: tetap bisa diakses selama password default belum diganti. */
export const requireAuthAllowPasswordChange = authenticate({ allowPasswordChange: true });

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.userRole !== 'admin') return next(new AppError('FORBIDDEN', 'Halaman ini khusus admin'));
  next();
}

/** User id dari request yang sudah melewati requireAuth. */
export function currentUserId(req: Request): bigint {
  if (!req.userId) throw sessionExpired();
  return req.userId;
}

/** Tolak fitur tertentu untuk akun demo instan. */
export const blockDemo =
  (feature: string) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (req.isDemo) return next(new AppError('FORBIDDEN', `${feature} tidak tersedia di mode demo. Beli akses untuk memakai fitur ini.`));
    next();
  };
/** Tolak fitur yang tidak termasuk paket pengguna (admin selalu boleh). */
export const requireFeature =
  (feature: Feature) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (hasFeature(req.userPlan ?? 'basic', req.userRole ?? 'user', feature)) return next();
    const plan = requiredPlan(feature);
    next(
      new AppError('PLAN_REQUIRED', `${FEATURE_LABELS[feature]} tersedia mulai paket ${PLANS[plan].name}.`, undefined, {
        requiredPlan: plan,
      }),
    );
  };