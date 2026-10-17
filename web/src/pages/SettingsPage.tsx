import { zodResolver } from '@hookform/resolvers/zod';
import { profileUpdateSchema } from '@wt/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSendTestReminder, useUpdatePreferences, useUpdateProfile } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { MobileAppCard } from '@/components/MobileAppCard';
import { PaymentHistoryCard } from '@/components/PaymentHistoryCard';
import { PlanBadge, usePlan, useUpgradePrompt } from '@/components/plan';

const nameSchema = profileUpdateSchema.innerType().pick({ name: true }).required();

const passwordSchema = profileUpdateSchema
  .innerType()
  .pick({ currentPassword: true, newPassword: true })
  .extend({ confirmPassword: z.string() })
  .superRefine((v, ctx) => {
    if (!v.currentPassword) {
      ctx.addIssue({ code: 'custom', path: ['currentPassword'], message: 'Password saat ini wajib diisi' });
    }
    if (!v.newPassword) {
      ctx.addIssue({ code: 'custom', path: ['newPassword'], message: 'Password baru wajib diisi' });
    }
    if (v.newPassword && v.confirmPassword !== v.newPassword) {
      ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Konfirmasi password tidak sama' });
    }
  });

type NameValues = { name: string };
type PasswordValues = { currentPassword: string; newPassword: string; confirmPassword: string };

const errorText = (id: string, message?: string) =>
  message ? (
    <p id={`${id}-error`} className="text-xs font-medium text-destructive">
      {message}
    </p>
  ) : null;

const a11y = (id: string, message?: string) => ({
  id,
  'aria-invalid': !!message,
  'aria-describedby': message ? `${id}-error` : undefined,
});

export function SettingsPage() {
  const { state, setUser } = useAuth();
  const mutation = useUpdateProfile();
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const nameForm = useForm<NameValues>({
    resolver: zodResolver(nameSchema),
    values: { name: state.user?.name ?? '' },
  });

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const saveName = nameForm.handleSubmit(async ({ name }) => {
    try {
      const user = await mutation.mutateAsync({ name });
      setUser(user);
      toast.success('Nama berhasil diperbarui');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Gagal menyimpan nama');
    }
  });

  const savePassword = passwordForm.handleSubmit(async ({ currentPassword, newPassword }) => {
    setPasswordError(null);
    try {
      await mutation.mutateAsync({ currentPassword, newPassword });
      passwordForm.reset();
      toast.success('Password berhasil diubah. Sesi di perangkat lain telah dikeluarkan.');
    } catch (e) {
      if (e instanceof ApiError && e.fields?.currentPassword) {
        passwordForm.setError('currentPassword', { message: e.fields.currentPassword });
      } else {
        setPasswordError(e instanceof ApiError ? e.message : 'Gagal mengubah password');
      }
    }
  });

  const ne = nameForm.formState.errors;
  const pe = passwordForm.formState.errors;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Masuk sebagai <span className="font-semibold text-foreground">{state.user?.email}</span>
      </p>

      <PreferencesCard />

      <MobileAppCard />

      <PaymentHistoryCard />

      <Card>
        <CardHeader>
          <CardTitle>Nama</CardTitle>
          <CardDescription>Nama yang ditampilkan di aplikasi.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveName} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nama</Label>
              <Input autoComplete="name" {...a11y('name', ne.name?.message)} {...nameForm.register('name')} />
              {errorText('name', ne.name?.message)}
            </div>
            <Button
              type="submit"
              className="self-start"
              loading={nameForm.formState.isSubmitting}
              disabled={!nameForm.formState.isDirty}
            >
              {nameForm.formState.isSubmitting ? 'Menyimpan…' : 'Simpan nama'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ubah password</CardTitle>
          <CardDescription>Setelah diubah, sesi di perangkat lain akan dikeluarkan.</CardDescription>
        </CardHeader>
        <CardContent>
          {state.user?.isDemo ? (
            <p className="text-sm text-muted-foreground">Ganti password tidak tersedia di mode demo.</p>
          ) : (
          <form onSubmit={savePassword} noValidate className="flex flex-col gap-4">
            {passwordError && <Alert variant="destructive">{passwordError}</Alert>}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currentPassword">Password saat ini</Label>
              <Input
                type="password"
                autoComplete="current-password"
                {...a11y('currentPassword', pe.currentPassword?.message)}
                {...passwordForm.register('currentPassword')}
              />
              {errorText('currentPassword', pe.currentPassword?.message)}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="newPassword">Password baru</Label>
              <Input
                type="password"
                autoComplete="new-password"
                {...a11y('newPassword', pe.newPassword?.message)}
                {...passwordForm.register('newPassword')}
              />
              {errorText('newPassword', pe.newPassword?.message)}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmPassword">Ulangi password baru</Label>
              <Input
                type="password"
                autoComplete="new-password"
                {...a11y('confirmPassword', pe.confirmPassword?.message)}
                {...passwordForm.register('confirmPassword')}
              />
              {errorText('confirmPassword', pe.confirmPassword?.message)}
            </div>
            <Button type="submit" className="self-start" loading={passwordForm.formState.isSubmitting}>
              {passwordForm.formState.isSubmitting ? 'Menyimpan…' : 'Ubah password'}
            </Button>
          </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PreferencesCard() {
  const { state, setUser } = useAuth();
  const prefs = useUpdatePreferences();
  const test = useSendTestReminder();
  const [goal, setGoal] = useState(state.user?.weeklyGoal ? String(state.user.weeklyGoal) : '');
  const { has } = usePlan();
  const [upgradeDialog, promptUpgrade] = useUpgradePrompt();
  const allowReminders = has('reminders');
  // Pengingat email termasuk paket Standar ke atas.
  const reminders = allowReminders && (state.user?.emailReminders ?? true);

  const save = (input: { emailReminders?: boolean; weeklyGoal?: number | null }, message: string) =>
    prefs.mutate(input, {
      onSuccess: (user) => {
        setUser(user);
        toast.success(message);
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Gagal menyimpan pengaturan'),
    });

  const sendTest = () =>
    test.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(
          r.previewMode
            ? 'Email uji dibuat. SMTP belum diatur admin, jadi email disimpan sebagai preview di server.'
            : `Email uji dikirim ke ${state.user?.email}`,
        ),
      onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Gagal mengirim email uji'),
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pengingat & target</CardTitle>
        <CardDescription>Atur email pengingat harian dan target lamaran per minggu.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {upgradeDialog}
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="email-reminders" className="flex items-center gap-2">
              Pengingat email harian
              {!allowReminders && <PlanBadge plan="standard" />}
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Setiap pagi (±07.00 WIB) kami kirim daftar jadwal interview, follow-up, dan tugas yang jatuh tempo hari ini
              atau terlewat ke {state.user?.email}.
            </p>
          </div>
          <button
            id="email-reminders"
            type="button"
            role="switch"
            aria-checked={reminders}
            disabled={prefs.isPending}
            onClick={() =>
              allowReminders
                ? save({ emailReminders: !reminders }, !reminders ? 'Pengingat email diaktifkan' : 'Pengingat email dimatikan')
                : promptUpgrade('reminders')
            }
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              reminders ? 'bg-primary' : 'bg-[#cbd5e1]',
            )}
          >
            <span
              className={cn(
                'inline-block size-5 rounded-full bg-white shadow transition-transform',
                reminders ? 'translate-x-[22px]' : 'translate-x-0.5',
              )}
            />
            <span className="sr-only">{reminders ? 'Aktif' : 'Nonaktif'}</span>
          </button>
        </div>
        {reminders && (
          <Button variant="outline" size="sm" className="self-start" loading={test.isPending} onClick={sendTest}>
            Kirim email uji sekarang
          </Button>
        )}

        <form
          className="flex flex-col gap-1.5 border-t pt-5"
          onSubmit={(e) => {
            e.preventDefault();
            save(
              { weeklyGoal: goal === '' ? null : Number(goal) },
              goal === '' ? 'Target mingguan dihapus' : `Target diatur: ${goal} lamaran/minggu`,
            );
          }}
        >
          <Label htmlFor="weekly-goal-setting">Target lamaran per minggu</Label>
          <p className="text-xs text-muted-foreground">Kosongkan untuk tidak memakai target.</p>
          <div className="mt-1 flex gap-2">
            <Input
              id="weekly-goal-setting"
              type="number"
              min={1}
              max={200}
              inputMode="numeric"
              placeholder="mis. 10"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-32"
            />
            <Button type="submit" variant="outline" loading={prefs.isPending}>
              Simpan target
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}