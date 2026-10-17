-- Lampiran per lamaran diganti "CV Saya". Tabel lama TIDAK dihapus, hanya diganti nama, agar
-- skrip "npm run migrate:cv -w api" bisa memindahkan datanya ke cv_documents setelah deploy.
-- Hapus tabel ini di rilis berikutnya setelah data dipastikan pindah.
RENAME TABLE `attachments` TO `legacy_attachments`;
