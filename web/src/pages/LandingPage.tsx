import { AI_CREDIT_COST, PLAN_KEYS, PLANS, PREMIUM_CREDITS, TOPUPS, type Plan } from '@wt/shared';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { LogoMark } from '@/components/brand';
import { planHighlights } from '@/components/plan';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BUY_MESSAGE, buyPlanMessage, whatsappLink } from '@/lib/config';
import { formatRupiah } from '@/lib/format';
import { usePaymentConfig } from '@/lib/payments';
import { cn } from '@/lib/utils';
import './landing.css';

const POPULAR: Plan = 'standard';
const css = (v: Record<string, string | number>) => v as CSSProperties;

/* ------------------------------------------------------------------ */
/* Hook kecil untuk animasi                                            */
/* ------------------------------------------------------------------ */

/** Tambahkan kelas `is-in` ke setiap [data-reveal] di dalam `root` saat masuk layar. */
function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const targets = el.querySelectorAll<HTMLElement>('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      targets.forEach((t) => t.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [root]);
}

/** true sekali saat elemen pertama kali terlihat. */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (!('IntersectionObserver' in window)) return setSeen(true);
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setSeen(true), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Angka yang menghitung naik saat terlihat. */
function CountUp({ to, format = (n) => String(n), duration = 1200 }: { to: number; format?: (n: number) => string; duration?: number }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reducedMotion()) return setValue(to);
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setValue(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, to, duration]);
  return <span ref={ref}>{format(value)}</span>;
}

/** Judul yang muncul per kata. */
function Words({ text, start = 0 }: { text: string; start?: number }) {
  return (
    <>
      {text.split(' ').map((w, i) => (
        <span key={i} className="lp-word" style={css({ '--i': start + i })}>
          {w}
          {' '}
        </span>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Tombol                                                              */
/* ------------------------------------------------------------------ */

/** "Coba demo gratis": membuat akun demo sementara lalu masuk ke dashboard. */
function DemoButton({ className, small, label = 'Coba demo gratis' }: { className?: string; small?: boolean; label?: string }) {
  const { startDemo } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const start = async () => {
    setLoading(true);
    try {
      await startDemo();
      navigate('/', { replace: true });
      toast.success('Selamat datang di demo WorksTracker. Silakan coba semua fitur.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Gagal membuka demo, coba lagi');
    } finally {
      setLoading(false);
    }
  };
  return (
    <button type="button" onClick={() => void start()} disabled={loading} className={cn('lp-btn lp-btn-primary', small && 'lp-btn-sm', className)}>
      {loading ? 'Menyiapkan demo…' : label}
      {!small && !loading && <ArrowRight className="lp-arrow size-4" aria-hidden />}
    </button>
  );
}

/** Beli paket: halaman beli (Midtrans) bila pembayaran otomatis aktif, selain itu WhatsApp admin. */
function BuyLink({ plan, className, label }: { plan?: Plan; className: string; label?: string }) {
  const online = !!usePaymentConfig().data?.enabled;
  const name = plan ? PLANS[plan].name : '';
  if (online) {
    return (
      <Link to={plan ? `/beli/${plan}` : '/#harga'} className={className}>
        {label ?? (plan ? `Beli ${name}` : 'Beli sekarang')}
      </Link>
    );
  }
  return (
    <a href={whatsappLink(plan ? buyPlanMessage(plan) : BUY_MESSAGE)} target="_blank" rel="noopener noreferrer" className={className}>
      {label ?? (plan ? `Beli ${name} via WhatsApp` : 'Tanya admin via WhatsApp')}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Konten                                                              */
/* ------------------------------------------------------------------ */

const faq = (online: boolean) => [
  {
    q: 'Apakah ini langganan bulanan?',
    a: 'Bukan. Kamu bayar sekali dan bisa memakai paketmu seterusnya. Kalau nanti butuh fitur di paket yang lebih tinggi, cukup bayar selisih harganya.',
  },
  {
    q: 'Bagaimana cara membeli?',
    a: online
      ? 'Pilih paket, isi nama dan email, lalu bayar lewat QRIS, transfer bank, GoPay, atau ShopeePay. Begitu pembayaran diterima, link untuk membuat password langsung dikirim ke emailmu.'
      : 'Pilih paket, lalu chat admin lewat WhatsApp. Setelah pembayaran, admin membuatkan akun dan mengirim info login. Saat masuk pertama kali, kamu diminta mengganti password.',
  },
  {
    q: 'Bisa dicoba dulu sebelum beli?',
    a: 'Bisa. Tombol Coba demo gratis membuat akun sementara berisi data contoh dengan semua fitur Premium. Tidak perlu daftar, dan akunnya terhapus sendiri setelah 24 jam.',
  },
  {
    q: 'Lamaranku sudah tercatat di Excel. Harus diketik ulang?',
    a: 'Tidak perlu. Impor file Excel atau CSV, atau tempel langsung dari Google Sheets. Kolomnya dicocokkan otomatis dan kamu bisa cek dulu sebelum disimpan.',
  },
  {
    q: 'Kredit AI dipakai untuk apa saja?',
    a: `Isi otomatis dari poster atau teks dan isi Profil Karier dari CV memakai ${AI_CREDIT_COST.job_extract} kredit. Cover letter memakai ${AI_CREDIT_COST.cover_letter} kredit. Persiapan interview dan Cek CV masing-masing ${AI_CREDIT_COST.interview_prep} kredit. Kredit hanya dipotong kalau hasilnya berhasil dibuat, dan tidak hangus.`,
  },
  {
    q: 'Data apa yang dikirim ke AI?',
    a: 'Hanya yang dibutuhkan untuk aksi itu, dan hanya setelah kamu menyetujuinya. Email dan nomor HP-mu, kontak HR, gaji, serta lamaran lain tidak pernah dikirim. Gambar poster tidak disimpan di server.',
  },
  {
    q: 'Bisa dipakai di HP?',
    a: 'Bisa. WorksTracker bisa dipasang di layar utama HP seperti aplikasi. Di Android, loker dari LinkedIn atau Instagram bisa langsung disimpan lewat menu Bagikan. Chrome Extension khusus untuk Chrome di komputer.',
  },
];

const QUESTIONS = [
  {
    tag: 'Pertanyaan perilaku · 2 dari 12',
    q: '"Ceritakan saat kamu harus mengatur banyak pesanan marketplace sekaligus. Apa yang kamu lakukan?"',
    why: 'lowongan menyebut "teliti" dan "Shopee Seller". Pewawancara ingin melihat cara kamu memprioritaskan dan mencegah salah kirim.',
  },
  {
    tag: 'Pertanyaan teknis · 5 dari 12',
    q: '"Kalau stok di Tokopedia dan Shopee berbeda, data mana yang kamu percaya dulu?"',
    why: 'posisi ini memegang dua toko sekaligus. Mereka ingin tahu kamu teliti mencocokkan data sebelum bertindak.',
  },
  {
    tag: 'Pertanyaan motivasi · 9 dari 12',
    q: '"Kenapa tertarik bekerja di usaha kopi lokal seperti Kedai Seduh?"',
    why: 'usaha kecil mencari orang yang betah lama. Jawaban yang menyebut produk mereka terdengar lebih tulus.',
  },
];

/* ------------------------------------------------------------------ */
/* Halaman                                                             */
/* ------------------------------------------------------------------ */

export function LandingPage() {
  const root = useRef<HTMLDivElement>(null);
  const online = !!usePaymentConfig().data?.enabled;
  const [scrolled, setScrolled] = useState(false);
  useReveal(root);

  // Link dari halaman lain, mis. "/#harga" di halaman masuk: scroll ke bagiannya setelah halaman tampil.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 150);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    // overflow-x-clip: kartu miring di hero tidak boleh membuat scroll horizontal di HP.
    <div ref={root} className="lp min-h-dvh overflow-x-clip font-sans">
      <header className={cn('lp-header', scrolled && 'is-scrolled')}>
        <div className="mx-auto flex max-w-[1200px] flex-nowrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <a href="#" className="group flex shrink-0 items-center gap-2.5 text-[#0F172A] no-underline" aria-label="WorksTracker, ke atas">
            <LogoMark className="size-[34px] transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110" />
            <span className="text-[19px] font-extrabold tracking-[-0.035em]">WorksTracker</span>
          </a>
          <nav aria-label="Navigasi utama" className="hidden gap-7 text-[15px] font-semibold md:flex">
            <a href="#fitur" className="lp-link">Fitur</a>
            <a href="#harga" className="lp-link">Harga</a>
            <a href="#faq" className="lp-link">FAQ</a>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <Link to="/login" className="lp-btn lp-btn-sm bg-transparent text-[#0F172A] hover:bg-[#F1F5F9] hover:text-[#0F172A]">
              Masuk
            </Link>
            <DemoButton small className="max-md:hidden" />
          </div>
        </div>
      </header>

      <main>
        <Hero />
        <Facts />
        <AutoFill />
        <Features />
        <Pricing />
        <Faq online={online} />
        <FinalCta />
      </main>

      <footer className="border-t border-[#1E293B] bg-[#0F172A]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-7 text-sm text-[#94A3B8] sm:px-6">
          <span className="flex items-center gap-2.5 text-white">
            <LogoMark className="size-6" />
            <span className="font-extrabold tracking-[-0.035em]">WorksTracker</span>
          </span>
          <span>© {new Date().getFullYear()} WorksTracker</span>
          <span className="flex flex-wrap gap-x-5 gap-y-2">
            {[
              ['#fitur', 'Fitur'],
              ['#harga', 'Harga'],
              ['#faq', 'FAQ'],
            ].map(([href, label]) => (
              <a key={href} href={href} className="text-[#CBD5E1] no-underline transition-colors hover:text-white">
                {label}
              </a>
            ))}
            <Link to="/privasi" className="text-[#CBD5E1] no-underline transition-colors hover:text-white">
              Privasi
            </Link>
            <Link to="/login" className="text-[#CBD5E1] no-underline transition-colors hover:text-white">
              Masuk
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------ Hero ------------------------------ */

function Hero() {
  return (
    <section className="lp-sheet">
      <div aria-hidden className="lp-colhead flex h-[34px] overflow-hidden whitespace-nowrap border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#94A3B8]">
        {'ABCDEFGHIJKLMN'.split('').map((c) => (
          <span key={c} className="flex flex-[0_0_120px] items-center justify-center border-r border-[#E2E8F0]">
            {c}
          </span>
        ))}
      </div>
      <div aria-hidden className="lp-cursor" />

      <div className="relative mx-auto flex max-w-[1200px] flex-col items-center px-4 pt-16 text-center sm:px-6 sm:pt-[88px]">
        <h1 className="m-0 max-w-[980px] text-[clamp(2.6rem,6.4vw,5.6rem)] font-extrabold leading-[1.02] tracking-[-0.045em] text-[#0F172A]">
          <Words text="Lamaran boleh banyak." />
          <br className="max-sm:hidden" />
          <span className="lp-word" style={css({ '--i': 3 })}>
            Asal&nbsp;
          </span>
          <span className="lp-word" style={css({ '--i': 4 })}>
            tidak&nbsp;
          </span>
          <span className="lp-word" style={css({ '--i': 5 })}>
            ada&nbsp;
          </span>
          <span className="lp-word" style={css({ '--i': 6 })}>
            yang&nbsp;
          </span>
          <span className="lp-word" style={css({ '--i': 7 })}>
            <span className="lp-underline">terlewat.</span>
          </span>
        </h1>
        <p className="lp-fade-up mt-7 max-w-[680px] text-[17px] leading-relaxed text-[#475569] sm:text-[19px]" style={css({ '--d': '650ms' })}>
          Catat setiap lamaran dari LinkedIn, Jobstreet, sampai poster loker di Instagram. WorksTracker mengingatkan jadwal
          interview dan follow-up, jadi kamu cukup fokus menyiapkan diri.
        </p>
        <div className="lp-fade-up mt-9 flex flex-wrap justify-center gap-3" style={css({ '--d': '800ms' })}>
          <DemoButton />
          <a href="#harga" className="lp-btn lp-btn-ghost">
            Lihat harga
          </a>
        </div>
        <p className="lp-fade-up mt-4 text-sm text-[#64748B]" style={css({ '--d': '900ms' })}>
          Tanpa daftar. Akun demo berisi data contoh dan berlaku 24 jam.
        </p>

        <div className="lp-fan mt-16 w-full pb-24 sm:mt-[72px]">
          <figure className="lp-fan-card lp-fan-l m-0 w-[300px] max-w-full flex-none text-left" style={css({ '--d': '1000ms' })}>
            <div className="lp-float" style={css({ '--fd': '0.4s' })}>
              <div className="lp-fan-body rounded-[20px] border border-[#E2E8F0] bg-white p-3 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.35)]">
                <div className="flex items-center gap-2 px-1 pb-2.5 pt-0.5">
                  <span aria-hidden className="size-[26px] rounded-full border border-[#E2E8F0] bg-[linear-gradient(135deg,#F1F5F9,#DBEAFE)]" />
                  <span className="text-[13px] font-bold">contoh.loker</span>
                  <span className="ml-auto text-xs text-[#64748B]">Instagram</span>
                </div>
                <div className="flex flex-col gap-1.5 rounded-xl bg-[#0F172A] px-[18px] pb-5 pt-[22px] text-white">
                  <span className="text-[11px] font-bold tracking-[0.08em] text-[#93C5FD]">KAMI MEMBUKA LOWONGAN</span>
                  <span className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]">Admin Marketplace</span>
                  <span className="text-[13px] text-[#CBD5E1]">Kedai Seduh Nusantara · Purwokerto</span>
                  <span className="mt-3.5 self-start rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-[#0F172A]">Kirim CV sebelum 10 Okt</span>
                </div>
                <p className="mx-1 mb-0.5 mt-2.5 text-[13px] leading-normal text-[#334155]">
                  Lowongan Admin Marketplace, penempatan Purwokerto. Kirim CV via WA ke nomor di poster.
                </p>
              </div>
            </div>
            <figcaption className="mt-3.5 text-center text-sm font-bold text-[#475569]">Ketemu loker di Instagram</figcaption>
          </figure>

          <figure className="lp-fan-card relative z-[1] m-0 w-[360px] max-w-full flex-none text-left" style={css({ '--d': '850ms' })}>
            <div className="lp-float" style={css({ '--fd': '0s' })}>
              <div className="lp-fan-body rounded-[22px] border border-[#CBD5E1] bg-white p-5 shadow-[0_30px_60px_-28px_rgba(15,23,42,0.45)]">
                <div className="flex items-center gap-2">
                  <LogoMark className="size-5" />
                  <span className="text-xs font-bold text-[#64748B]">Lamaran</span>
                </div>
                <p className="mb-0 mt-3.5 text-sm font-semibold text-[#64748B]">Kedai Seduh Nusantara</p>
                <p className="mt-0.5 text-2xl font-extrabold tracking-[-0.02em]">Admin Marketplace</p>
                <div className="mt-3.5 flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-3 py-1 text-[13px] font-bold text-[#92400E]">
                    <span aria-hidden className="lp-pulse size-[7px] rounded-full bg-[#F59E0B]" />
                    Interview
                  </span>
                  <span role="img" aria-label="Sampai tahap Interview" className="flex gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className={cn('lp-seg', i < 3 && 'is-on')} style={css({ '--i': i })} />
                    ))}
                  </span>
                </div>
                <div className="mt-[18px] flex items-center gap-3 rounded-[14px] border border-[#BFDBFE] bg-[#EFF6FF] px-3.5 py-3">
                  <span className="flex size-11 flex-none flex-col items-center justify-center rounded-[10px] border border-[#BFDBFE] bg-white leading-none">
                    <span className="text-[11px] font-semibold text-[#475569]">Okt</span>
                    <span className="text-lg font-extrabold">22</span>
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-bold">Interview user</span>
                    <span className="text-[13px] text-[#475569]">Kamis, 10.00 WIB · Google Meet</span>
                  </span>
                </div>
                <div className="mt-3.5 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[13px]">
                  <span className="text-[#64748B]">Sumber</span>
                  <span className="font-semibold">Instagram</span>
                  <span className="text-[#64748B]">CV dipakai</span>
                  <span className="font-semibold">CV_Rina_Admin.pdf</span>
                  <span className="text-[#64748B]">Dilamar</span>
                  <span className="font-semibold">8 Okt 2026</span>
                </div>
              </div>
            </div>
            <figcaption className="mt-3.5 text-center text-sm font-bold text-[#475569]">Tercatat rapi di WorksTracker</figcaption>
          </figure>

          <figure className="lp-fan-card lp-fan-r m-0 w-[300px] max-w-full flex-none text-left" style={css({ '--d': '1150ms' })}>
            <div className="lp-float" style={css({ '--fd': '1.1s' })}>
              <div className="lp-fan-body rounded-[20px] border border-[#E2E8F0] bg-white p-[18px] shadow-[0_20px_40px_-24px_rgba(15,23,42,0.35)]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#64748B]">Email masuk</span>
                  <span className="text-xs text-[#64748B]">09.12</span>
                </div>
                <p className="mb-0 mt-3 text-[13px] text-[#475569]">HRD Kedai Seduh Nusantara</p>
                <p className="mt-0.5 text-[17px] font-extrabold tracking-[-0.01em]">Undangan Interview User</p>
                <p className="mt-2.5 text-[13px] leading-[1.55] text-[#334155]">
                  Halo Rina, selamat, kamu lolos ke tahap interview user. Jadwalnya Kamis, 22 Oktober 2026 pukul 10.00 WIB. Link
                  Google Meet kami kirim sehari sebelumnya.
                </p>
                <span className="mt-3.5 inline-flex h-[34px] items-center rounded-[9px] bg-[#0F172A] px-3 text-[13px] font-bold text-white transition-colors hover:bg-[#1D4ED8]">
                  Ubah status ke Interview
                </span>
              </div>
            </div>
            <figcaption className="mt-3.5 text-center text-sm font-bold text-[#475569]">Kabar baik datang, jadwal siap</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Fakta ------------------------------ */

function Facts() {
  const items: Array<{ value: ReactNode; text: string }> = [
    { value: <><CountUp to={9} /> situs loker</>, text: 'bisa disimpan dengan satu klik lewat Chrome Extension.' },
    {
      value: <><CountUp to={7} format={(n) => `${String(n).padStart(2, '0')}.00`} /> WIB</>,
      text: 'email pengingat berisi jadwal dan tugas hari itu.',
    },
    { value: <><CountUp to={5} /> CV</>, text: 'tersimpan, tinggal pilih yang dipakai di tiap lamaran.' },
    { value: 'Sekali bayar', text: 'akses seumur hidup, tanpa tagihan bulanan.' },
  ];
  return (
    <section aria-label="Fakta produk" className="border-y border-[#E2E8F0] bg-white">
      <div className="mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
        {items.map((it, i) => (
          <div
            key={it.text}
            data-reveal
            style={css({ '--d': `${i * 90}ms` })}
            className={cn('lp-stat px-6 py-8', i < items.length - 1 && 'border-[#E2E8F0] min-[480px]:border-r max-[480px]:border-b')}
          >
            <p className="m-0 text-4xl font-extrabold tracking-[-0.03em] tabular-nums">{it.value}</p>
            <p className="mt-1.5 text-[15px] leading-normal text-[#475569]">{it.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* --------------------------- Isi otomatis --------------------------- */

interface FieldDef {
  label: string;
  value: string;
}

const WEB_FIELDS: FieldDef[] = [
  { label: 'Perusahaan', value: 'Lumbung Data Nusantara' },
  { label: 'Posisi', value: 'Frontend Developer' },
  { label: 'Lokasi', value: 'Jakarta Selatan' },
  { label: 'Tipe kerja', value: 'Hybrid' },
  { label: 'Gaji per bulan', value: 'Rp 9.000.000 sampai 13.000.000' },
  { label: 'Batas melamar', value: '30 Okt 2026' },
];
const IG_FIELDS: FieldDef[] = [
  { label: 'Perusahaan', value: 'Kedai Seduh Nusantara' },
  { label: 'Posisi', value: 'Admin Marketplace' },
  { label: 'Lokasi', value: 'Purwokerto' },
  { label: 'Batas melamar', value: '10 Okt 2026' },
  { label: 'Cara melamar', value: 'Kirim CV via WhatsApp' },
  { label: 'Kontak WA', value: '0812-xxxx-xxxx' },
];

/** Form yang terisi sendiri, kolom demi kolom, seperti diketik. */
function FillingForm({ fields, run }: { fields: FieldDef[]; run: boolean }) {
  const [step, setStep] = useState({ field: -1, chars: 0 });
  useEffect(() => {
    if (!run) return;
    if (reducedMotion()) return setStep({ field: fields.length, chars: 0 });
    setStep({ field: 0, chars: 0 });
    let field = 0;
    let chars = 0;
    const timer = window.setInterval(() => {
      const target = fields[field]?.value ?? '';
      chars += Math.max(1, Math.ceil(target.length / 14));
      if (chars >= target.length) {
        field += 1;
        chars = 0;
        if (field >= fields.length) window.clearInterval(timer);
      }
      setStep({ field, chars });
    }, 45);
    return () => window.clearInterval(timer);
  }, [run, fields]);

  return (
    <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
      {fields.map((f, i) => {
        const done = i < step.field;
        const typing = i === step.field;
        const shown = done ? f.value : typing ? f.value.slice(0, step.chars) : '';
        return (
          <div key={f.label} className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#334155]">
            {f.label}
            <span className={cn('lp-field', typing && 'is-filling')} aria-label={`${f.label}: ${f.value}`}>
              <span aria-hidden>{shown}</span>
              {typing && <span aria-hidden className="lp-caret" />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AutoFill() {
  const [tab, setTab] = useState<'web' | 'ig'>('web');
  const [ref, seen] = useInView<HTMLDivElement>();
  const tabsRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState({ left: 4, width: 0 });

  useEffect(() => {
    const btn = tabsRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`);
    if (btn) setInd({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [tab]);

  return (
    <section className="mx-auto max-w-[1200px] px-4 pt-20 sm:px-6 sm:pt-28">
      <div className="max-w-[760px]" data-reveal>
        <h2 className="m-0 text-[clamp(2rem,4vw,3.2rem)] font-extrabold leading-[1.08] tracking-[-0.035em]">
          Tidak perlu mengetik ulang isi lowongan.
        </h2>
        <p className="mt-[18px] text-lg leading-relaxed text-[#475569]">
          Buka lowongan di situs loker, atau tempel caption Instagram. Perusahaan, posisi, lokasi, gaji, dan batas melamar terisi
          sendiri. Kamu tinggal cek, lalu simpan.
        </p>
      </div>

      <div ref={tabsRef} role="tablist" aria-label="Contoh sumber lowongan" className="lp-tabs mt-9" data-reveal style={css({ '--d': '100ms' })}>
        <span aria-hidden className="lp-tab-ind" style={{ left: ind.left, width: ind.width }} />
        <button type="button" role="tab" data-tab="web" aria-selected={tab === 'web'} onClick={() => setTab('web')} className="lp-tab">
          Dari situs loker
        </button>
        <button type="button" role="tab" data-tab="ig" aria-selected={tab === 'ig'} onClick={() => setTab('ig')} className="lp-tab">
          Dari caption Instagram
        </button>
      </div>

      <div ref={ref} key={tab} className="lp-panel mt-5 grid gap-6 md:grid-cols-2">
        {tab === 'web' ? (
          <div className="lp-card overflow-hidden p-0" style={{ gap: 0 }}>
            <div className="flex items-center gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
              <span aria-hidden className="flex gap-1.5">
                {['#F87171', '#FBBF24', '#34D399'].map((c) => (
                  <span key={c} className="size-2.5 rounded-full" style={{ background: c }} />
                ))}
              </span>
              <span className="flex-1 truncate rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-[13px] text-[#64748B]">
                Halaman lowongan di situs loker
              </span>
              <span className="lp-save-pop inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-2.5 text-[13px] font-bold text-white">
                <svg width="14" height="14" viewBox="0 0 64 64" aria-hidden>
                  <path d="M14 24.5 L22.5 45.5 L31.5 30.5 L40.5 45.5 L51 18.5" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Simpan
              </span>
            </div>
            <div className="p-6">
              <p className="m-0 text-[26px] font-extrabold tracking-[-0.02em]">Frontend Developer</p>
              <p className="mt-1.5 text-[15px] font-semibold text-[#334155]">Lumbung Data Nusantara</p>
              <p className="mt-1 text-sm text-[#64748B]">Jakarta Selatan · Hybrid · Rp 9 juta sampai Rp 13 juta per bulan</p>
              <p className="mt-[18px] text-sm font-bold">Kualifikasi</p>
              <ul className="mt-2 pl-5 text-sm leading-[1.7] text-[#334155]" style={{ listStyle: 'disc' }}>
                <li>Pengalaman 1 sampai 3 tahun dengan React dan TypeScript</li>
                <li>Terbiasa bekerja dengan REST API dan Git</li>
                <li>Bisa menulis unit test</li>
              </ul>
              <p className="mt-4 text-sm text-[#64748B]">Lamar sebelum 30 Oktober 2026</p>
            </div>
          </div>
        ) : (
          <div className="lp-card">
            <p className="m-0 text-[13px] font-bold text-[#64748B]">Caption yang ditempel</p>
            <p className="m-0 whitespace-pre-line text-base leading-[1.7] text-[#0F172A]">
              {`[LOKER PURWOKERTO]
Kedai Seduh Nusantara membuka lowongan Admin Marketplace.

Syarat: minimal SMA/SMK, teliti, terbiasa dengan Shopee dan Tokopedia Seller.
Kirim CV via WhatsApp ke 0812-xxxx-xxxx, paling lambat 10 Oktober 2026.

#lokerpurwokerto #lokerbanyumas`}
            </p>
          </div>
        )}

        <div className="lp-card border-[#CBD5E1]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-[17px] font-extrabold">Lamaran baru</p>
            <span className="lp-badge">{tab === 'web' ? 'Chrome Extension · paket Standar' : 'Isi otomatis AI · 1 kredit · paket Premium'}</span>
          </div>
          <FillingForm fields={tab === 'web' ? WEB_FIELDS : IG_FIELDS} run={seen} />
          <p className="m-0 text-[13px] leading-normal text-[#475569]">
            {tab === 'web'
              ? 'Deskripsi lowongan ikut tersimpan. Batas melamar otomatis masuk kalender sebagai agenda.'
              : 'Bisa juga dari foto poster, hingga 4 gambar sekaligus. Gambar poster tidak disimpan di server.'}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Fitur ------------------------------ */

function Badge({ plan }: { plan: Plan }) {
  return <span className={cn('lp-badge', plan === 'premium' && 'lp-badge-premium')}>{PLANS[plan].name}</span>;
}

function CardHead({ title, text, plan, dark }: { title: string; text: string; plan: Plan; dark?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="m-0 text-xl font-extrabold tracking-[-0.01em]">{title}</h3>
        <p className={cn('mt-1.5 text-[15px] leading-normal', dark ? 'text-[#CBD5E1]' : 'text-[#475569]')}>{text}</p>
      </div>
      {dark ? <span className="lp-badge bg-[#1E293B] text-[#BFDBFE]">{PLANS[plan].name}</span> : <Badge plan={plan} />}
    </div>
  );
}

const BOARD = [
  { title: 'Dilamar · 3', color: '#1E40AF', cards: [['Lumbung Data', 'Frontend Developer'], ['Rantai Logistik', 'Admin Gudang'], ['Bank Pesisir', 'Customer Service']] },
  { title: 'Screening · 2', color: '#5B21B6', cards: [['Pasar Tani', 'Social Media Staff'], ['Klinik Sehat Kita', 'Admin']] },
  { title: 'Interview · 1', color: '#92400E', cards: [['Kedai Seduh Nusantara', 'Admin Marketplace']] },
  { title: 'Offer · 1', color: '#115E59', cards: [['Toko Buku Pena', 'Staff Admin']] },
];

function InterviewCard() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return;
    const t = window.setInterval(() => setI((v) => (v + 1) % QUESTIONS.length), 5000);
    return () => window.clearInterval(t);
  }, []);
  const q = QUESTIONS[i]!;
  return (
    <article className="lp-card lp-card-dark lp-span2" data-reveal style={css({ '--d': '60ms' })}>
      <CardHead dark plan="premium" title="Persiapan interview dan cover letter" text="Disusun dari Profil Karier dan deskripsi lowongan, bukan template umum." />
      <div className="rounded-[14px] bg-[#1E293B] p-[18px]">
        <div key={i} className="lp-q">
          <p className="m-0 text-xs font-bold text-[#93C5FD]">{q.tag}</p>
          <p className="mt-2 text-lg font-bold leading-[1.4]">{q.q}</p>
          <p className="mt-3 text-sm leading-relaxed text-[#CBD5E1]">
            <span className="font-bold text-white">Kenapa ditanyakan:</span> {q.why}
          </p>
        </div>
        <div className="mt-3.5 flex items-center justify-between gap-3">
          <span className="inline-flex h-[34px] items-center rounded-[9px] bg-white px-3 text-[13px] font-bold text-[#0F172A] transition-transform hover:-translate-y-0.5">
            Jadikan tugas latihan
          </span>
          <span className="flex gap-1.5" aria-hidden>
            {QUESTIONS.map((_, k) => (
              <span key={k} className={cn('h-1.5 rounded-full transition-all duration-500', k === i ? 'w-6 bg-[#93C5FD]' : 'w-1.5 bg-[#475569]')} />
            ))}
          </span>
        </div>
      </div>
    </article>
  );
}

function ProgressCard() {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const onMove = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -14, y: ((e.clientX - r.left) / r.width - 0.5) * 14 });
  };
  return (
    <article className="lp-card" data-reveal style={css({ '--d': '120ms' })} onMouseMove={onMove} onMouseLeave={() => setTilt({ x: 0, y: 0 })}>
      <CardHead plan="standard" title="Kartu progres" text="Bagikan perjalananmu ke Instagram atau LinkedIn." />
      <div style={{ perspective: 600 }} className="self-center">
        <div
          className="lp-tilt box-border flex aspect-[4/5] w-[180px] flex-col justify-between rounded-[14px] bg-[#1D4ED8] p-4 text-white"
          style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
        >
          <span className="text-xs font-bold text-[#DBEAFE]">Oktober 2026</span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[34px] font-extrabold leading-none">
              <CountUp to={24} />
            </span>
            <span className="text-xs font-semibold">lamaran dikirim</span>
            <span className="mt-2 text-[13px] font-bold">6 interview · 1 offer</span>
          </span>
          <span className="text-[11px] font-bold text-[#DBEAFE]">WorksTracker</span>
        </div>
      </div>
    </article>
  );
}

function Features() {
  return (
    <section id="fitur" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 pt-20 sm:px-6 sm:pt-28">
      <div className="max-w-[760px]" data-reveal>
        <h2 className="m-0 text-[clamp(2rem,4vw,3.2rem)] font-extrabold leading-[1.08] tracking-[-0.035em]">Dari loker pertama sampai offer di tangan.</h2>
        <p className="mt-[18px] text-lg leading-relaxed text-[#475569]">
          Setiap fitur di bawah ini ada di aplikasinya sekarang. Label kecil di pojok menunjukkan paket yang dibutuhkan.
        </p>
      </div>

      <div className="lp-bento mt-10">
        <article className="lp-card lp-span2" data-reveal>
          <CardHead plan="basic" title="Board per tahap" text="Geser kartu saat ada kabar. Riwayat status tercatat otomatis." />
          <div className="grid grid-cols-[repeat(4,minmax(130px,1fr))] gap-2.5 overflow-x-auto pb-1 pt-2">
            {BOARD.map((col, ci) => (
              <div key={col.title} className="flex flex-col gap-2 rounded-xl bg-[#F8FAFC] p-2.5">
                <p className="m-0 text-xs font-bold" style={{ color: col.color }}>
                  {col.title}
                </p>
                {col.cards.map(([c, p], k) => {
                  const moving = ci === 1 && k === 1;
                  return (
                    <div
                      key={c}
                      className={cn('lp-kcard', moving && 'lp-kcard-move relative z-[1]', ci === 2 && 'border-[#FDE68A]', ci === 3 && 'border-[#99F6E4]')}
                    >
                      <p className="m-0 text-[13px] font-bold">{c}</p>
                      <p className="mt-0.5 text-xs text-[#64748B]">{p}</p>
                      {ci === 2 && <p className="mt-1.5 text-[11px] font-bold text-[#92400E]">Kamis 10.00</p>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </article>

        <article className="lp-card" data-reveal style={css({ '--d': '80ms' })}>
          <CardHead plan="standard" title="Pengingat jam 07.00" text="Satu email setiap pagi, hanya kalau ada yang perlu dikerjakan." />
          <div className="rounded-[14px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-[13px]">
            <p className="m-0 text-sm font-extrabold">Agenda hari ini</p>
            {[
              ['Interview user, Kedai Seduh', '10.00', ''],
              ['Follow-up Lumbung Data', 'Terlewat 2 hari', 'text-[#B91C1C]'],
              ['Kirim portofolio ke Pasar Tani', 'Hari ini', ''],
            ].map(([t, v, cls], k) => (
              <p key={t} className="lp-row mb-0 mt-2 flex justify-between gap-2 rounded-lg border border-transparent px-1.5 py-1" style={css({ '--d': `${k * 120}ms` })}>
                <span>{t}</span>
                <span className={cn('font-bold', cls)}>{v}</span>
              </p>
            ))}
          </div>
        </article>

        <article className="lp-card" data-reveal>
          <CardHead plan="standard" title="Kanal mana yang membalas" text="Response rate per sumber, dari data lamaranmu sendiri." />
          <div className="flex flex-col gap-2.5 text-[13px]">
            {[
              ['LinkedIn', 62, '31%'],
              ['Jobstreet', 44, '22%'],
              ['Instagram', 24, '12%'],
            ].map(([k, w, v], i) => (
              <div key={k} className="grid grid-cols-[82px_1fr_40px] items-center gap-2.5">
                <span>{k}</span>
                <span className="h-2.5 rounded-full bg-[#E2E8F0]">
                  <span className="lp-bar" style={css({ '--w': `${w}%`, '--d': `${200 + i * 150}ms` })} />
                </span>
                <span className="text-right font-bold">{v}</span>
              </div>
            ))}
            <p className="mb-0 mt-1 text-[#64748B]">Contoh data. 4 lamaran belum ada kabar lebih dari 14 hari.</p>
          </div>
        </article>

        <article className="lp-card" data-reveal style={css({ '--d': '80ms' })}>
          <CardHead plan="standard" title="CV Saya" text="Simpan sekali, pilih per lamaran. CV lama yang pernah dikirim tetap tersimpan." />
          <div className="flex flex-col gap-2 text-[13px]">
            <div className="lp-row flex items-center justify-between gap-2 rounded-[10px] border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2.5">
              <span className="font-bold">CV_Rina_Admin.pdf</span>
              <span className="text-[11px] font-extrabold text-[#1E40AF]">UTAMA</span>
            </div>
            {[
              ['CV_Rina_Marketing.pdf', 'dipakai 4x'],
              ['CV_Rina_EN.docx', 'dipakai 2x'],
            ].map(([n, u]) => (
              <div key={n} className="lp-row flex items-center justify-between gap-2 rounded-[10px] border border-[#E2E8F0] px-3 py-2.5">
                <span className="font-semibold">{n}</span>
                <span className="text-[#64748B]">{u}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="lp-card" data-reveal style={css({ '--d': '160ms' })}>
          <CardHead plan="premium" title="Cek CV" text="Seberapa cocok CV-mu dengan lowongan, dan kata kunci apa yang belum ada." />
          <div className="flex items-center gap-4">
            <div className="relative size-[76px] flex-none">
              <svg viewBox="0 0 76 76" className="lp-ring size-[76px] -rotate-90" style={css({ '--p': 0.78 })} aria-hidden>
                <circle cx="38" cy="38" r="32" fill="none" stroke="#E2E8F0" strokeWidth="8" />
                <circle className="lp-ring-val" cx="38" cy="38" r="32" fill="none" stroke="#1D4ED8" strokeWidth="8" strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[22px] font-extrabold" aria-label="Skor 78 dari 100">
                <CountUp to={78} duration={1600} />
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['TypeScript', 'Unit test', 'REST API'].map((k) => (
                <span key={k} className="lp-chip rounded-lg bg-[#FEF2F2] px-2.5 py-1 text-xs font-bold text-[#991B1B]">
                  {k}
                </span>
              ))}
            </div>
          </div>
        </article>

        <InterviewCard />
        <ProgressCard />

        <article className="lp-card" data-reveal>
          <CardHead plan="basic" title="Impor dari Excel" text="Sudah punya catatan di Excel atau Google Sheets? Kolomnya dicocokkan otomatis." />
          <div className="overflow-hidden rounded-[12px] border border-[#E2E8F0] text-[12px]">
            <div className="grid grid-cols-3 bg-[#F8FAFC] font-bold text-[#64748B]">
              {['Perusahaan', 'Posisi', 'Status'].map((h) => (
                <span key={h} className="border-r border-[#E2E8F0] px-2.5 py-1.5 last:border-r-0">
                  {h}
                </span>
              ))}
            </div>
            {[
              ['Bank Pesisir', 'CS', 'Ditolak'],
              ['Pasar Tani', 'Sosmed', 'Tes'],
              ['Toko Pena', 'Admin', 'Diterima'],
            ].map((r) => (
              <div key={r[0]} className="lp-row grid grid-cols-3 border-t border-[#E2E8F0]">
                {r.map((c, k) => (
                  <span key={k} className="truncate border-r border-[#E2E8F0] px-2.5 py-1.5 last:border-r-0">
                    {c}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </article>

        <article className="lp-card lp-span2" data-reveal style={css({ '--d': '80ms' })}>
          <CardHead plan="standard" title="Simpan loker langsung dari HP" text="Pasang WorksTracker di layar utama, lalu tekan Bagikan di LinkedIn atau Instagram. Form lamaran terbuka sudah terisi." />
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            {['LinkedIn', 'Instagram', 'Jobstreet', 'Browser'].map((s, i) => (
              <span key={s} className="lp-chip inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 font-semibold" style={css({ '--d': `${i * 80}ms` })}>
                {s}
              </span>
            ))}
            <ArrowRight className="size-4 text-[#94A3B8]" aria-hidden />
            <span className="inline-flex items-center gap-2 rounded-full bg-[#1D4ED8] px-3 py-1.5 font-bold text-white">
              <LogoMark className="size-4" /> Bagikan ke WorksTracker
            </span>
            <span className="text-[#64748B]">Notifikasi pengingat juga muncul di HP setiap pagi.</span>
          </div>
        </article>
      </div>
    </section>
  );
}

/* ------------------------------ Harga ------------------------------ */

function Pricing() {
  const spot = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return (
    <section id="harga" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 pt-20 sm:px-6 sm:pt-28">
      <div className="max-w-[760px]" data-reveal>
        <h2 className="m-0 text-[clamp(2rem,4vw,3.2rem)] font-extrabold leading-[1.08] tracking-[-0.035em]">Bayar sekali, pakai selamanya.</h2>
        <p className="mt-[18px] text-lg leading-relaxed text-[#475569]">Tidak ada tagihan bulanan. Mau naik paket nanti, cukup bayar selisihnya.</p>
      </div>

      <div className="lp-price mt-10">
        {PLAN_KEYS.map((p, i) => {
          const info = PLANS[p];
          const dark = p === POPULAR;
          return (
            <article
              key={p}
              data-reveal
              style={css({ '--d': `${i * 110}ms` })}
              onMouseMove={dark ? spot : undefined}
              className={cn('lp-plan', dark ? 'lp-plan-dark' : 'lp-plan-light')}
            >
              <div className="relative flex items-center justify-between gap-3">
                <h3 className="m-0 text-xl font-extrabold">{info.name}</h3>
                {dark && <span className="rounded-full bg-[#1D4ED8] px-2.5 py-1 text-xs font-bold text-white">Paling banyak dipilih</span>}
              </div>
              <p className={cn('relative mt-1.5 text-[15px]', dark ? 'text-[#CBD5E1]' : 'text-[#475569]')}>{info.tagline}</p>
              <p className="relative mt-[22px] text-[40px] font-extrabold tracking-[-0.03em]">{formatRupiah(info.price)}</p>
              <p className={cn('relative text-[13px]', dark ? 'text-[#94A3B8]' : 'text-[#64748B]')}>sekali bayar, seumur hidup</p>
              <ul className={cn('relative mt-[22px] flex list-none flex-col gap-3 p-0 text-[15px]', dark ? 'text-[#E2E8F0]' : 'text-[#334155]')}>
                {planHighlights(p).map((h) => (
                  <li key={h} className="flex gap-2.5">
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="lp-check mt-0.5 flex-none">
                      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={dark ? '#93C5FD' : '#1D4ED8'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {h}
                  </li>
                ))}
              </ul>
              <div className="relative mt-auto pt-7">
                <BuyLink plan={p} className={cn('lp-btn w-full', dark ? 'lp-btn-dark' : 'lp-btn-ghost')} />
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-5 text-sm leading-relaxed text-[#475569]" data-reveal>
        Isi ulang kredit AI: {TOPUPS.map((t) => `${t.credits} kredit ${formatRupiah(t.price)}`).join(' atau ')}. Paket Premium sudah
        termasuk {PREMIUM_CREDITS} kredit. Kredit hanya terpakai kalau hasilnya berhasil dibuat.
      </p>
    </section>
  );
}

/* ------------------------------ FAQ ------------------------------ */

function Faq({ online }: { online: boolean }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="mx-auto max-w-[860px] scroll-mt-20 px-4 pt-20 sm:px-6 sm:pt-28">
      <h2 className="m-0 text-[clamp(2rem,4vw,3.2rem)] font-extrabold leading-[1.08] tracking-[-0.035em]" data-reveal>
        Pertanyaan yang sering masuk
      </h2>
      <div className="mt-8 border-t border-[#E2E8F0]">
        {faq(online).map((f, i) => {
          const isOpen = open === i;
          const id = `faq-${i}`;
          return (
            <div key={f.q} className="lp-faq-item" data-open={isOpen} data-reveal style={css({ '--d': `${i * 60}ms` })}>
              <h3 className="m-0">
                <button type="button" className="lp-faq-btn" aria-expanded={isOpen} aria-controls={id} onClick={() => setOpen(isOpen ? null : i)}>
                  {f.q}
                  <ChevronDown className="lp-faq-chev size-5 text-[#475569]" aria-hidden />
                </button>
              </h3>
              <div id={id} role="region" className="lp-faq-panel">
                <div>
                  <p className="mb-[22px] mt-0 text-base leading-[1.7] text-[#475569]">{f.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------------------- CTA akhir ---------------------------- */

function FinalCta() {
  return (
    <section className="lp-cta mt-20 sm:mt-28">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center px-4 py-24 text-center sm:px-6" data-reveal="scale">
        <h2 className="m-0 max-w-[820px] text-[clamp(2.2rem,5vw,4rem)] font-extrabold leading-[1.05] tracking-[-0.04em] text-white">
          Lamaran berikutnya, jangan sampai terlewat.
        </h2>
        <p className="mt-5 max-w-[560px] text-lg leading-relaxed text-[#CBD5E1]">
          Coba dulu dengan data contoh. Kalau cocok, pindahkan lamaranmu dan mulai rapikan hari ini.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <DemoButton />
          <BuyLink className="lp-btn lp-btn-outline-dark" />
        </div>
      </div>
    </section>
  );
}
