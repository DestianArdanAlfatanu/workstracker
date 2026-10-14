import type { ApplicationSource, ApplicationStatus, Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../lib/prisma';

/**
 * Data contoh yang realistis untuk akun demo instan dan seed development:
 * 12 lamaran + riwayat status, tugas, profil karier, deskripsi lowongan, target mingguan.
 */

const DAY = 86_400_000;
const date = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * DAY);
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00Z`);
};

export const SAMPLE_APPLICATIONS: Array<{
  company: string;
  position: string;
  source: ApplicationSource;
  path: ApplicationStatus[];
  applied: number;
  next?: number;
  note?: string;
  salary?: [number, number];
}> = [
  { company: 'Tokopedia', position: 'Frontend Engineer', source: 'linkedin', path: ['applied', 'screening', 'interview'], applied: -20, next: 0, note: 'Interview user dengan EM', salary: [12_000_000, 18_000_000] },
  { company: 'Gojek', position: 'Software Engineer', source: 'referral', path: ['applied', 'screening'], applied: -14, next: 3, note: 'Follow-up recruiter' },
  { company: 'Traveloka', position: 'Web Developer', source: 'jobstreet', path: ['applied', 'rejected'], applied: -30 },
  { company: 'Bukalapak', position: 'React Developer', source: 'glints', path: ['applied'], applied: -5, next: -2, note: 'Kirim email follow-up' },
  { company: 'Shopee', position: 'Frontend Engineer', source: 'company_site', path: ['applied', 'screening', 'interview', 'offer'], applied: -35, next: 5, note: 'Batas jawab offer', salary: [15_000_000, 20_000_000] },
  { company: 'Blibli', position: 'UI Engineer', source: 'kalibrr', path: ['wishlist'], applied: -1 },
  { company: 'Xendit', position: 'Full-stack Engineer', source: 'linkedin', path: ['applied', 'withdrawn'], applied: -25 },
  { company: 'Ruangguru', position: 'Frontend Developer', source: 'glints', path: ['applied'], applied: -3 },
  { company: 'Dana', position: 'Software Engineer', source: 'linkedin', path: ['applied', 'screening', 'interview'], applied: -12, next: 1, note: 'Technical test' },
  { company: 'OVO', position: 'Web Engineer', source: 'jobstreet', path: ['applied', 'rejected'], applied: -40 },
  { company: 'Halodoc', position: 'Frontend Engineer', source: 'referral', path: ['applied', 'screening', 'interview', 'offer', 'accepted'], applied: -50, salary: [14_000_000, 16_000_000] },
  { company: 'Mekari', position: 'React Engineer', source: 'other', path: ['applied'], applied: -7, next: 7, note: 'Cek status lamaran' },
];

const JOB_DESCRIPTIONS: Record<string, string> = {
  Tokopedia:
    'Kami mencari Frontend Engineer untuk tim Seller Experience.\nKualifikasi:\n- 2+ tahun pengalaman React & TypeScript\n- Memahami optimasi performa web (Core Web Vitals)\n- Terbiasa menulis unit test (Jest/Testing Library)\n- Pengalaman dengan GraphQL menjadi nilai tambah\n- Mampu berkolaborasi dengan product & design',
  Gojek:
    'Software Engineer (Frontend) untuk produk GoPay Merchant.\n- Membangun dashboard merchant dengan React\n- Bekerja dengan tim lintas fungsi secara agile\n- Memahami state management dan aksesibilitas web\n- Pengalaman CI/CD dan code review',
};

export const SAMPLE_PROFILE = {
  headline: 'Frontend Engineer · 3 tahun React & TypeScript',
  city: 'Jakarta',
  summary: 'Frontend engineer yang fokus pada performa dan aksesibilitas, terbiasa bekerja dengan tim produk & desain.',
  skills: 'React, TypeScript, Next.js, Tailwind CSS, Testing Library, Figma, REST API',
  experience:
    'Frontend Developer — PT Niaga Digital (2023–sekarang)\n- Membangun dashboard admin React yang dipakai 200+ staf\n- Menurunkan waktu muat halaman 40% dengan code splitting\n\nWeb Developer — Studio Kreatif (2021–2023)\n- Mengembangkan 15+ landing page klien dengan Next.js',
  education: 'S1 Teknik Informatika — Universitas Indonesia (2017–2021)',
  achievements: 'Juara 2 Hackathon Fintech 2022; Sertifikasi Meta Front-End Developer',
};

/** Isi (ulang) workspace user dengan data contoh. Lamaran & tugas lama user ini dihapus. */
export async function seedSampleWorkspace(userId: bigint, db: PrismaClient | Prisma.TransactionClient = defaultPrisma) {
  await db.task.deleteMany({ where: { userId } });
  await db.application.deleteMany({ where: { userId } });

  const ids = new Map<string, bigint>();
  for (const r of SAMPLE_APPLICATIONS) {
    const app = await db.application.create({
      data: {
        userId,
        company: r.company,
        position: r.position,
        source: r.source,
        status: r.path[r.path.length - 1],
        location: 'Jakarta',
        workType: 'hybrid',
        salaryMin: r.salary?.[0],
        salaryMax: r.salary?.[1],
        appliedAt: date(r.applied),
        nextActionDate: r.next !== undefined ? date(r.next) : null,
        nextActionNote: r.note,
        jobDescription: JOB_DESCRIPTIONS[r.company] ?? null,
        history: {
          create: r.path.map((to, i) => ({
            fromStatus: i === 0 ? null : r.path[i - 1],
            toStatus: to,
            changedAt: new Date(Date.now() + (r.applied + i * 3) * DAY),
          })),
        },
      },
      select: { id: true },
    });
    ids.set(r.company, app.id);
  }

  await db.task.createMany({
    data: [
      { userId, applicationId: ids.get('Tokopedia'), title: 'Latihan jawab pertanyaan behavioral', dueDate: date(0) },
      { userId, applicationId: ids.get('Dana'), title: 'Kerjakan technical test', dueDate: date(1) },
      { userId, title: 'Perbarui CV dengan proyek terbaru', dueDate: date(-1) },
      { userId, title: 'Rapikan profil LinkedIn', dueDate: null },
      { userId, title: 'Riset gaji Frontend Engineer', dueDate: date(-3), doneAt: new Date() },
    ],
  });

  await db.careerProfile.upsert({
    where: { userId },
    update: SAMPLE_PROFILE,
    create: { userId, ...SAMPLE_PROFILE },
  });
  await db.user.update({ where: { id: userId }, data: { weeklyGoal: 5 } });
}
