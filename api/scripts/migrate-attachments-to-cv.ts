/** Pindahkan lampiran lama ke "CV Saya". Jalankan sekali setelah `npm run db:deploy`: npm run migrate:cv -w api */
import { prisma } from '../src/lib/prisma';
import { migrateLegacyAttachments } from '../src/services/cv-migration';

migrateLegacyAttachments()
  .then((r) => {
    if (!r) console.log('Tidak ada tabel lampiran lama. Tidak ada yang perlu dipindahkan.');
    else
      console.log(
        `Selesai: ${r.total} lampiran lama → ${r.created} CV baru, ${r.linked} lamaran terhubung ke CV, ${r.removedDuplicates} file duplikat dihapus.`,
      );
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
