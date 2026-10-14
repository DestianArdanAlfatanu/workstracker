import { zodResolver } from '@hookform/resolvers/zod';
import { careerProfileSchema, type CareerProfile } from '@wt/shared';
import { Info, Sparkles } from 'lucide-react';
import { useEffect, useId, type ReactNode } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import { errorMessage } from '@/components/application-ui';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useCareerProfile, useSaveCareerProfile } from '@/lib/queries';
import { cn } from '@/lib/utils';

type Values = Record<'headline' | 'city' | 'summary' | 'skills' | 'experience' | 'education' | 'achievements', string>;
const resolver = zodResolver(careerProfileSchema) as unknown as Resolver<Values>;

const toValues = (p?: CareerProfile): Values => ({
  headline: p?.headline ?? '',
  city: p?.city ?? '',
  summary: p?.summary ?? '',
  skills: p?.skills ?? '',
  experience: p?.experience ?? '',
  education: p?.education ?? '',
  achievements: p?.achievements ?? '',
});

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hint && <p className="-mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      {children(id)}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

export function CareerProfilePage() {
  const { data, isPending } = useCareerProfile();
  const save = useSaveCareerProfile();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Values>({ resolver, defaultValues: toValues() });

  useEffect(() => {
    if (data) reset(toValues(data));
  }, [data, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync(values);
      reset(toValues(saved));
      toast.success('Profil karier disimpan');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  if (isPending) return <Skeleton className="h-96 max-w-3xl rounded-2xl bg-card" />;
  const completeness = data?.completeness ?? 0;

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-3xl flex-col gap-4">
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <div className="flex-1">
            <h2 className="font-bold">Bahan untuk AI Career Assistant</h2>
            <p className="text-sm text-muted-foreground">
              Cover letter & persiapan interview hanya memakai fakta dari profil ini (dan CV yang Anda pilih). Semakin
              lengkap dan spesifik, semakin personal hasilnya.
            </p>
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs font-medium">
            <span>Kelengkapan profil</span>
            <span className="tabular-nums">{completeness}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--chart-track)]" role="progressbar" aria-valuenow={completeness} aria-valuemin={0} aria-valuemax={100} aria-label="Kelengkapan profil">
            <div
              className={cn('h-full rounded-full transition-[width]', completeness >= 60 ? 'bg-[#1baf7a]' : 'bg-primary')}
              style={{ width: `${completeness}%` }}
            />
          </div>
        </div>
      </Card>

      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Headline" hint="mis. Frontend Engineer · 3 tahun pengalaman React" error={errors.headline?.message}>
          {(id) => <Input id={id} {...register('headline')} />}
        </Field>
        <Field label="Kota domisili" hint="Dipakai di kop surat lamaran" error={errors.city?.message}>
          {(id) => <Input id={id} {...register('city')} placeholder="mis. Jakarta" />}
        </Field>
        <div className="sm:col-span-2">
          <Field label="Ringkasan" hint="2–4 kalimat tentang diri, keahlian utama, dan target karier." error={errors.summary?.message}>
            {(id) => <Textarea id={id} rows={3} {...register('summary')} />}
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Skill" hint="Pisahkan dengan koma, mis. React, TypeScript, Figma, komunikasi." error={errors.skills?.message}>
            {(id) => <Textarea id={id} rows={2} {...register('skills')} />}
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field
            label="Pengalaman kerja / proyek"
            hint="Per pengalaman: posisi, perusahaan, periode, tanggung jawab & hasil (pakai angka bila ada)."
            error={errors.experience?.message}
          >
            {(id) => (
              <Textarea
                id={id}
                rows={8}
                {...register('experience')}
                placeholder={'Frontend Developer — PT Contoh (2023–sekarang)\n- Membangun dashboard admin React yang dipakai 200+ staf\n- Mempercepat waktu muat halaman 40%'}
              />
            )}
          </Field>
        </div>
        <Field label="Pendidikan" error={errors.education?.message}>
          {(id) => <Textarea id={id} rows={3} {...register('education')} placeholder="S1 Informatika — Universitas X (2019–2023)" />}
        </Field>
        <Field label="Pencapaian & sertifikasi" error={errors.achievements?.message}>
          {(id) => <Textarea id={id} rows={3} {...register('achievements')} />}
        </Field>
      </Card>

      <Alert variant="info">
        <Info aria-hidden />
        Jangan masukkan data sensitif seperti NIK, alamat lengkap, atau nomor rekening. Data ini dikirim ke penyedia AI
        hanya saat Anda membuat cover letter atau persiapan interview.
      </Alert>

      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
          {isSubmitting ? 'Menyimpan…' : 'Simpan profil'}
        </Button>
      </div>
    </form>
  );
}
