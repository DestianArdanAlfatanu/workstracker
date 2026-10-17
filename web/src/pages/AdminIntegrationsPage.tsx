import { CheckCircle2, CircleAlert, Mail, PlugZap, Sparkles, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/components/application-ui';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useIntegrations, useTestAi, useTestEmail } from '@/lib/queries';
import { cn } from '@/lib/utils';

function StatusBadge({ ok, okText, notText }: { ok: boolean; okText: string; notText: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        ok ? 'bg-[#dcf7e7] text-[#0f6b3a]' : 'bg-amber-100 text-amber-900',
      )}
    >
      {ok ? <CheckCircle2 className="size-3.5" aria-hidden /> : <CircleAlert className="size-3.5" aria-hidden />}
      {ok ? okText : notText}
    </span>
  );
}

function Section({
  icon: Icon,
  title,
  badge,
  children,
}: {
  icon: LucideIcon;
  title: string;
  badge: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <span className="flex size-9 items-center justify-center rounded-full bg-accent text-primary">
            <Icon className="size-[18px]" aria-hidden />
          </span>
          {title}
        </h2>
        {badge}
      </div>
      {children}
    </Card>
  );
}

const code = 'rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]';

export function AdminIntegrationsPage() {
  const { data, isPending, refetch } = useIntegrations();
  const testAi = useTestAi();
  const testEmail = useTestEmail();

  const runAi = () =>
    testAi.mutate(undefined, {
      onSuccess: (r) =>
        r.ok
          ? toast.success(`Gemini terhubung (${r.model}, ${((r.latencyMs ?? 0) / 1000).toFixed(1)} dtk)`)
          : toast.error(r.error ?? 'Tes AI gagal'),
      onError: (e) => toast.error(errorMessage(e)),
    });
  const runEmail = () =>
    testEmail.mutate(undefined, {
      onSuccess: (r) =>
        r.ok
          ? toast.success(r.previewMode ? 'SMTP belum diatur. Email disimpan sebagai preview di server.' : `Email uji dikirim ke ${r.to}`)
          : toast.error(r.error ?? 'Tes email gagal'),
      onError: (e) => toast.error(errorMessage(e)),
    });

  if (isPending || !data) return <Skeleton className="h-96 max-w-3xl rounded-2xl bg-card" />;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Alert variant="info">
        <PlugZap aria-hidden />
        <div>
          Keduanya berjalan di localhost selama komputer terhubung ke internet dan jendela API menyala, tanpa perlu
          hosting. Setelah mengubah <span className={code}>api/.env</span>, restart jendela "WorksTracker API".
        </div>
      </Alert>

      <Section
        icon={Sparkles}
        title="AI Career Assistant (Google Gemini)"
        badge={<StatusBadge ok={data.ai.configured} okText={data.ai.fake ? 'Mode palsu (AI_FAKE)' : 'API key terpasang'} notText="Belum diatur" />}
      >
        <p className="text-sm text-muted-foreground">
          Model: <span className={code}>{data.ai.model}</span>
        </p>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>
            Buka <strong>aistudio.google.com/apikey</strong> dengan akun Google, lalu <strong>Create API key</strong> dan salin
            kuncinya.
          </li>
          <li>
            Aktifkan <strong>billing (paid tier)</strong> pada project tersebut. Di tier gratis, data yang dikirim (termasuk CV
            pengguna) boleh dipakai Google untuk meningkatkan produknya, dan batas pemakaiannya sangat kecil.
          </li>
          <li>
            Tempel di <span className={code}>api/.env</span>: <span className={code}>GEMINI_API_KEY=...</span>, pastikan{' '}
            <span className={code}>AI_FAKE</span> kosong, lalu restart API.
          </li>
          <li>
            Disarankan: pasang <strong>budget alert</strong> di Google Cloud Billing sebagai pengaman biaya. Perkiraan modal ±Rp
            370 per kredit AI (sudah termasuk PPN 11%).
          </li>
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={runAi} loading={testAi.isPending} disabled={!data.ai.configured}>
            Tes koneksi AI
          </Button>
          <Button variant="ghost" onClick={() => void refetch()}>
            Muat ulang status
          </Button>
        </div>
        {testAi.data && (
          <Alert variant={testAi.data.ok ? 'info' : 'destructive'}>
            {testAi.data.ok ? `Berhasil. Balasan Gemini: "${testAi.data.reply}"` : testAi.data.error}
          </Alert>
        )}
      </Section>

      <Section
        icon={Mail}
        title="Email pengingat (SMTP)"
        badge={
          <StatusBadge
            ok={data.email.configured}
            okText="SMTP terpasang"
            notText={data.email.missingPassword ? 'Tinggal isi App Password' : 'Mode preview (belum kirim)'}
          />
        }
      >
        <p className="text-sm text-muted-foreground">
          {data.email.configured ? (
            <>
              Server: <span className={code}>{data.email.host}:{data.email.port}</span> · Pengirim:{' '}
              <span className={code}>{data.email.from}</span>
            </>
          ) : data.email.missingPassword ? (
            <>
              Akun <span className={code}>{data.email.from}</span> sudah diatur. Tinggal isi{' '}
              <span className={code}>SMTP_PASS</span> dengan App Password Gmail, lalu restart API. Sampai itu, email disimpan
              sebagai preview.
            </>
          ) : (
            <>
              Email belum benar-benar dikirim; isinya disimpan di <span className={code}>api/storage/mail-preview</span>.
            </>
          )}
        </p>
        <p className="text-sm font-semibold">Cara memakai Gmail:</p>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>
            Aktifkan <strong>Verifikasi 2 Langkah</strong> di akun Google (myaccount.google.com → Keamanan).
          </li>
          <li>
            Buka <strong>myaccount.google.com/apppasswords</strong>, buat App Password bernama "WorksTracker", salin 16 hurufnya.
          </li>
          <li>
            Isi di <span className={code}>api/.env</span>:{' '}
            <span className={code}>SMTP_HOST=smtp.gmail.com</span>, <span className={code}>SMTP_PORT=587</span>,{' '}
            <span className={code}>SMTP_USER=emailanda@gmail.com</span>, <span className={code}>SMTP_PASS=app-password</span>, lalu
            restart API.
          </li>
        </ol>
        <p className="text-xs text-muted-foreground">
          Pengingat dikirim tiap pagi ±07.00 WIB ke pengguna yang mengaktifkannya, selama API menyala. Gmail gratis dibatasi ±500
          email/hari.
        </p>
        <Button className="self-start" onClick={runEmail} loading={testEmail.isPending}>
          Kirim email uji ke saya
        </Button>
        {testEmail.data && (
          <Alert variant={testEmail.data.ok ? 'info' : 'destructive'}>
            {testEmail.data.ok
              ? testEmail.data.previewMode
                ? 'Mode preview: email disimpan sebagai file, belum dikirim. Isi SMTP untuk mengirim sungguhan.'
                : `Terkirim ke ${testEmail.data.to}. Cek inbox (dan folder Spam).`
              : testEmail.data.error}
          </Alert>
        )}
      </Section>
    </div>
  );
}
