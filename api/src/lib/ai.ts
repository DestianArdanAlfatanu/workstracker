import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type * as z from 'zod/v4';
import { logger } from './logger';

/**
 * Lapisan tipis di atas Anthropic SDK. Service AI hanya memakai interface `AiProvider`,
 * sehingga tes & E2E bisa memakai provider palsu tanpa memanggil API berbayar.
 */

export const AI_MODEL = process.env.AI_MODEL ?? 'claude-opus-5-5';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export type AiEffort = 'low' | 'medium' | 'high';

export interface AiPrompt {
  /** Blok system; blok terakhir yang stabil diberi cache_control oleh pemanggil. */
  system: Anthropic.Beta.BetaTextBlockParam[];
  content: Anthropic.Beta.BetaContentBlockParam[];
  effort: AiEffort;
  maxTokens: number;
}

export interface AiUsageInfo {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicroUsd: number;
}

/** Model menolak permintaan (stop_reason "refusal") walau fallback sudah dicoba. */
export class AiRefusalError extends Error {}
/** Jawaban terpotong / tidak lengkap. */
export class AiIncompleteError extends Error {}
/** AI belum dikonfigurasi (API key kosong). */
export class AiNotConfiguredError extends Error {}

export interface StreamCallbacks {
  onText: (delta: string) => void;
  /** Model fallback mengambil alih di tengah jalan: teks sebelumnya harus dibuang. */
  onReset: () => void;
}

export interface AiProvider {
  streamText(prompt: AiPrompt, cb: StreamCallbacks, signal: AbortSignal): Promise<{ text: string; usage: AiUsageInfo }>;
  structured<T>(prompt: AiPrompt, schema: z.ZodType<T>): Promise<{ data: T; usage: AiUsageInfo }>;
}

/* ----------------------------- Biaya ----------------------------- */

// USD per 1 juta token: input, output, cache read, cache write (5 menit).
const PRICES: Record<string, [number, number, number, number]> = {
  'claude-opus-5-5': [4, 20, 0.2, 5],
  'claude-opus-5': [5, 25, 0.5, 6.25],
  'claude-opus-4-8': [5, 25, 0.5, 6.25],
  'claude-sonnet-5-5': [2, 10, 0.2, 2.5],
  'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125],
};

/** token × harga per 1 juta token = mikro-USD. Model tak dikenal memakai harga Opus 5.5. */
export function usageFrom(model: string, u: Anthropic.Beta.BetaUsage): AiUsageInfo {
  const [pIn, pOut, pRead, pWrite] = PRICES[model] ?? PRICES['claude-opus-5-5'];
  const inputTokens = u.input_tokens ?? 0;
  const outputTokens = u.output_tokens ?? 0;
  const cacheReadTokens = u.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = u.cache_creation_input_tokens ?? 0;
  return {
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    costMicroUsd: Math.round(
      inputTokens * pIn + outputTokens * pOut + cacheReadTokens * pRead + cacheWriteTokens * pWrite,
    ),
  };
}

/* ------------------------- Provider Anthropic ------------------------- */

function textAfterLastFallback(content: Anthropic.Beta.BetaContentBlock[]) {
  let text = '';
  for (const block of content) {
    if (block.type === 'fallback') text = '';
    else if (block.type === 'text') text += block.text;
  }
  return text.trim();
}

function checkStop(msg: Anthropic.Beta.BetaMessage) {
  if (msg.stop_reason === 'refusal') throw new AiRefusalError(msg.stop_details?.category ?? 'refusal');
  if (msg.stop_reason === 'max_tokens') throw new AiIncompleteError('max_tokens');
}

class AnthropicProvider implements AiProvider {
  private readonly client = new Anthropic({ maxRetries: 2, timeout: 5 * 60 * 1000 });

  private baseParams(prompt: AiPrompt) {
    return {
      model: AI_MODEL,
      max_tokens: prompt.maxTokens,
      // Opus 5.5: thinking selalu aktif (adaptive); kedalaman diatur lewat effort.
      thinking: { type: 'adaptive' as const },
      system: prompt.system,
      messages: [{ role: 'user' as const, content: prompt.content }],
      betas: [FALLBACK_BETA],
      fallbacks: 'default' as const,
    };
  }

  async streamText(prompt: AiPrompt, cb: StreamCallbacks, signal: AbortSignal) {
    const stream = this.client.beta.messages.stream(
      { ...this.baseParams(prompt), output_config: { effort: prompt.effort } },
      { signal },
    );
    stream.on('streamEvent', (event) => {
      if (event.type === 'content_block_start' && event.content_block.type === 'fallback') cb.onReset();
    });
    stream.on('text', (delta) => cb.onText(delta));
    const msg = await stream.finalMessage();
    checkStop(msg);
    return { text: textAfterLastFallback(msg.content), usage: usageFrom(msg.model, msg.usage) };
  }

  async structured<T>(prompt: AiPrompt, schema: z.ZodType<T>) {
    const msg = await this.client.beta.messages.parse({
      ...this.baseParams(prompt),
      output_config: { effort: prompt.effort, format: betaZodOutputFormat(schema) },
    });
    checkStop(msg);
    if (msg.parsed_output == null) throw new AiIncompleteError('parsed_output kosong');
    return { data: msg.parsed_output as T, usage: usageFrom(msg.model, msg.usage) };
  }
}

/* ---------------------------- Provider palsu ---------------------------- */

/** Untuk tes & E2E (AI_FAKE=1): tanpa jaringan, mencatat prompt terakhir. */
export class FakeAiProvider implements AiProvider {
  prompts: AiPrompt[] = [];
  mode: 'ok' | 'refusal' = 'ok';
  coverLetter =
    'Jakarta, 14 Oktober 2026\n\nPerihal: Lamaran Pekerjaan\n\nDengan hormat,\n\nSaya tertarik melamar posisi yang dibuka. Pengalaman saya relevan dengan kebutuhan tim Anda.\n\nHormat saya,\n[Nama]';
  prep: unknown = null;

  private usage(): AiUsageInfo {
    return { model: 'fake', inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0, costMicroUsd: 14000 };
  }

  async streamText(prompt: AiPrompt, cb: StreamCallbacks, signal: AbortSignal) {
    this.prompts.push(prompt);
    if (this.mode === 'refusal') throw new AiRefusalError('test');
    for (const word of this.coverLetter.split(/(?<= )/)) {
      if (signal.aborted) throw new Error('aborted');
      cb.onText(word);
      await new Promise((r) => setTimeout(r, 2));
    }
    return { text: this.coverLetter, usage: this.usage() };
  }

  async structured<T>(prompt: AiPrompt, schema: z.ZodType<T>) {
    this.prompts.push(prompt);
    if (this.mode === 'refusal') throw new AiRefusalError('test');
    if (this.prep) return { data: schema.parse(this.prep), usage: this.usage() };
    // Tanpa contoh khusus: pakai sampel yang cocok dengan skema yang diminta.
    for (const sample of [FAKE_PREP, FAKE_ATS, FAKE_EXTRACT]) {
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
};

/* ------------------------------ Registry ------------------------------ */

let provider: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (provider) return provider;
  if (process.env.AI_FAKE === '1') {
    logger.warn('AI_FAKE=1 — memakai provider AI palsu');
    provider = new FakeAiProvider();
  } else if (process.env.ANTHROPIC_API_KEY) {
    provider = new AnthropicProvider();
  } else {
    throw new AiNotConfiguredError('ANTHROPIC_API_KEY belum diisi');
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
  return { configured: fake || !!process.env.ANTHROPIC_API_KEY, fake, model: AI_MODEL };
}

/** Pesan ramah untuk error API Anthropic yang umum. */
export function describeAiError(err: unknown): string {
  if (err instanceof AiNotConfiguredError) return 'ANTHROPIC_API_KEY belum diisi di api/.env.';
  if (err instanceof Anthropic.AuthenticationError) return 'API key tidak valid. Periksa ANTHROPIC_API_KEY di api/.env.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'API key tidak punya akses ke model ini.';
  if (err instanceof Anthropic.NotFoundError) return `Model "${AI_MODEL}" tidak ditemukan untuk akun ini. Periksa AI_MODEL.`;
  if (err instanceof Anthropic.RateLimitError) return 'Batas pemakaian API tercapai. Coba lagi beberapa saat lagi.';
  if (err instanceof Anthropic.APIConnectionError) return 'Tidak dapat terhubung ke api.anthropic.com. Periksa koneksi internet.';
  if (err instanceof Anthropic.BadRequestError && /credit|balance|billing/i.test(err.message)) {
    return 'Saldo kredit Anthropic tidak cukup. Isi kredit di console.anthropic.com → Billing.';
  }
  if (err instanceof Anthropic.APIError) return `Error dari Anthropic (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : 'Kesalahan tidak diketahui';
}

/** Panggilan kecil untuk memastikan API key, kredit, dan model berfungsi. */
export async function pingAi() {
  const { fake } = aiStatus();
  if (fake) return { model: 'fake', reply: 'OK (provider palsu)', latencyMs: 0 };
  if (!process.env.ANTHROPIC_API_KEY) throw new AiNotConfiguredError('ANTHROPIC_API_KEY belum diisi');
  const client = new Anthropic({ maxRetries: 0, timeout: 60_000 });
  const started = Date.now();
  const msg = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: 'Balas hanya dengan satu kata: OK' }],
  });
  const reply = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  return { model: msg.model, reply, latencyMs: Date.now() - started };
}
