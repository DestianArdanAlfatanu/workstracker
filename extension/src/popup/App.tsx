import {
  applicationCreateSchema,
  normalizeJobUrl,
  STATUS_LABELS,
  todayISO,
  WORK_TYPE_LABELS,
  WORK_TYPES,
  type ApplicationCreateInput,
  type CvDocument,
  type JobExtract,
  type Source,
  type Status as AppStatus,
  type User,
} from '@wt/shared';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, clearSession, getSession, WT_URL } from '../lib/api';
import { scrapePage, type ScrapeResult } from '../lib/scrape';

const ADMIN_WHATSAPP = '6287796747329';
const upgradeLink = (email?: string) =>
  `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(
    `Halo admin, saya ingin upgrade WorksTracker ke paket Standar agar bisa memakai Chrome Extension.${email ? ` Email akun: ${email}` : ''}`,
  )}`;

const SITE_LABEL: Record<ScrapeResult['site'], string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  jobstreet: 'Jobstreet',
  glints: 'Glints',
  kalibrr: 'Kalibrr',
  dealls: 'Dealls',
  kitalulus: 'KitaLulus',
  loker_id: 'Loker.id',
  indeed: 'Indeed',
  karirhub: 'Karirhub Kemnaker',
  other: 'situs ini',
};

type Status = 'wishlist' | 'applied';

interface FormState {
  company: string;
  position: string;
  status: Status;
  appliedAt: string;
  location: string;
  workType: string;
  salaryMin: string;
  salaryMax: string;
  jobDescription: string;
  notes: string;
}

type View =
  | { kind: 'loading' }
  | { kind: 'login' }
  | { kind: 'upgrade'; email?: string }
  | { kind: 'blocked'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'ready' }
  | { kind: 'saved'; status: Status; company: string };

const thousands = (v: string | number | null | undefined) =>
  v == null || v === '' ? '' : String(v).replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const openTab = (url: string) => void chrome.tabs.create({ url });

async function activeTab() {
  // Build uji otomatis: pop-up dibuka sebagai halaman biasa, tab tujuan diberikan lewat ?tab=<id>.
  const testTab = import.meta.env.VITE_E2E ? Number(new URLSearchParams(location.search).get('tab')) : 0;
  if (testTab) return chrome.tabs.get(testTab);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** Baca halaman aktif; halaman khusus Chrome (chrome://) tidak bisa dibaca → pakai judul & URL saja. */
async function readPage(tab: chrome.tabs.Tab): Promise<ScrapeResult> {
  const fallback: ScrapeResult = {
    site: 'other',
    url: tab.url ?? '',
    pageTitle: tab.title ?? '',
    company: null,
    position: null,
    location: null,
    workType: null,
    salaryMin: null,
    salaryMax: null,
    deadline: null,
    description: null,
    author: null,
    caption: null,
    pageText: '',
  };
  if (!tab.id || !/^https?:/.test(tab.url ?? '')) return fallback;
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrapePage });
    return (res?.result as ScrapeResult | undefined) ?? fallback;
  } catch {
    return fallback;
  }
}

function sourceOf(page: ScrapeResult): Source {
  if (page.site !== 'other') return page.site;
  return /^https?:/.test(page.url) ? 'company_site' : 'other';
}

function initialForm(page: ScrapeResult): FormState {
  return {
    company: page.company ?? '',
    position: page.position ?? '',
    status: 'wishlist',
    appliedAt: todayISO(),
    location: page.location ?? '',
    workType: page.workType ?? '',
    salaryMin: thousands(page.salaryMin),
    salaryMax: thousands(page.salaryMax),
    jobDescription: page.description ?? '',
    notes: page.site === 'instagram' && page.author ? `Sumber: post Instagram ${page.author}` : '',
  };
}

export function App() {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<ScrapeResult | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [nextAction, setNextAction] = useState<{ date: string; note: string } | null>(null);
  const [duplicate, setDuplicate] = useState<{ company: string; position: string; status: string } | null>(null);
  const [credits, setCredits] = useState<{ balance: number; unlimited: boolean } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'save' | 'ai' | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  /** null = daftar CV belum/gagal dimuat (server memakai CV utama). */
  const [cvs, setCvs] = useState<CvDocument[] | null>(null);
  const [cvId, setCvId] = useState('');

  const jobUrl = useMemo(() => (page ? normalizeJobUrl(page.url) : null), [page]);
  const isPremium = !!user && (user.plan === 'premium' || user.role === 'admin');

  const load = async () => {
    setView({ kind: 'loading' });
    setMessage(null);
    const tab = await activeTab();
    // Selalu cek ulang sesi website saat pop-up dibuka: logout/ganti akun di website langsung berlaku.
    const [sessionResult, scraped] = await Promise.all([getSession(true).then((s) => s, (e: unknown) => e), readPage(tab)]);
    setPage(scraped);
    setForm(initialForm(scraped));
    // Batas melamar dari halaman lowongan → agenda tindak lanjut (bila belum lewat).
    setNextAction(scraped.deadline && scraped.deadline >= todayISO() ? { date: scraped.deadline, note: 'Batas akhir melamar' } : null);
    if (sessionResult instanceof ApiError || sessionResult instanceof Error) {
      const e = sessionResult as ApiError;
      if (e.status === 401) setView({ kind: 'login' });
      else if (e.code === 'PLAN_REQUIRED') setView({ kind: 'upgrade' });
      else if (e.status === 403 || e.code === 'PASSWORD_CHANGE_REQUIRED') setView({ kind: 'blocked', message: e.message });
      else setView({ kind: 'error', message: e.message });
      return;
    }
    const session = sessionResult as Awaited<ReturnType<typeof getSession>>;
    setUser(session.user);
    setView({ kind: 'ready' });
    const url = normalizeJobUrl(scraped.url);
    if (url) api.lookup(url).then(setDuplicate, () => undefined);
    api.cvs().then(
      (list) => {
        const active = list.filter((c) => !c.archived);
        setCvs(active);
        setCvId(String(active.find((c) => c.isDefault)?.id ?? ''));
      },
      () => setCvs(null),
    );
    if (session.user.plan === 'premium' || session.user.role === 'admin') {
      api.aiUsage().then((u) => setCredits({ balance: u.balance, unlimited: u.unlimited }), () => undefined);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setErrors((e) => ({ ...e, [key]: '' }));
  };

  /** Isi dengan AI: Instagram → screenshot poster yang terlihat (+ caption); situs lain → teks lowongan. */
  const fillWithAi = async () => {
    if (!page || !form) return;
    setBusy('ai');
    setMessage(null);
    try {
      let image: Blob | undefined;
      let text: string | undefined;
      if (page.site === 'instagram') {
        const tab = await activeTab();
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 85 });
        image = await (await fetch(dataUrl)).blob();
        if (page.caption && page.caption.length >= 80) text = page.caption.slice(0, 20000);
      } else {
        text = (page.description ?? page.pageText).slice(0, 20000);
        if (text.length < 80) throw new ApiError(400, 'VALIDATION_ERROR', 'Teks lowongan di halaman ini terlalu sedikit untuk dibaca AI.');
      }
      const d: JobExtract = await api.extract({ text, image });
      setForm((f) =>
        f
          ? {
              ...f,
              company: d.company ?? f.company,
              position: d.position ?? f.position,
              location: d.location ?? f.location,
              workType: d.workType ?? f.workType,
              salaryMin: d.salaryMin != null ? thousands(d.salaryMin) : f.salaryMin,
              salaryMax: d.salaryMax != null ? thousands(d.salaryMax) : f.salaryMax,
              jobDescription: d.jobDescription ?? f.jobDescription,
              notes: [f.notes, d.applyInstructions && `Cara melamar: ${d.applyInstructions}`, d.contactPhone && `Kontak/WA: ${d.contactPhone}`]
                .filter(Boolean)
                .join('\n'),
            }
          : f,
      );
      if (d.deadline && d.deadline >= todayISO()) setNextAction({ date: d.deadline, note: 'Batas akhir melamar' });
      setMessage({
        tone: 'info',
        text: d.company || d.position ? 'Terisi oleh AI. Periksa kembali sebelum menyimpan.' : 'AI tidak menemukan info lowongan yang jelas di layar ini.',
      });
      api.aiUsage().then((u) => setCredits({ balance: u.balance, unlimited: u.unlimited }), () => undefined);
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'AI gagal membaca halaman.' });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!form || !page) return;
    const input: ApplicationCreateInput = {
      company: form.company,
      position: form.position,
      status: form.status,
      appliedAt: form.appliedAt,
      source: sourceOf(page),
      jobUrl: jobUrl ?? undefined,
      location: form.location || undefined,
      workType: (form.workType || undefined) as ApplicationCreateInput['workType'],
      salaryMin: form.salaryMin || undefined,
      salaryMax: form.salaryMax || undefined,
      jobDescription: form.jobDescription || undefined,
      notes: form.notes || undefined,
      nextActionDate: nextAction?.date,
      nextActionNote: nextAction?.note,
      ...(cvs ? { cvId: cvId ? Number(cvId) : null } : {}),
    } as ApplicationCreateInput;
    const parsed = applicationCreateSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
      setErrors(fieldErrors);
      return;
    }
    setBusy('save');
    setMessage(null);
    try {
      const app = await api.save(input);
      setView({ kind: 'saved', status: form.status, company: app.company });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await clearSession();
        setView({ kind: 'login' });
      } else setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Gagal menyimpan.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="popup">
      <header className="header">
        <img src="icons/icon-32.png" alt="" width={24} height={24} />
        <span className="brand">WorksTracker</span>
        {user && <span className="who">{user.name.split(' ')[0]}</span>}
      </header>

      {view.kind === 'loading' && <p className="center muted">Membaca halaman…</p>}

      {view.kind === 'login' && (
        <Panel title="Masuk dulu di WorksTracker" text="Extension memakai login dari website WorksTracker. Cukup masuk sekali di sana.">
          <button className="btn primary" onClick={() => openTab(`${WT_URL}/login`)}>
            Masuk di WorksTracker
          </button>
          <button className="btn ghost" onClick={() => void load()}>
            Saya sudah masuk, coba lagi
          </button>
        </Panel>
      )}

      {view.kind === 'upgrade' && (
        <Panel title="Chrome Extension ada di paket Standar" text="Simpan lowongan dari LinkedIn, Instagram, dan situs karier dengan satu klik. Upgrade cukup bayar selisih Rp 25.000.">
          <button className="btn primary" onClick={() => openTab(upgradeLink(user?.email))}>
            Upgrade via WhatsApp
          </button>
          <button className="btn ghost" onClick={() => openTab(WT_URL)}>
            Buka WorksTracker
          </button>
        </Panel>
      )}

      {view.kind === 'blocked' && (
        <Panel title="Belum bisa dipakai" text={view.message}>
          <button className="btn primary" onClick={() => openTab(WT_URL)}>
            Buka WorksTracker
          </button>
        </Panel>
      )}

      {view.kind === 'error' && (
        <Panel title="Tidak dapat terhubung" text={view.message}>
          <button className="btn primary" onClick={() => void load()}>
            Coba lagi
          </button>
        </Panel>
      )}

      {view.kind === 'saved' && (
        <Panel
          title="Lamaran tersimpan"
          text={`${view.company} masuk ke tahap ${view.status === 'wishlist' ? 'Wishlist' : 'Applied'}.`}
          success
        >
          <button className="btn primary" onClick={() => openTab(`${WT_URL}/applications`)}>
            Lihat di WorksTracker
          </button>
          <button className="btn ghost" onClick={() => window.close()}>
            Tutup
          </button>
        </Panel>
      )}

      {view.kind === 'ready' && form && page && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          noValidate
        >
          <p className="source">
            Dari <strong>{SITE_LABEL[page.site]}</strong>
            {page.author ? ` · ${page.author}` : ''}
          </p>

          {duplicate && (
            <div className="note warn">
              Lowongan ini sudah tersimpan: {duplicate.position} di {duplicate.company} ({STATUS_LABELS[duplicate.status as AppStatus] ?? duplicate.status}).{' '}
              <a href="#" onClick={() => openTab(`${WT_URL}/applications`)}>
                Lihat
              </a>
            </div>
          )}

          {isPremium ? (
            <div className="ai">
              <button type="button" className="btn ai-btn" disabled={busy !== null} onClick={() => void fillWithAi()}>
                {busy === 'ai' ? 'AI sedang membaca…' : page.site === 'instagram' ? 'Isi dari poster di layar (AI)' : 'Isi dengan AI'}
              </button>
              <span className="muted small">
                1 kredit{credits ? ` · ${credits.unlimited ? 'admin' : `sisa ${credits.balance}`}` : ''}
                {page.site === 'instagram' ? ' · geser ke slide berisi info dulu' : ''}
              </span>
            </div>
          ) : (
            page.site === 'instagram' && (
              <div className="note">Isi otomatis dari poster tersedia di paket Premium. Caption sudah dimasukkan ke deskripsi.</div>
            )
          )}

          {message && <div className={`note ${message.tone === 'error' ? 'error' : 'info'}`}>{message.text}</div>}

          <fieldset className="status" aria-label="Tahap lamaran">
            {(['wishlist', 'applied'] as const).map((s) => (
              <label key={s} className={form.status === s ? 'active' : ''}>
                <input type="radio" name="status" value={s} checked={form.status === s} onChange={() => set('status', s)} />
                {s === 'wishlist' ? 'Wishlist' : 'Applied'}
              </label>
            ))}
          </fieldset>

          <Field label="Perusahaan" required error={errors.company}>
            <input value={form.company} onChange={(e) => set('company', e.target.value)} placeholder={page.author ?? 'Nama perusahaan'} autoFocus={!form.company} />
          </Field>
          <Field label="Posisi" required error={errors.position}>
            <input value={form.position} onChange={(e) => set('position', e.target.value)} placeholder="mis. Frontend Engineer" />
          </Field>
          <div className="row">
            <Field label="Tanggal lamar" required error={errors.appliedAt}>
              <input type="date" max={todayISO()} value={form.appliedAt} onChange={(e) => set('appliedAt', e.target.value)} />
            </Field>
            <Field label="Tipe kerja" error={errors.workType}>
              <select value={form.workType} onChange={(e) => set('workType', e.target.value)}>
                <option value="">-</option>
                {WORK_TYPES.map((w) => (
                  <option key={w} value={w}>
                    {WORK_TYPE_LABELS[w]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Lokasi" error={errors.location}>
            <input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="mis. Jakarta Selatan" />
          </Field>
          <div className="row">
            <Field label="Gaji min (Rp)" error={errors.salaryMin}>
              <input inputMode="numeric" value={form.salaryMin} onChange={(e) => set('salaryMin', thousands(e.target.value))} />
            </Field>
            <Field label="Gaji maks (Rp)" error={errors.salaryMax}>
              <input inputMode="numeric" value={form.salaryMax} onChange={(e) => set('salaryMax', thousands(e.target.value))} />
            </Field>
          </div>
          {cvs && (
            <Field label="CV yang dipakai" error={errors.cvId}>
              {cvs.length ? (
                <select value={cvId} onChange={(e) => setCvId(e.target.value)}>
                  <option value="">Tanpa CV</option>
                  {cvs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                      {c.isDefault ? ' (utama)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="muted small">
                  Belum ada CV.{' '}
                  <a href="#" onClick={() => openTab(`${WT_URL}/cv`)}>
                    Unggah di CV Saya
                  </a>
                </p>
              )}
            </Field>
          )}
          <details>
            <summary>Deskripsi & catatan</summary>
            <Field label="Deskripsi lowongan" error={errors.jobDescription}>
              <textarea rows={5} value={form.jobDescription} onChange={(e) => set('jobDescription', e.target.value)} />
            </Field>
            <Field label="Catatan" error={errors.notes}>
              <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
            {nextAction && <p className="muted small">Agenda: {nextAction.note} ({nextAction.date})</p>}
          </details>
          {jobUrl && (
            <p className="muted small url" title={jobUrl}>
              Link: {jobUrl}
            </p>
          )}

          <button type="submit" className="btn primary" disabled={busy !== null}>
            {busy === 'save' ? 'Menyimpan…' : `Simpan ke ${form.status === 'wishlist' ? 'Wishlist' : 'Applied'}`}
          </button>
        </form>
      )}
    </div>
  );
}

function Panel({ title, text, success, children }: { title: string; text: string; success?: boolean; children: ReactNode }) {
  return (
    <div className="panel">
      <span className={`badge ${success ? 'ok' : ''}`} aria-hidden>
        {success ? '✓' : '!'}
      </span>
      <h1>{title}</h1>
      <p className="muted">{text}</p>
      <div className="actions">{children}</div>
    </div>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <label className={`field ${error ? 'invalid' : ''}`}>
      <span>
        {label}
        {required && <b aria-hidden> *</b>}
      </span>
      {children}
      {error && <em role="alert">{error}</em>}
    </label>
  );
}
