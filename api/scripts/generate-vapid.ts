/**
 * Buat kunci VAPID untuk push notification dan tulis ke api/.env bila belum ada.
 *   npm run push:keys -w api
 * Kunci privat tidak ditampilkan di layar; hanya kunci publik.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import webpush from 'web-push';

const envPath = resolve(process.cwd(), '.env');
const current = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const has = (key: string) => new RegExp(`^${key}=.+`, 'm').test(current);

if (has('VAPID_PUBLIC_KEY') && has('VAPID_PRIVATE_KEY')) {
  console.log('Kunci VAPID sudah ada di api/.env. Tidak ada yang diubah.');
} else {
  const keys = webpush.generateVAPIDKeys();
  const lines = [
    '',
    '# Push notification (dibuat oleh npm run push:keys). Jangan diganti setelah dipakai: langganan lama akan hilang.',
    `VAPID_PUBLIC_KEY=${keys.publicKey}`,
    `VAPID_PRIVATE_KEY=${keys.privateKey}`,
    ...(has('VAPID_SUBJECT') ? [] : ['VAPID_SUBJECT=mailto:workstrackernotifications@gmail.com']),
    '',
  ];
  appendFileSync(envPath, lines.join('\n'));
  console.log('Kunci VAPID ditambahkan ke api/.env. Restart API agar aktif.');
  console.log(`Kunci publik: ${keys.publicKey}`);
}
