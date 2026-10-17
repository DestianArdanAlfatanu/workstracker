import { APP_URL, button, escapeHtml, paragraph, renderLayout } from '../lib/email-layout';
import { aiStatus, describeAiError, pingAi } from '../lib/ai';
import { describeMailError, mailStatus, sendMail } from '../lib/mailer';
import { prisma } from '../lib/prisma';
import type { Request, Response } from 'express';
import type { AdminListQuery } from '@wt/shared';
import { AppError, parseId } from '../lib/http';
import { serializeAdminUser, serializePurchase } from '../lib/serialize';
import { currentUserId } from '../middlewares/auth';
import * as admin from '../services/admin.service';

/** Admin tidak boleh menonaktifkan/menghapus akunnya sendiri. */
function targetId(req: Request) {
  const id = parseId(req.params.id);
  if (id === currentUserId(req)) throw new AppError('FORBIDDEN', 'Tidak bisa melakukan aksi ini pada akun Anda sendiri');
  return id;
}

export async function overview(_req: Request, res: Response) {
  res.json({ data: await admin.overview() });
}

export async function list(req: Request, res: Response) {
  const query = req.query as unknown as AdminListQuery;
  const { items, total } = await admin.listBuyers(query);
  const ai = await admin.aiUsageFor(items.map((u) => u.id));
  res.json({
    data: items.map((u) => serializeAdminUser(u, ai.get(u.id.toString()) ?? 0)),
    meta: { page: query.page, limit: query.limit, total },
  });
}

export async function create(req: Request, res: Response) {
  const { user, tempPassword } = await admin.createBuyer(currentUserId(req), req.body);
  res.status(201).json({ data: { user: serializeAdminUser(user), tempPassword } });
}

export async function update(req: Request, res: Response) {
  const user = await admin.updateBuyer(parseId(req.params.id), req.body);
  res.json({ data: serializeAdminUser(user) });
}

export async function resetPassword(req: Request, res: Response) {
  const { user, tempPassword } = await admin.resetPassword(targetId(req));
  res.json({ data: { user: serializeAdminUser(user), tempPassword } });
}

export async function suspend(req: Request, res: Response) {
  res.json({ data: serializeAdminUser(await admin.setStatus(targetId(req), 'suspended')) });
}

export async function activate(req: Request, res: Response) {
  res.json({ data: serializeAdminUser(await admin.setStatus(targetId(req), 'active')) });
}

export async function remove(req: Request, res: Response) {
  await admin.deleteBuyer(targetId(req));
  res.status(204).end();
}

async function withUsage(id: bigint, user: Awaited<ReturnType<typeof admin.setPlan>>) {
  const ai = await admin.aiUsageFor([id]);
  return serializeAdminUser(user, ai.get(id.toString()) ?? 0);
}

export async function setPlan(req: Request, res: Response) {
  const id = parseId(req.params.id);
  res.json({ data: await withUsage(id, await admin.setPlan(currentUserId(req), id, req.body)) });
}

export async function addCredits(req: Request, res: Response) {
  const id = parseId(req.params.id);
  res.json({ data: await withUsage(id, await admin.addCredits(currentUserId(req), id, req.body)) });
}

export async function purchases(req: Request, res: Response) {
  const items = await admin.purchasesOf(parseId(req.params.id));
  res.json({ data: items.map(serializePurchase) });
}
/* ------------------------------ Integrasi ------------------------------ */

export async function integrations(_req: Request, res: Response) {
  res.json({ data: { ai: aiStatus(), email: mailStatus() } });
}

/** Tes koneksi Gemini (panggilan kecil, biaya < Rp 20). */
export async function testAi(_req: Request, res: Response) {
  try {
    res.json({ data: { ok: true, ...(await pingAi()) } });
  } catch (err) {
    res.json({ data: { ok: false, error: describeAiError(err) } });
  }
}

/** Kirim email uji ke alamat admin yang sedang login. */
export async function testEmail(req: Request, res: Response) {
  const admin = await prisma.user.findUniqueOrThrow({ where: { id: currentUserId(req) } });
  try {
    const { html, attachments } = renderLayout({
      preheader: 'Pengaturan email WorksTracker sudah benar.',
      title: 'Email WorksTracker berfungsi',
      bodyHtml:
        paragraph(`Halo ${escapeHtml(admin.name.split(' ')[0])},`) +
        paragraph('Email ini menandakan pengaturan SMTP WorksTracker sudah benar. Pengingat harian untuk pengguna akan dikirim melalui alamat yang sama.') +
        button('Buka WorksTracker', APP_URL),
      footerNote: 'Email uji ini dikirim dari halaman Admin → Integrasi.',
    });
    const { preview } = await sendMail({
      to: admin.email,
      subject: 'Tes email WorksTracker berhasil',
      text: 'Pengaturan SMTP WorksTracker sudah benar. Pengingat harian akan dikirim melalui alamat ini.',
      html,
      attachments,
    });
    res.json({ data: { ok: true, to: admin.email, previewMode: preview !== null } });
  } catch (err) {
    res.json({ data: { ok: false, error: describeMailError(err) } });
  }
}
