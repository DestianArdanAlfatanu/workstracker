import type { ApiErrorBody, PageMeta, User } from '@wt/shared';

const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

// Access token hanya disimpan di memori (bukan localStorage) untuk mengurangi risiko XSS.
let accessToken: string | null = null;
let refreshPromise: Promise<User | null> | null = null;
let onSessionExpired: (() => void) | null = null;
let onPasswordChangeRequired: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setSessionExpiredHandler(fn: (() => void) | null) {
  onSessionExpired = fn;
}

/** Dipanggil saat API meminta pengguna mengganti password default terlebih dahulu. */
export function setPasswordChangeRequiredHandler(fn: (() => void) | null) {
  onPasswordChangeRequired = fn;
}

interface SessionPayload {
  accessToken: string;
  user: User;
}

/** Ambil access token baru dari refresh cookie. Panggilan bersamaan digabung jadi satu. */
export function refreshSession(): Promise<User | null> {
  refreshPromise ??= (async () => {
    lastRefreshNetworkError = false;
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin' });
      if (!res.ok) {
        accessToken = null;
        return null;
      }
      const body = (await res.json()) as { data: SessionPayload };
      accessToken = body.data.accessToken;
      return body.data.user;
    } catch {
      accessToken = null;
      lastRefreshNetworkError = true;
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

let lastRefreshNetworkError = false;
/** true bila refresh terakhir gagal karena jaringan (bukan karena sesi tidak valid). */
export const refreshFailedOffline = () => lastRefreshNetworkError;

type QueryValue = string | number | undefined | null | string[];

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    params.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const qs = params.toString();
  return `${BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function send(path: string, opts: RequestOptions) {
  const headers: Record<string, string> = {};
  const isForm = opts.body instanceof FormData;
  if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    return await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      body: isForm ? (opts.body as FormData) : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.');
  }
}

export interface ApiResponse<T> {
  data: T;
  meta?: PageMeta;
}

/** Kirim request; jika access token kedaluwarsa, refresh sekali lalu ulangi. */
async function sendWithRefresh(path: string, opts: RequestOptions) {
  let res = await send(path, opts);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const user = await refreshSession();
    if (!user) {
      onSessionExpired?.();
      throw new ApiError(401, 'UNAUTHORIZED', 'Sesi berakhir, silakan login kembali');
    }
    res = await send(path, opts);
  }
  return res;
}

async function toApiError(res: Response) {
  const body = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
  const err = body?.error;
  if (err?.code === 'PASSWORD_CHANGE_REQUIRED') onPasswordChangeRequired?.();
  return new ApiError(res.status, err?.code ?? 'INTERNAL_ERROR', err?.message ?? 'Terjadi kesalahan, coba lagi nanti', err?.fields);
}

/** Unduh file (ekspor/CV) dengan header Authorization lalu simpan lewat browser. */
export async function downloadFile(path: string, query?: Record<string, QueryValue>, fallbackName = 'file') {
  const res = await sendWithRefresh(path, { query });
  if (!res.ok) throw await toApiError(res);
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plain = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
  const name = encoded ? decodeURIComponent(encoded) : (plain ?? fallbackName);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface StreamHandlers {
  onEvent: (event: string, data: unknown) => void;
  signal?: AbortSignal;
}

/**
 * POST JSON lalu baca respons Server-Sent Events (fetch + ReadableStream, karena EventSource
 * tidak bisa mengirim header Authorization). Error sebelum stream dibuka dilempar sebagai ApiError.
 */
export async function apiStream(path: string, body: unknown, { onEvent, signal }: StreamHandlers) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const doFetch = () =>
    fetch(buildUrl(path), {
      method: 'POST',
      headers: { ...headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      credentials: 'same-origin',
      body: JSON.stringify(body),
      signal,
    });

  let res: Response;
  try {
    res = await doFetch();
    if (res.status === 401) {
      const user = await refreshSession();
      if (!user) {
        onSessionExpired?.();
        throw new ApiError(401, 'UNAUTHORIZED', 'Sesi berakhir, silakan login kembali');
      }
      res = await doFetch();
    }
  } catch (e) {
    if (e instanceof ApiError || (e instanceof DOMException && e.name === 'AbortError')) throw e;
    throw new ApiError(0, 'NETWORK_ERROR', 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.');
  }
  if (!res.ok || !res.body || !res.headers.get('Content-Type')?.includes('text/event-stream')) {
    throw await toApiError(res);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const event = /^event: (.+)$/m.exec(chunk)?.[1] ?? 'message';
      const data = /^data: (.*)$/m.exec(chunk)?.[1];
      onEvent(event, data ? JSON.parse(data) : null);
    }
  }
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
  const res = await sendWithRefresh(path, opts);

  if (res.status === 204) return { data: undefined as T };
  if (!res.ok) throw await toApiError(res);

  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!body) throw new ApiError(res.status, 'INTERNAL_ERROR', 'Respons server tidak valid, coba lagi nanti');
  return body;
}

export const authApi = {
  /** Mulai demo instan: akun sementara berisi data contoh, tanpa daftar. */
  async startDemo() {
    const { data } = await api<SessionPayload>('/demo/start', { method: 'POST' });
    accessToken = data.accessToken;
    return data.user;
  },
  async login(input: { email: string; password: string }) {
    const { data } = await api<SessionPayload>('/auth/login', { method: 'POST', body: input });
    accessToken = data.accessToken;
    return data.user;
  },
  async forgotPassword(email: string) {
    const { data } = await api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: { email } });
    return data.message;
  },
  async checkResetToken(token: string) {
    const { data } = await api<{ valid: boolean }>('/auth/reset-password/check', { method: 'POST', body: { token } });
    return data.valid;
  },
  async resetPassword(input: { token: string; newPassword: string }) {
    await api('/auth/reset-password', { method: 'POST', body: input });
  },
  async logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      accessToken = null;
    }
  },
};
