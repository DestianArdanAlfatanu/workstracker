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
import { KeyRound, Link as LinkIcon, Loader2, MailCheck, MessageCircle } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
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
import { BUY_MESSAGE, whatsappLink } from '@/lib/config';
import { useUpdateProfile } from '@/lib/queries';


function AuthLayout({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle: string;
  /** Tanpa ikon = logo WorksTracker. */
  icon?: typeof KeyRound;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          {Icon ? (
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_24px_-10px_rgba(61,90,241,0.8)]">
              <Icon className="size-5" aria-hidden />
            </span>
          ) : (
            <LogoMark className="size-12 drop-shadow-[0_10px_18px_rgba(29,78,216,0.35)]" />
          )}
          <div>
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <Card className="p-5 sm:p-6">{children}</Card>
      </div>
    </main>
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
    <AuthLayout title="Masuk ke WorksTracker" subtitle="Pantau semua lamaran kerja Anda di satu tempat">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {serverError && <Alert variant="destructive">{serverError}</Alert>}
        <FormField id="email" label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...fieldA11y('email', errors.email?.message)} {...register('email')} />
        </FormField>
        <FormField
          id="password"
          label="Password"
          error={errors.password?.message}
          action={
            <Link to="/lupa-password" className="text-xs font-semibold text-primary hover:underline">
              Lupa password?
            </Link>
          }
        >
          <Input
            type="password"
            autoComplete="current-password"
            {...fieldA11y('password', errors.password?.message)}
            {...register('password')}
          />
        </FormField>
        <Button type="submit" loading={isSubmitting} className="mt-1">
          {isSubmitting ? 'Memproses…' : 'Masuk'}
        </Button>
        <div className="rounded-xl bg-muted p-3 text-center text-xs leading-relaxed text-muted-foreground">
          Belum punya akun? Akses WorksTracker dibeli sekali untuk seumur hidup — akun dibuatkan oleh admin.
          <a
            href={whatsappLink(BUY_MESSAGE)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center justify-center gap-1.5 font-semibold text-primary"
          >
            <MessageCircle className="size-4" aria-hidden />
            Beli akses via WhatsApp
          </a>
        </div>
        <TryDemoButton label="Coba demo gratis tanpa daftar" />
        <Link to="/" className="text-center text-xs font-medium text-muted-foreground hover:text-foreground">
          ← Kembali ke beranda
        </Link>
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
      toast.success('Password berhasil diubah. Silakan masuk dengan password baru.');
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
            Demi keamanan, link hanya berlaku 30 menit dan sekali pakai. Jika Anda meminta link lebih dari sekali, gunakan
            link dari email terbaru.
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
    <AuthLayout icon={KeyRound} title="Buat password baru" subtitle="Setelah disimpan, semua perangkat akan dikeluarkan.">
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
          {isSubmitting ? 'Menyimpan…' : 'Simpan password baru'}
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
