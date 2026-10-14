import bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';

export const BCRYPT_COST = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_COST);

/**
 * Password default untuk akun baru / reset: nama depan + 4 digit acak, mis. "rina4821".
 * Mudah diketik pembeli, tapi angkanya acak sehingga tidak bisa ditebak dari nama saja.
 * Pembeli wajib menggantinya saat login pertama.
 */
export function generateDefaultPassword(name: string): string {
  const base =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/\s+/)[0]
      ?.replace(/[^a-z]/g, '')
      .slice(0, 12) ?? '';
  const word = base.length >= 3 ? base : 'user';
  const digits = String(randomInt(0, 10_000)).padStart(4, '0');
  return `${word}${digits}`;
}
