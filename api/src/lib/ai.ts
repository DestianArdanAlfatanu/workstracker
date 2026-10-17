import { ApiError, GoogleGenAI, MediaResolution, ThinkingLevel, type GenerateContentResponse, type Part } from '@google/genai';
import * as z from 'zod/v4';
import { logger } from './logger';

/**
 * Lapisan tipis di atas Google Gen AI SDK (Gemini). Service AI hanya memakai interface
 * `AiProvider`, sehingga tes & E2E bisa memakai provider palsu tanpa memanggil API berbayar.
 */

export const AI_MODEL = process.env.AI_MODEL?.trim() || 'gemini-3.1-pro-preview';
const apiKey = () => process.env.GEMINI_API_KEY?.trim();

/** Kedalaman "berpikir" model: low untuk tugas sederhana (ekstraksi), high untuk analisis. */
export type AiThinking = 'low' | 'high';

export type AiPart =
  | { type: 'text'; text: string }
  /** Berkas inline: CV (PDF) atau gambar poster. */
  | { type: 'file'; mimeType: string; base64: string };

export interface AiPrompt {
  system: string;
  parts: AiPart[];
  thinking: AiThinking;
  maxTokens: number;
}

export interface AiUsageInfo {
  model: string;
  /** Token input di luar cache. */
  inputTokens: number;
  /** Token output termasuk token "thinking" (ditagih sebagai output). */
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicroUsd: number;
}

/** Model menolak / memblokir permintaan (filter keamanan). */
export class AiRefusalError extends Error {}
/** Jawaban terpotong / tidak lengkap / JSON tidak valid. */
export class AiIncompleteError extends Error {}
/** AI belum dikonfigurasi (API key kosong). */
export class AiNotConfiguredError extends Error {}

export interface StreamCallbacks {
  onText: (delta: string) => void;
}

export interface AiProvider {
  streamText(prompt: AiPrompt, cb: StreamCallbacks, signal: AbortSignal): Promise<{ text: string; usage: AiUsageInfo }>;
  structured<T>(prompt: AiPrompt, schema: z.ZodType<T>): Promise<{ data: T; usage: AiUsageInfo }>;
}

/* ----------------------------- Biaya ----------------------------- */

/**
 * USD per 1 juta token: input, output (termasuk thinking), input dari cache.
 * Harga untuk prompt ≤200k token (prompt WorksTracker jauh di bawah itu). Sumber: ai.google.dev/pricing.
 */
const PRICES: Record<string, [number, number, number]> = {
  'gemini-3.1-pro-preview': [2, 12, 0.2],
  // Cadangan bila model preview dimatikan Google (harga setelah kenaikan terjadwal).
  'gemini-4-argon': [4, 20, 0.2],
  'gemini-3.8-flash': [1.5, 7.5, 0.15],
  // Free tier tersedia (tanpa billing); harga berlaku bila billing aktif.
  'gemini-3-flash-preview': [0.5, 3, 0.05],
};

export function priceFor(model: string) {
  return PRICES[model] ?? PRICES['gemini-3.1-pro-preview'];
}

/** token × harga per 1 juta token = mikro-USD. */
export function usageFrom(
  model: string,
  u: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number } | undefined,
): AiUsageInfo {
  const [pIn, pOut, pCache] = priceFor(model);
  const cached = u?.cachedContentTokenCount ?? 0;
  const inputTokens = Math.max(0, (u?.promptTokenCount ?? 0) - cached);
  const outputTokens = (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0);
  return {
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
    costMicroUsd: Math.round(inputTokens * pIn + outputTokens * pOut + cached * pCache),
  };
}

/* ------------------------ Skema JSON untuk Gemini ------------------------ */

type Json = Record<string, unknown>;

/**
 * Ubah skema zod menjadi JSON Schema yang didukung Gemini (subset JSON Schema):
 * `anyOf [X, null]` → `type: [X, "null"]`, tanpa `$schema` dan tanpa batas angka bawaan zod.
 */
export function toGeminiSchema(schema: z.ZodType): Json {
  const raw = z.toJSONSchema(schema, { unrepresentable: 'any' }) as Json;
  delete raw.$schema;
  return simplify(raw) as Json;
}

function simplify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(simplify);
  if (!node || typeof node !== 'object') return node;
  const n = { ...(node as Json) };
  const variants = n.anyOf as Json[] | undefined;
  if (Array.isArray(variants) && variants.length === 2 && variants.some((v) => v.type === 'null')) {
    const other = simplify(variants.find((v) => v.type !== 'null')) as Json;
    delete n.anyOf;
    const merged: Json = { ...other, ...n, type: [other.type, 'null'] };
    if (Array.isArray(other.enum)) merged.enum = [...other.enum, null];
    return merged;
  }
  for (const key of ['minimum', 'maximum'] as const) {
    if (typeof n[key] === 'number' && Math.abs(n[key] as number) >= Number.MAX_SAFE_INTEGER) delete n[key];
  }
  for (const [k, v] of Object.entries(n)) {
    if (k !== 'enum' && v && typeof v === 'object') n[k] = simplify(v);
  }
  return n;
}

/* ------------------------- Provider Gemini ------------------------- */

const BLOCK_REASONS = new Set([
  'SAFETY',
  'RECITATION',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'IMAGE_SAFETY',
  'IMAGE_PROHIBITED_CONTENT',
]);

function checkFinish(res: GenerateContentResponse | undefined) {
  const blocked = res?.promptFeedback?.blockReason;
  if (blocked) throw new AiRefusalError(String(blocked));
  const reason = res?.candidates?.[0]?.finishReason;
  if (reason && BLOCK_REASONS.has(reason)) throw new AiRefusalError(reason);
  if (reason === 'MAX_TOKENS') throw new AiIncompleteError('MAX_TOKENS');
}

/** Teks jawaban (tanpa bagian "thought"). */
function answerText(res: GenerateContentResponse | undefined) {
  const parts = res?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => (p.text && !p.thought ? p.text : '')).join('');
}

const toParts = (parts: AiPart[]): Part[] =>
  parts.map((p) => (p.type === 'text' ? { text: p.text } : { inlineData: { mimeType: p.mimeType, data: p.base64 } }));

const TRANSIENT = new Set([429, 500, 502, 503, 504]);

/**
 * Batas tunggu per percobaan (server Gemini sesekali "menggantung"; lebih baik coba ulang cepat).
 * Isi otomatis (thinking rendah) 90 detik; analisis (thinking tinggi) 3 menit.
 */
const timeoutFor = (prompt: AiPrompt) => (prompt.thinking === 'high' ? 180_000 : 90_000);

class GeminiProvider implements AiProvider {
  private readonly client = new GoogleGenAI({ apiKey: apiKey(), httpOptions: { timeout: 5 * 60 * 1000 } });

  private request(prompt: AiPrompt, extra: Json = {}) {
    return {
      model: AI_MODEL,
      contents: [{ role: 'user', parts: toParts(prompt.parts) }],
      config: {
        systemInstruction: prompt.system,
        maxOutputTokens: prompt.maxTokens,
        thinkingConfig: { thinkingLevel: prompt.thinking === 'high' ? ThinkingLevel.HIGH : ThinkingLevel.LOW },
        // Resolusi tinggi agar tulisan kecil di poster tetap terbaca.
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
        ...extra,
      },
    };
  }

  async streamText(prompt: AiPrompt, cb: StreamCallbacks, signal: AbortSignal) {
    const stream = await this.client.models.generateContentStream(this.request(prompt, { abortSignal: signal }));
    let text = '';
    let last: GenerateContentResponse | undefined;
    for await (const chunk of stream) {
      last = chunk;
      const delta = answerText(chunk);
      if (delta) {
        text += delta;
        cb.onText(delta);
      }
    }
    checkFinish(last);
    if (!text.trim()) throw new AiIncompleteError('jawaban kosong');
    return { text: text.trim(), usage: usageFrom(AI_MODEL, last?.usageMetadata) };
  }

  async structured<T>(prompt: AiPrompt, schema: z.ZodType<T>) {
    const jsonSchema = toGeminiSchema(schema);
    // Beberapa model tidak bisa memakai skema yang dipaksakan (responseJsonSchema) dan macet sampai
    // timeout; untuk model itu skema dikirim sebagai instruksi di prompt (tetap divalidasi zod).
    let promptMode = !jsonSchemaSupported(AI_MODEL);
    let lastError: unknown;
    // Ulangi sekali bila server sibuk atau JSON tidak sesuai skema.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.client.models.generateContent(
          promptMode
            ? this.request(
                { ...prompt, system: `${prompt.system}\n\n${schemaInstruction(jsonSchema)}` },
                { responseMimeType: 'application/json', httpOptions: { timeout: timeoutFor(prompt) } },
              )
            : this.request(prompt, {
                responseMimeType: 'application/json',
                responseJsonSchema: jsonSchema,
                httpOptions: { timeout: timeoutFor(prompt) },
              }),
        );
        checkFinish(res);
        const usage = usageFrom(AI_MODEL, res.usageMetadata);
        let json: unknown;
        try {
          json = JSON.parse(stripFence(answerText(res)));
        } catch {
          throw new AiIncompleteError('JSON tidak valid');
        }
        const parsed = schema.safeParse(json);
        if (!parsed.success) throw new AiIncompleteError('JSON tidak sesuai skema');
        return { data: parsed.data, usage };
      } catch (err) {
        lastError = err;
        // 504 pada mode skema: kemungkinan model tidak mendukung skema → coba sekali lagi dengan mode prompt.
        if (!promptMode && err instanceof ApiError && err.status === 504) promptMode = true;
        // Batas tunggu habis di sisi klien (AbortError/timeout) juga dicoba ulang sekali.
        const timedOut = err instanceof Error && (err.name === 'AbortError' || /timed? ?out|aborted/i.test(err.message));
        const retry =
          err instanceof AiIncompleteError || timedOut || (err instanceof ApiError && TRANSIENT.has(err.status));
        if (!retry || attempt === 1) throw err;
        logger.warn({ err: err instanceof Error ? err.message : err, promptMode }, 'Gemini: mencoba ulang');
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    throw lastError;
  }
}

/**
 * Model yang diketahui macet (504) bila memakai responseJsonSchema. Bisa juga dipaksa lewat
 * env AI_JSON_SCHEMA=off.
 */
const NO_JSON_SCHEMA_MODELS = new Set(['gemini-3-flash-preview']);
function jsonSchemaSupported(model: string) {
  return process.env.AI_JSON_SCHEMA !== 'off' && !NO_JSON_SCHEMA_MODELS.has(model);
}

function schemaInstruction(jsonSchema: Json) {
  return `Output format
Respond with only one JSON object (no markdown, no code fences, no commentary) that is valid against this JSON Schema. Include every required property; use null where the schema allows it and the information is absent.
${JSON.stringify(jsonSchema)}`;
}

/** Buang pagar ```json … ``` bila model tetap menambahkannya. */
const stripFence = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
/* ---------------------------- Provider palsu ---------------------------- */

/** Untuk tes & E2E (AI_FAKE=1): tanpa jaringan, mencatat prompt terakhir. */
export class FakeAiProvider implements AiProvider {
  prompts: AiPrompt[] = [];
  mode: 'ok' | 'refusal' | 'error' = 'ok';
  coverLetter =
    'Jakarta, 14 Oktober 2026\n\nPerihal: Lamaran Pekerjaan\n\nDengan hormat,\n\nSaya tertarik melamar posisi yang dibuka. Pengalaman saya relevan dengan kebutuhan tim Anda.\n\nHormat saya,\n[Nama]';
  prep: unknown = null;

  private usage(): AiUsageInfo {
    return { model: 'fake', inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0, costMicroUsd: 8000 };
  }

  private check() {
    if (this.mode === 'refusal') throw new AiRefusalError('test');
    if (this.mode === 'error') throw new AiIncompleteError('test');
  }

  async streamText(prompt: AiPrompt, cb: StreamCallbacks, signal: AbortSignal) {
    this.prompts.push(prompt);
    this.check();
    for (const word of this.coverLetter.split(/(?<= )/)) {
      if (signal.aborted) throw new Error('aborted');
      cb.onText(word);
      await new Promise((r) => setTimeout(r, 2));
    }
    return { text: this.coverLetter, usage: this.usage() };
  }

  async structured<T>(prompt: AiPrompt, schema: z.ZodType<T>) {
    this.prompts.push(prompt);
    this.check();
    if (this.prep) return { data: schema.parse(this.prep), usage: this.usage() };
    // Tanpa contoh khusus: pakai sampel yang cocok dengan skema yang diminta.
    const hasImage = prompt.parts.some((p) => p.type === 'file' && p.mimeType.startsWith('image/'));
    for (const sample of [FAKE_PREP, FAKE_ATS, hasImage ? FAKE_POSTER : FAKE_EXTRACT, FAKE_PROFILE]) {
      const parsed = schema.safeParse(sample);
      if (parsed.success) return { data: parsed.data, usage: this.usage() };
    }
    throw new Error('Tidak ada sampel palsu untuk skema ini');
  }
}

const FAKE_PREP = {
  overview: 'Fokus pada pengalaman frontend dan kolaborasi tim.',
  questions: [
    {
      category: 'behavioral',
      question: 'Ceritakan proyek tersulit yang pernah Anda kerjakan.',
      whyAsked: 'Menilai cara Anda menghadapi tantangan.',
      pointsToHighlight: ['Peran Anda', 'Hasil terukur'],
      answerOutline: ['Situation', 'Task', 'Action', 'Result'],
      avoid: 'Menyalahkan rekan kerja.',
    },
    {
      category: 'technical',
      question: 'Bagaimana Anda mengoptimalkan performa aplikasi React?',
      whyAsked: 'Menguji pemahaman teknis inti.',
      pointsToHighlight: ['Memoization', 'Code splitting'],
      answerOutline: ['Ukur dulu', 'Optimasi', 'Validasi hasil'],
      avoid: 'Jawaban tanpa contoh nyata.',
    },
  ],
  questionsToAsk: ['Seperti apa 90 hari pertama di posisi ini?'],
  finalTips: ['Datang 10 menit lebih awal.'],
};

const FAKE_ATS = {
  score: 72,
  verdict: 'Cukup cocok',
  summary: 'Skill utama sesuai, beberapa kata kunci belum terlihat.',
  matchedKeywords: ['React', 'TypeScript'],
  missingKeywords: ['GraphQL'],
  requirements: [{ requirement: 'React', status: 'met', evidence: 'React 3 tahun', suggestion: 'Tambahkan angka dampak.' }],
  cvImprovements: ['Tambahkan metrik hasil kerja.'],
  nextSteps: ['Perbarui CV.'],
};

const FAKE_PROFILE = {
  headline: 'Frontend Developer',
  summary: 'Frontend developer dengan 3 tahun pengalaman membangun aplikasi web React.',
  skills: 'React, TypeScript, Next.js, Tailwind CSS',
  experience: 'Frontend Developer, PT Contoh Digital (2023–sekarang)\n- Membangun dashboard admin React',
  education: 'S1 Informatika, Universitas Contoh (2019–2023)',
  achievements: null,
  city: 'Bandung',
};

const FAKE_EXTRACT = {
  company: 'PT Contoh Otomatis',
  position: 'Frontend Engineer',
  location: 'Bandung',
  workType: 'remote',
  salaryMin: 9000000,
  salaryMax: 13000000,
  source: 'glints',
  jobDescription: 'Membangun aplikasi web React. Kualifikasi: 2 tahun pengalaman.',
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  deadline: null,
  applyInstructions: null,
  posterText: null,
};

const FAKE_POSTER = {
  ...FAKE_EXTRACT,
  company: 'PT Poster Sejahtera',
  position: 'Admin Gudang',
  location: 'Surabaya',
  workType: 'onsite',
  salaryMin: null,
  salaryMax: null,
  source: 'instagram',
  jobDescription: 'Kualifikasi:\n- Pria/Wanita maks. 30 tahun\n- Min. SMA/SMK\n- Teliti dan jujur',
  contactEmail: 'hrd@poster-sejahtera.co.id',
  contactPhone: '081234567890',
  deadline: '2026-10-31',
  applyInstructions: 'Kirim CV ke hrd@poster-sejahtera.co.id dengan subjek "Admin Gudang - Nama".',
  posterText: 'WE ARE HIRING\nPT Poster Sejahtera\nAdmin Gudang, Surabaya\nKirim CV ke hrd@poster-sejahtera.co.id paling lambat 31 Oktober 2026',
};

/* ------------------------------ Registry ------------------------------ */

let provider: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (provider) return provider;
  if (process.env.AI_FAKE === '1') {
    logger.warn('AI_FAKE=1: memakai provider AI palsu');
    provider = new FakeAiProvider();
  } else if (apiKey()) {
    provider = new GeminiProvider();
  } else {
    throw new AiNotConfiguredError('GEMINI_API_KEY belum diisi');
  }
  return provider;
}

/** Untuk tes: pasang provider tertentu. */
export function setAiProvider(p: AiProvider | null) {
  provider = p;
}

/* ------------------------- Status & tes koneksi ------------------------- */

export function aiStatus() {
  const fake = process.env.AI_FAKE === '1';
  return { configured: fake || !!apiKey(), fake, model: AI_MODEL };
}

/** Pesan ramah untuk error Gemini API yang umum. */
export function describeAiError(err: unknown): string {
  if (err instanceof AiNotConfiguredError) return 'GEMINI_API_KEY belum diisi di api/.env.';
  if (err instanceof AiRefusalError) return `Permintaan diblokir filter keamanan Gemini (${err.message}).`;
  if (err instanceof ApiError) {
    const msg = err.message ?? '';
    if (/api key not valid|API_KEY_INVALID/i.test(msg)) return 'API key tidak valid. Periksa GEMINI_API_KEY di api/.env.';
    if (/location is not supported/i.test(msg)) return 'Gemini API belum tersedia untuk lokasi server ini.';
    if (err.status === 401 || err.status === 403) return 'API key tidak punya akses. Pastikan Generative Language API aktif untuk project ini.';
    if (err.status === 404) return `Model "${AI_MODEL}" tidak ditemukan. Periksa AI_MODEL di api/.env.`;
    if (err.status === 429) {
      return 'Kuota/batas pemakaian Gemini tercapai. Pastikan billing (paid tier) aktif di Google AI Studio, lalu coba lagi.';
    }
    if (err.status >= 500) return 'Server Gemini sedang sibuk. Coba lagi beberapa saat lagi.';
    return `Error dari Gemini (${err.status}): ${msg}`;
  }
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return 'Tidak dapat terhubung ke generativelanguage.googleapis.com. Periksa koneksi internet.';
  }
  return err instanceof Error ? err.message : 'Kesalahan tidak diketahui';
}

/** Panggilan kecil untuk memastikan API key, billing, dan model berfungsi. */
export async function pingAi() {
  const { fake } = aiStatus();
  if (fake) return { model: 'fake', reply: 'OK (provider palsu)', latencyMs: 0 };
  if (!apiKey()) throw new AiNotConfiguredError('GEMINI_API_KEY belum diisi');
  const client = new GoogleGenAI({ apiKey: apiKey(), httpOptions: { timeout: 60_000 } });
  const started = Date.now();
  const res = await client.models.generateContent({
    model: AI_MODEL,
    contents: 'Balas hanya dengan satu kata: OK',
    config: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
  });
  return { model: res.modelVersion ?? AI_MODEL, reply: answerText(res).trim(), latencyMs: Date.now() - started };
}
