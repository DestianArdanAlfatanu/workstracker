import {
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  CheckSquare,
  Columns3,
  FileSpreadsheet,
  Infinity as InfinityIcon,
  ListChecks,
  Lock,
  MessageCircle,
  Paperclip,
  Smartphone,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand';
import { TryDemoButton } from '@/components/demo';
import { Button } from '@/components/ui/button';
import { BUY_MESSAGE, PRICE_ORIGINAL, PRICE_PROMO, whatsappLink } from '@/lib/config';
import { formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';

const FEATURES: Array<{ icon: LucideIcon; title: string; text: string; addon?: boolean }> = [
  {
    icon: Sparkles,
    title: 'AI Career Assistant',
    text: 'Cover letter personal & persiapan interview berdasarkan profil dan deskripsi lowongan.',
    addon: true,
  },
  { icon: BarChart3, title: 'Dashboard & statistik', text: 'Total lamaran, interview, offer, dan response rate terlihat sekilas.' },
  { icon: Columns3, title: 'Board Kanban', text: 'Geser kartu lamaran antar status — dari Applied sampai Accepted.' },
  { icon: CalendarDays, title: 'Kalender aktivitas', text: 'Jadwal interview, follow-up, dan tenggat tugas dalam satu kalender.' },
  { icon: CheckSquare, title: 'Tugas & to-do', text: 'Catat persiapan per lamaran: portofolio, tes teknis, latihan interview.' },
  { icon: Target, title: 'Target mingguan', text: 'Tetapkan target lamaran per minggu dan pantau konsistensimu.' },
  { icon: Bell, title: 'Pengingat email', text: 'Email setiap pagi berisi jadwal & tugas yang jatuh tempo hari ini.' },
  { icon: Paperclip, title: 'Simpan CV per lamaran', text: 'Lampirkan CV & surat lamaran versi mana yang kamu kirim.' },
  { icon: FileSpreadsheet, title: 'Ekspor Excel / CSV', text: 'Unduh semua data lamaranmu kapan saja.' },
  { icon: ListChecks, title: 'Aksi massal', text: 'Ubah status atau hapus banyak lamaran sekaligus.' },
  { icon: Lock, title: 'Data pribadi', text: 'Hanya kamu yang bisa melihat isi lamaranmu.' },
];

const STEPS = [
  { title: 'Hubungi admin via WhatsApp', text: 'Klik tombol beli, lalu lakukan pembayaran sesuai arahan admin.' },
  { title: 'Terima akun dari admin', text: 'Admin membuatkan akun dan mengirim email & password via WhatsApp.' },
  { title: 'Login & mulai melacak', text: 'Buat password baru saat login pertama, lalu catat lamaran pertamamu.' },
];

const FAQ = [
  { q: 'Apakah ada biaya bulanan?', a: 'Tidak. Cukup bayar sekali dan akses WorksTracker berlaku seumur hidup.' },
  { q: 'Bagaimana cara membeli?', a: 'Klik tombol "Beli via WhatsApp", lalu admin akan memandu pembayaran dan mengirimkan akunmu.' },
  { q: 'Apakah bisa dipakai di HP?', a: 'Bisa. Tampilan dirancang nyaman dipakai di HP maupun laptop, cukup lewat browser.' },
  { q: 'Apakah data lamaranku aman?', a: 'Setiap akun hanya bisa melihat datanya sendiri. Admin pun tidak melihat isi lamaranmu.' },
  {
    q: 'Apa itu AI Career Assistant?',
    a: 'Add-on opsional yang membuat cover letter dan materi persiapan interview untuk tiap lamaran, berdasarkan profil karier & deskripsi lowongan. Aktifkan dengan menghubungi admin via WhatsApp.',
  },
  { q: 'Bagaimana jika lupa password?', a: 'Hubungi admin via WhatsApp, password akan di-reset dan kamu bisa membuat password baru.' },
];

const discount = Math.round((1 - PRICE_PROMO / PRICE_ORIGINAL) * 100);

function BuyButton({ className, size = 'lg', label = 'Beli via WhatsApp' }: { className?: string; size?: 'lg' | 'default'; label?: string }) {
  return (
    <Button asChild size={size} className={cn('shadow-[0_10px_24px_-10px_rgba(61,90,241,0.8)]', className)}>
      <a href={whatsappLink(BUY_MESSAGE)} target="_blank" rel="noopener noreferrer">
        <MessageCircle />
        {label}
      </a>
    </Button>
  );
}

/** Ilustrasi dashboard sederhana (tanpa gambar) untuk hero. */
function ProductMock() {
  const bars = [30, 55, 40, 75, 60, 90];
  return (
    <div className="relative" aria-hidden>
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-[#c7d0ff] via-transparent to-transparent blur-2xl" />
      <div className="rounded-3xl bg-card p-4 shadow-[0_30px_60px_-30px_rgba(17,20,45,0.35)] sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold">Dashboard</p>
            <p className="text-[11px] text-muted-foreground">Ringkasan lamaran kerja</p>
          </div>
          <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[#5b74ff] to-[#2b3fd0] text-[11px] font-semibold text-white">
            RK
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-[#5470ff] to-[#3049e6] p-3 text-white">
            <p className="text-[11px] text-white/80">Total lamaran</p>
            <p className="text-2xl font-bold">48</p>
            <span className="mt-1 inline-block rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-foreground">+24%</span>
          </div>
          <div className="rounded-2xl border p-3">
            <p className="text-[11px] text-muted-foreground">Interview</p>
            <p className="text-2xl font-bold">7</p>
            <span className="mt-1 inline-block rounded-full bg-[#dcf7e7] px-1.5 py-0.5 text-[10px] font-semibold text-[#0f6b3a]">+3 minggu ini</span>
          </div>
        </div>
        <div className="mt-3 rounded-2xl border p-3">
          <p className="mb-2 text-[11px] font-semibold">Aktivitas lamaran</p>
          <div className="flex h-20 items-end gap-2">
            {bars.map((h, i) => (
              <div key={i} className="flex h-full flex-1 items-end gap-0.5">
                <div className="flex-1 rounded-t bg-[#93a3f5]" style={{ height: `${h}%` }} />
                <div className="flex-1 rounded-t bg-primary" style={{ height: `${h * 0.45}%` }} />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {[
            { c: 'Tokopedia', s: 'Interview', cls: 'bg-amber-50 text-amber-900 border-amber-300' },
            { c: 'Gojek', s: 'Screening', cls: 'bg-violet-50 text-violet-800 border-violet-200' },
            { c: 'Shopee', s: 'Offer', cls: 'bg-lime-50 text-lime-900 border-lime-300' },
          ].map((r) => (
            <div key={r.c} className="flex items-center justify-between rounded-xl border px-3 py-2">
              <span className="text-xs font-semibold">{r.c}</span>
              <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', r.cls)}>{r.s}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -bottom-5 -left-4 hidden items-center gap-2 rounded-2xl bg-card px-3 py-2 shadow-lg sm:flex">
        <span className="flex size-8 items-center justify-center rounded-full bg-[#dcf7e7] text-[#0f6b3a]">
          <Check className="size-4" />
        </span>
        <div>
          <p className="text-xs font-semibold">Target minggu ini tercapai</p>
          <p className="text-[10px] text-muted-foreground">10 / 10 lamaran</p>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    // overflow-x-clip: hiasan hero (blur & badge melayang) tidak boleh membuat scroll horizontal di HP.
    <div className="min-h-dvh overflow-x-clip bg-background">
      <header className="sticky top-0 z-30 border-b border-transparent bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex" aria-label="Navigasi">
            <a href="#fitur" className="hover:text-foreground">Fitur</a>
            <a href="#cara" className="hover:text-foreground">Cara beli</a>
            <a href="#harga" className="hover:text-foreground">Harga</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link to="/login">Masuk</Link>
            </Button>
            <BuyButton size="default" label="Beli" className="max-sm:hidden" />
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 md:pt-16 lg:grid-cols-2">
          <div className="flex flex-col items-start gap-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-semibold text-primary shadow-sm">
              <InfinityIcon className="size-3.5" aria-hidden />
              Sekali bayar · akses seumur hidup
            </span>
            <h1 className="text-[2.15rem] font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              Lacak semua lamaran kerja dalam <span className="text-primary">satu dashboard</span>.
            </h1>
            <p className="max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              Berhenti mencatat di spreadsheet dan notes yang berceceran. Pantau status lamaran, jadwal interview, dan
              follow-up — supaya tidak ada kesempatan yang terlewat.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <BuyButton />
              <TryDemoButton size="lg" />
            </div>
            <p className="-mt-3 text-xs text-muted-foreground">Demo tanpa daftar · langsung berisi data contoh · terhapus otomatis 24 jam</p>
            <p className="flex items-baseline gap-2 text-sm text-muted-foreground">
              Hanya
              <span className="text-xl font-bold text-foreground">{formatRupiah(PRICE_PROMO)}</span>
              <s>{formatRupiah(PRICE_ORIGINAL)}</s>
              <span className="rounded-full bg-[#fde4e4] px-2 py-0.5 text-xs font-semibold text-[#a32020]">-{discount}%</span>
            </p>
          </div>
          <ProductMock />
        </section>

        {/* Masalah */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-4 rounded-3xl bg-[#14162b] p-6 text-white sm:grid-cols-3 sm:p-8">
            {[
              { k: '20–100', v: 'lamaran dikirim pencari kerja aktif — mustahil diingat semua' },
              { k: '5+ kanal', v: 'LinkedIn, Jobstreet, Glints, email… catatan jadi tersebar' },
              { k: '1 tempat', v: 'WorksTracker merapikan semuanya, lengkap dengan pengingat' },
            ].map((s) => (
              <div key={s.k}>
                <p className="text-3xl font-extrabold text-[#93a3f5]">{s.k}</p>
                <p className="mt-1 text-sm text-white/75">{s.v}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Fitur */}
        <section id="fitur" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight">Semua yang kamu butuhkan untuk berburu kerja</h2>
            <p className="mt-3 text-muted-foreground">Dirancang untuk fresh graduate, career switcher, dan profesional.</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, text, addon }) => (
              <div
                key={title}
                className={cn(
                  'relative rounded-2xl bg-card p-5 shadow-[0_1px_3px_rgba(17,20,45,0.04)]',
                  addon && 'ring-2 ring-primary/30 sm:col-span-2 lg:col-span-1',
                )}
              >
                {addon && (
                  <span className="absolute right-4 top-4 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    Add-on
                  </span>
                )}
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-bold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Smartphone className="size-4" aria-hidden />
            Nyaman dipakai di HP maupun laptop.
          </p>
        </section>

        {/* Cara beli */}
        <section id="cara" className="scroll-mt-20 bg-card py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-extrabold tracking-tight">Cara mendapatkan akses</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative rounded-2xl border p-6">
                  <span className="flex size-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 font-bold">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Harga */}
        <section id="harga" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-md overflow-hidden rounded-3xl bg-card shadow-[0_30px_60px_-30px_rgba(17,20,45,0.35)]">
            <div className="bg-gradient-to-br from-[#5470ff] to-[#3049e6] p-6 text-white">
              <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">Promo hemat {discount}%</span>
              <h2 className="mt-4 text-xl font-bold">Akses Seumur Hidup</h2>
              <p className="mt-3 flex items-baseline gap-3">
                <span className="text-4xl font-extrabold tracking-tight">{formatRupiah(PRICE_PROMO)}</span>
                <s className="text-lg text-white/70">{formatRupiah(PRICE_ORIGINAL)}</s>
              </p>
              <p className="mt-1 text-sm text-white/80">Sekali bayar, tanpa biaya bulanan.</p>
            </div>
            <div className="flex flex-col gap-5 p-6">
              <ul className="flex flex-col gap-2.5 text-sm">
                {[
                  'Semua fitur, termasuk fitur baru ke depannya',
                  'Lamaran tanpa batas (hingga 2.000 aktif)',
                  'Board Kanban, kalender, tugas & target mingguan',
                  'Pengingat email harian',
                  'Simpan CV & ekspor Excel/CSV',
                  'Bantuan langsung dari admin via WhatsApp',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#dcf7e7] text-[#0f6b3a]">
                      <Check className="size-3.5" aria-hidden />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <BuyButton className="w-full" label="Beli sekarang via WhatsApp" />
              <TryDemoButton className="w-full" label="Coba demo dulu" />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-20 sm:px-6">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">Pertanyaan umum</h2>
          <div className="mt-8 flex flex-col gap-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-2xl bg-card p-5 open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {f.q}
                  <span className="text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA akhir */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="flex flex-col items-center gap-5 rounded-3xl bg-[#14162b] px-6 py-12 text-center text-white">
            <h2 className="max-w-xl text-3xl font-extrabold tracking-tight">Mulai rapikan perjalanan karirmu hari ini</h2>
            <p className="text-white/75">
              Hanya {formatRupiah(PRICE_PROMO)} untuk selamanya. <s className="text-white/50">{formatRupiah(PRICE_ORIGINAL)}</s>
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <BuyButton />
              <TryDemoButton size="lg" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <Logo />
          <p>© {new Date().getFullYear()} WorksTracker · Pencatat lamaran kerja</p>
          <Link to="/login" className="font-medium hover:text-foreground">
            Masuk ke akun
          </Link>
        </div>
      </footer>
    </div>
  );
}
