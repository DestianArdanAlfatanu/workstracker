import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { logger } from './logger';

/** Teks CV di bawah batas ini dianggap tidak terbaca (CV hasil scan / gambar). */
const MIN_TEXT_CHARS = 150;
const MAX_TEXT_CHARS = 60_000;

const MAGIC: Record<string, number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
  'application/msword': [0xd0, 0xcf, 0x11, 0xe0], // OLE2 (Word 97-2003)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [0x50, 0x4b, 0x03, 0x04], // ZIP
};

/** Pastikan isi file sesuai formatnya (MIME dari browser bisa dipalsukan). */
export function matchesCvSignature(buffer: Buffer, mimeType: string) {
  const sig = MAGIC[mimeType];
  return !!sig && sig.every((byte, i) => buffer[i] === byte);
}

const tidy = (s: string) =>
  s
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Baca teks CV sekali saat diunggah (tanpa AI). AI nanti cukup membaca teks ini — lebih hemat
 * dan bisa untuk file Word. Hasil null = tidak terbaca (CV hasil scan → AI membaca file PDF-nya).
 */
export async function extractCvText(buffer: Buffer, mimeType: string): Promise<{ text: string | null; pageCount: number | null }> {
  try {
    if (mimeType === 'application/pdf') {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { totalPages, text } = await extractText(pdf, { mergePages: true });
      const clean = tidy(Array.isArray(text) ? text.join('\n') : text);
      return { text: clean.replace(/\s/g, '').length >= MIN_TEXT_CHARS ? clean.slice(0, MAX_TEXT_CHARS) : null, pageCount: totalPages };
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const { value } = await mammoth.extractRawText({ buffer });
      const clean = tidy(value);
      return { text: clean.replace(/\s/g, '').length >= MIN_TEXT_CHARS ? clean.slice(0, MAX_TEXT_CHARS) : null, pageCount: null };
    }
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err, mimeType }, 'Teks CV tidak terbaca');
  }
  // Word 97-2003 (.doc) tidak dibaca otomatis; AI memakai Profil Karier saja.
  return { text: null, pageCount: null };
}
