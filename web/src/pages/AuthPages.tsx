import { zodResolver } from '@hookform/resolvers/zod';
import {
  forgotPasswordSchema,
  loginSchema,
  profileUpdateSchema,
  resetPasswordSchema,
  resetTokenSchema,
  type ForgotPasswordInput,
  type LoginInput,
} from '@wt/shared';
import { Eye, EyeOff, KeyRound, Link as LinkIcon, Loader2, MailCheck } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { LogoMark } from '@/components/brand';
import { TryDemoButton } from '@/components/demo';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePaymentConfig } from '@/lib/payments';
import { cn } from '@/lib/utils';
import './landing.css';
import { useUpdateProfile } from '@/lib/queries';


const css = (v: Record<string, string | number>) => v as React.CSSProperties;

/** Panel kanan (desktop): pesan utama + contoh agenda & lamaran yang melayang. */
function AuthShowcase() {
  return (
    <aside aria-hidden className="lp-cta relative hidden flex-col justify-center overflow-hidden px-16 py-16 text-white lg:flex xl:px-24">
      <h2 className="m-0 max-w-[36rem] text-[clamp(2.6rem,4.2vw,4rem)] font-extrabold leading-[1.02] tracking-[-0.045em]">
        {'Lamaran boleh banyak. Asal tidak ada yang terlewat.'.split(' ').map((w, i) => (
          <span key={i} className="lp-word" style={css({ '--i': i })}>
            {w}{'\u00a0'}
          </span>
        ))}
      </h2>
      <div className="relative mt-14 h-[300px] max-w-[40rem]">
        <div className="lp-fade-up absolute left-0 top-0 w-[min(25rem,70%)]" style={css({ '--d': '700ms' })}>
          <div className="lp-float" style={css({ '--fd': '0.6s' })}>
            <div className="-rotate-3 rounded-[18px] bg-white p-5 text-[#0f172a] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)] transition-transform duration-500 hover:rotate-0">
              <p className="m-0 text-xs font-bold text-[#64748b]">Agenda hari ini</p>
              {[
                ['Kirim portofolio ke Pasar Tani', 'Hari ini', ''],
                ['Follow-up Lumbung Data', 'Terlewat 2 hari', 'text-[#b91c1c]'],
                ['Batas melamar Rantai Logistik', 'Senin', ''],
              ].map(([t, v, cls]) => (
                <p key={t} className="mb-0 mt-2.5 flex justify-between gap-3 text-sm">
                  <span>{t}</span>
                  <span className={cn('shrink-0 font-bold', cls)}>{v}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
        <div className="lp-fade-up absolute right-0 top-[150px] w-[min(24rem,66%)]" style={css({ '--d': '900ms' })}>
          <div className="lp-float" style={css({ '--fd': '0s' })}>
            <div className="rotate-2 rounded-[18px] bg-white p-5 text-[#0f172a] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)] transition-transform duration-500 hover:rotate-0">
              <p className="m-0 text-sm font-semibold text-[#64748b]">Kedai Seduh Nusantara</p>
              <p className="mt-0.5 text-[22px] font-extrabold tracking-[-0.02em]">Admin Marketplace</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fde68a] bg-[#fffbeb] px-3 py-1 text-[13px] font-bold text-[#92400e]">
                  <span className="lp-pulse size-[7px] rounded-full bg-[#f59e0b]" />
                  Interview
                </span>
                <span className="flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className={cn('lp-seg', i < 3 && 'is-on')} style={css({ '--i': i })} />
                  ))}
                </span>
              </div>
              <p className="mb-0 mt-3 text-[13px] text-[#475569]">Kamis, 22 Okt · 10.00 WIB</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/**
 * Perkecil kartu bila tidak muat di tinggi layar, supaya halaman masuk tidak perlu di-scroll.
 * Ukuran asli kartu dibaca dari elemen dalam (tanpa transform).
 */
function useFitScale() {
  const boxRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content) return;
    const fit = () => {
      const cs = getComputedStyle(box);
      const avail = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const need = content.offsetHeight;
      setScale(need > avail && avail > 0 ? Math.max(0.6, avail / need) : 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    ro.observe(content);
    return () => ro.disconnect();
  }, []);
  return { boxRef, contentRef, scale };
}

/**
 * Layout halaman masuk & akun: kartu di kiri (latar grid), panel gelap di kanan untuk desktop.
 * Di HP dan tablet cukup kartunya saja, di tengah. Halaman tidak bisa di-scroll.
 */
function AuthLayout({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle: string;
  /** Ikon kecil di atas judul (halaman selain masuk). */
  icon?: typeof KeyRound;
  children: ReactNode;
}) {
  const { boxRef, contentRef, scale } = useFitScale();
  return (
    <div className="lp grid h-dvh overflow-hidden lg:grid-cols-2">
      <div className="lp-sheet flex min-h-0 flex-col overflow-hidden px-4 py-4 sm:px-10 sm:py-6 lg:px-16 xl:px-[120px] [@media(max-height:860px)]:py-4" style={{ backgroundPosition: '0 0' }}>
        <Link to="/" className="group flex w-fit items-center gap-2.5 text-[#0f172a] no-underline" aria-label="WorksTracker, ke beranda">
          <LogoMark className="size-9 transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110" />
          <span className="text-xl font-extrabold tracking-[-0.035em]">WorksTracker</span>
        </Link>
        <main ref={boxRef} className="flex min-h-0 flex-1 items-center justify-center py-4 sm:py-8 lg:justify-start [@media(max-height:860px)]:py-3">
          <div
            ref={contentRef}
            className="w-full max-w-[34rem] origin-center lg:origin-left"
            style={scale < 1 ? { transform: `scale(${scale})` } : undefined}
          >
          <div className="lp-fade-up rounded-[22px] border border-[#e2e8f0] bg-white p-5 shadow-[0_30px_60px_-40px_rgba(15,23,42,0.45)] sm:p-9 [@media(max-height:860px)]:sm:p-7" style={css({ '--d': '0ms' })}>
            {Icon && (
              <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-[#eff6ff] text-[#1d4ed8]">
                <Icon className="size-5" aria-hidden />
              </span>
            )}
            <h1 className="m-0 text-[clamp(1.75rem,3.2vw,2.35rem)] [@media(max-height:860px)]:text-[clamp(1.6rem,2.6vw,2rem)] font-extrabold leading-[1.1] tracking-[-0.035em]">{title}</h1>
            <p className="mt-1.5 text-[15px] leading-relaxed text-[#475569] sm:mt-2">{subtitle}</p>
            <div className="mt-5 sm:mt-6 [@media(max-height:860px)]:mt-4">{children}</div>
          </div>
          </div>
        </main>
        <p className="m-0 text-xs text-[#64748b] sm:text-sm">© {new Date().getFullYear()} WorksTracker</p>
      </div>
      <AuthShowcase />
    </div>
  );
}

function FormField({
  id,
  label,
  error,
  action,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  /** Tautan kecil di kanan label (mis. "Lupa password?"). */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {action ? (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={id}>{label}</Label>
          {action}
        </div>
      ) : (
        <Label htmlFor={id}>{label}</Label>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const fieldA11y = (id: string, error?: string) => ({
  id,
  'aria-invalid': !!error,
  'aria-describedby': error ? `${id}-error` : undefined,
});

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const online = !!usePaymentConfig().data?.enabled;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const user = await login(values);
      if (user.mustChangePassword) {
        navigate('/ganti-password', { replace: true });
        return;
      }
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(from, { replace: true });
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : 'Gagal login, coba lagi');
    }
  });

  return (
    <AuthLayout title="Masuk ke WorksTracker" subtitle="Lanjutkan mencatat dan memantau lamaranmu.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 sm:gap-5 [@media(max-height:860px)]:sm:gap-4">
        {serverError && <Alert variant="destructive">{serverError}</Alert>}
        <FormField id="email" label="Email" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="nama@email.com"
            className="h-12 text-[15px] [@media(max-height:860px)]:h-11"
            {...fieldA11y('email', errors.email?.message)}
            {...register('email')}
          />
        </FormField>
        <FormField
          id="password"
          label="Password"
          error={errors.password?.message}
          action={
            <Link to="/lupa-password" className="text-sm font-semibold text-primary hover:underline">
              Lupa password?
            </Link>
          }
        >
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Password"
              className="h-12 pr-12 text-[15px] [@media(max-height:860px)]:h-11"
              {...fieldA11y('password', errors.password?.message)}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
              aria-pressed={showPassword}
              className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#64748b] transition-colors hover:bg-[#f1f5f9] hover:text-[#0f172a]"
            >
              {showPassword ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
            </button>
          </div>
        </FormField>
        <button type="submit" disabled={isSubmitting} className="lp-btn lp-btn-primary w-full">
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {isSubmitting ? 'Memproses…' : 'Masuk'}
        </button>
        <div className="flex items-center gap-3 text-sm text-[#64748b]" aria-hidden>
          <span className="h-px flex-1 bg-[#e2e8f0]" />
          atau
          <span className="h-px flex-1 bg-[#e2e8f0]" />
        </div>
        <TryDemoButton label="Coba demo gratis tanpa daftar" className="h-[52px] w-full rounded-xl text-[15px] font-bold [@media(max-height:860px)]:h-12" />
        <p className="m-0 text-[15px] leading-relaxed text-[#475569]">
          Belum punya akun?{' '}
          {online ? 'Beli paket dan akunmu langsung aktif setelah pembayaran.' : 'Akun dibuat oleh admin setelah pembelian.'}{' '}
          <a href="/#harga" className="font-bold text-primary hover:underline">
            Lihat paket
          </a>
        </p>
      </form>
    </AuthLayout>
  );
}

/** Minta link atur ulang password lewat email. Respons selalu sama agar tidak membocorkan email terdaftar. */
export function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: searchParams.get('email') ?? '' },
  });

  const send = async (email: string) => {
    setServerError(null);
    try {
      await authApi.forgotPassword(email);
      setSentTo(email);
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : 'Gagal mengirim permintaan, coba lagi');
    }
  };
  const onSubmit = handleSubmit(({ email }) => send(email));

  if (sentTo) {
    return (
      <AuthLayout icon={MailCheck} title="Cek email Anda" subtitle="Link atur ulang password sedang dalam perjalanan">
        <div className="flex flex-col gap-4 text-sm">
          <p className="leading-relaxed text-muted-foreground">
            Jika <strong className="font-semibold text-foreground">{sentTo}</strong> terdaftar di WorksTracker, kami
            telah mengirim link untuk membuat password baru. Link berlaku 30 menit dan hanya bisa dipakai sekali.
          </p>
          <ul className="list-disc space-y-1 rounded-xl bg-muted p-3 pl-7 text-xs leading-relaxed text-muted-foreground">
            <li>Email dikirim dari workstrackernotifications@gmail.com.</li>
            <li>Belum masuk dalam beberapa menit? Periksa folder Spam atau Promosi.</li>
            <li>Akun demo tidak dapat mengatur ulang password.</li>
          </ul>
          <Button type="button" variant="outline" loading={isSubmitting} onClick={() => void send(getValues('email'))}>
            Kirim ulang link
          </Button>
          <Link to="/login" className="text-center text-xs font-medium text-muted-foreground hover:text-foreground">
            ← Kembali ke halaman masuk
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={KeyRound}
      title="Lupa password?"
      subtitle="Masukkan email akun Anda. Kami akan mengirim link untuk membuat password baru."
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {serverError && <Alert variant="destructive">{serverError}</Alert>}
        <FormField id="email" label="Email" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            autoFocus
            {...fieldA11y('email', errors.email?.message)}
            {...register('email')}
          />
        </FormField>
        <Button type="submit" loading={isSubmitting} className="mt-1">
          {isSubmitting ? 'Mengirim…' : 'Kirim link atur ulang'}
        </Button>
        <Link to="/login" className="text-center text-xs font-medium text-muted-foreground hover:text-foreground">
          ← Kembali ke halaman masuk
        </Link>
      </form>
    </AuthLayout>
  );
}

const resetFormSchema = z
  .object({ newPassword: resetPasswordSchema.shape.newPassword, confirmPassword: z.string() })
  .refine((v) => v.confirmPassword === v.newPassword, {
    path: ['confirmPassword'],
    message: 'Konfirmasi password tidak sama',
  });
type ResetFormValues = z.infer<typeof resetFormSchema>;

/** Halaman dari link email: buat password baru. */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  // Link dari email pembelian otomatis: akun baru membuat password pertamanya.
  const isNew = searchParams.get('baru') === '1';
  const navigate = useNavigate();
  const { state, logout } = useAuth();
  const [linkState, setLinkState] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormValues>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  useEffect(() => {
    if (!resetTokenSchema.safeParse({ token }).success) {
      setLinkState('invalid');
      return;
    }
    let active = true;
    authApi
      .checkResetToken(token)
      .then((valid) => active && setLinkState(valid ? 'valid' : 'invalid'))
      .catch(() => active && setLinkState('invalid'));
    return () => {
      active = false;
    };
  }, [token]);

  const onSubmit = handleSubmit(async ({ newPassword }) => {
    setServerError(null);
    try {
      await authApi.resetPassword({ token, newPassword });
      // Semua sesi dicabut di server; pastikan tab ini juga keluar.
      if (state.status === 'authenticated') await logout().catch(() => undefined);
      toast.success(isNew ? 'Password dibuat. Silakan masuk ke akun baru Anda.' : 'Password berhasil diubah. Silakan masuk dengan password baru.');
      navigate('/login', { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.fields?.token) setLinkState('invalid');
      else setServerError(e instanceof ApiError ? e.message : 'Gagal menyimpan password');
    }
  });

  if (linkState === 'checking') {
    return (
      <AuthLayout icon={KeyRound} title="Memeriksa link…" subtitle="Sebentar, kami memastikan link Anda masih berlaku">
        <div className="flex justify-center py-4" role="status">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          <span className="sr-only">Memeriksa link…</span>
        </div>
      </AuthLayout>
    );
  }

  if (linkState === 'invalid') {
    return (
      <AuthLayout
        icon={LinkIcon}
        title="Link tidak berlaku"
        subtitle="Link atur ulang password sudah kedaluwarsa, sudah dipakai, atau tidak lengkap."
      >
        <div className="flex flex-col gap-4 text-sm">
          <p className="leading-relaxed text-muted-foreground">
            {isNew
              ? 'Link membuat password berlaku 72 jam dan sekali pakai. Minta link baru dengan email yang dipakai saat membeli.'
              : 'Demi keamanan, link hanya berlaku 30 menit dan sekali pakai. Jika Anda meminta link lebih dari sekali, gunakan link dari email terbaru.'}
          </p>
          <Button asChild>
            <Link to="/lupa-password">Minta link baru</Link>
          </Button>
          <Link to="/login" className="text-center text-xs font-medium text-muted-foreground hover:text-foreground">
            ← Kembali ke halaman masuk
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={KeyRound}
      title={isNew ? 'Buat password akun Anda' : 'Buat password baru'}
      subtitle={isNew ? 'Satu langkah lagi sebelum mulai memakai WorksTracker.' : 'Setelah disimpan, semua perangkat akan dikeluarkan.'}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {serverError && <Alert variant="destructive">{serverError}</Alert>}
        <FormField id="newPassword" label="Password baru" error={errors.newPassword?.message}>
          <Input
            type="password"
            autoComplete="new-password"
            autoFocus
            {...fieldA11y('newPassword', errors.newPassword?.message)}
            {...register('newPassword')}
          />
          <p className="text-xs text-muted-foreground">Minimal 8 karakter.</p>
        </FormField>
        <FormField id="confirmPassword" label="Ulangi password baru" error={errors.confirmPassword?.message}>
          <Input
            type="password"
            autoComplete="new-password"
            {...fieldA11y('confirmPassword', errors.confirmPassword?.message)}
            {...register('confirmPassword')}
          />
        </FormField>
        <Button type="submit" loading={isSubmitting} className="mt-1">
          {isSubmitting ? 'Menyimpan…' : isNew ? 'Simpan & lanjut masuk' : 'Simpan password baru'}
        </Button>
      </form>
    </AuthLayout>
  );
}

const changePasswordSchema = profileUpdateSchema
  .innerType()
  .pick({ currentPassword: true, newPassword: true })
  .extend({ confirmPassword: z.string() })
  .superRefine((v, ctx) => {
    if (!v.currentPassword) {
      ctx.addIssue({ code: 'custom', path: ['currentPassword'], message: 'Password dari admin wajib diisi' });
    }
    if (!v.newPassword) {
      ctx.addIssue({ code: 'custom', path: ['newPassword'], message: 'Password baru wajib diisi' });
    }
    if (v.newPassword && v.confirmPassword !== v.newPassword) {
      ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Konfirmasi password tidak sama' });
    }
  });
type ChangePasswordValues = { currentPassword: string; newPassword: string; confirmPassword: string };

/** Halaman wajib saat login pertama / setelah password di-reset admin. */
export function ChangePasswordPage() {
  const { state, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const mutation = useUpdateProfile();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setServerError(null);
    try {
      const user = await mutation.mutateAsync({ currentPassword, newPassword });
      setUser(user);
      toast.success('Password berhasil dibuat. Selamat datang!');
      navigate('/', { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.fields) {
        for (const [field, message] of Object.entries(e.fields)) {
          if (field === 'currentPassword' || field === 'newPassword') setError(field, { message });
        }
      } else {
        setServerError(e instanceof ApiError ? e.message : 'Gagal menyimpan password');
      }
    }
  });

  return (
    <AuthLayout
      icon={KeyRound}
      title="Buat password baru"
      subtitle={`Halo ${state.user?.name ?? ''}! Demi keamanan, ganti password default dari admin sebelum mulai.`}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {serverError && <Alert variant="destructive">{serverError}</Alert>}
        <FormField id="currentPassword" label="Password dari admin" error={errors.currentPassword?.message}>
          <Input
            type="password"
            autoComplete="current-password"
            {...fieldA11y('currentPassword', errors.currentPassword?.message)}
            {...register('currentPassword')}
          />
        </FormField>
        <FormField id="newPassword" label="Password baru" error={errors.newPassword?.message}>
          <Input
            type="password"
            autoComplete="new-password"
            {...fieldA11y('newPassword', errors.newPassword?.message)}
            {...register('newPassword')}
          />
          <p className="text-xs text-muted-foreground">Minimal 8 karakter.</p>
        </FormField>
        <FormField id="confirmPassword" label="Ulangi password baru" error={errors.confirmPassword?.message}>
          <Input
            type="password"
            autoComplete="new-password"
            {...fieldA11y('confirmPassword', errors.confirmPassword?.message)}
            {...register('confirmPassword')}
          />
        </FormField>
        <Button type="submit" loading={isSubmitting} className="mt-1">
          {isSubmitting ? 'Menyimpan…' : 'Simpan & mulai'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => void logout()}>
          Keluar
        </Button>
      </form>
    </AuthLayout>
  );
}
