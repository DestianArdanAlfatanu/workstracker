import type { AiUsage, Application, ApplicationCreateInput, CvDocument, JobExtract, User } from '@wt/shared';

/** Alamat website WorksTracker (diatur saat build lewat VITE_WT_URL). */
export const WT_URL = (import.meta.env.VITE_WT_URL as string).replace(/\/$/, '');
const API = `${WT_URL}/api/v1`;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requiredPlan?: string,
  ) {
    super(message);
  }
}

interface Session {
  accessToken: string;
  user: User;
  /** Waktu kedaluwarsa (ms); token berlaku 15 menit, diperbarui 1 menit sebelum habis. */
  expiresAt: number;
}

const SESSION_KEY = 'wt-session';

async function cached(): Promise<Session | null> {
  try {
    const s = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] as Session | undefined;
    return s && s.expiresAt > Date.now() ? s : null;
  } catch {
    return null;
  }
}

async function toError(res: Response) {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; requiredPlan?: string } } | null;
  return new ApiError(
    res.status,
    body?.error?.code ?? 'INTERNAL_ERROR',
    body?.error?.message ?? `Permintaan gagal (${res.status})`,
    body?.error?.requiredPlan,
  );
}

/**
 * Sesi dari login website: cookie refresh WorksTracker ikut terkirim (extension punya izin
 * untuk domain WorksTracker), server menerbitkan access token singkat tanpa mengubah cookie.
 */
export async function getSession(force = false): Promise<Session> {
  if (!force) {
    const s = await cached();
    if (s) return s;
  }
  let res: Response;
  try {
    res = await fetch(`${API}/auth/extension-session`, { method: 'POST', credentials: 'include' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', `Tidak dapat terhubung ke ${WT_URL}. Pastikan WorksTracker bisa dibuka.`);
  }
  if (!res.ok) {
    await chrome.storage.session.remove(SESSION_KEY).catch(() => undefined);
    throw await toError(res);
  }
  const { data } = (await res.json()) as { data: { accessToken: string; user: User } };
  const session: Session = { ...data, expiresAt: Date.now() + 14 * 60_000 };
  await chrome.storage.session.set({ [SESSION_KEY]: session }).catch(() => undefined);
  return session;
}

export async function clearSession() {
  await chrome.storage.session.remove(SESSION_KEY).catch(() => undefined);
}

/** Panggil API dengan token sesi; bila token ditolak (401) ambil sesi baru sekali lalu ulangi. */
async function call<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const { accessToken } = await getSession(retried);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Koneksi terputus. Coba lagi.');
  }
  if (res.status === 401 && !retried) return call<T>(path, init, true);
  if (!res.ok) throw await toError(res);
  return ((await res.json()) as { data: T }).data;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  lookup: (url: string) =>
    call<{ id: number; company: string; position: string; status: string } | null>(
      `/applications/lookup?url=${encodeURIComponent(url)}`,
    ),
  save: (input: ApplicationCreateInput) => call<Application>('/applications', json(input)),
  aiUsage: () => call<AiUsage>('/me/ai-usage'),
  /** CV Saya (aktif + versi lama yang masih dipakai). */
  cvs: () => call<CvDocument[]>('/cvs'),
  /** Isi otomatis dengan AI: screenshot poster (gambar) dan/atau teks lowongan. */
  extract: (input: { text?: string; image?: Blob }) => {
    if (!input.image) return call<JobExtract>('/ai/extract-job', json({ text: input.text }));
    const form = new FormData();
    form.append('images', input.image, 'poster.jpg');
    if (input.text) form.append('text', input.text);
    return call<JobExtract>('/ai/extract-job', { method: 'POST', body: form });
  },
};
