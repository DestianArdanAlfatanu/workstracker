import { SOURCE_LABELS, STATUS_LABELS, WORK_TYPE_LABELS, type ApplicationDetail } from '@wt/shared';
import { Download, ExternalLink, FileText, ListTodo, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AiAssistantDialog } from './ai/AiAssistantDialog';
import type { ReactNode } from 'react';
import { formatDate, formatDateTime, formatSalaryRange } from '@/lib/format';
import { downloadCv, useApplication, useTasks } from '@/lib/queries';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { QuickAddTask, TaskItem } from './tasks';
import { useApplicationUI } from './application-ui';
import { usePlan } from './plan';
import { DueBadge, STATUS_STYLE, StatusSelect } from './status';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet';
import { Skeleton } from './ui/skeleton';

export function ApplicationDetailSheet({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data, isPending, isError } = useApplication(id);

  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        {isPending || !data ? (
          <div className="flex flex-col gap-4 p-5">
            <SheetTitle className="sr-only">Detail lamaran</SheetTitle>
            {isError ? (
              <Alert variant="destructive">Lamaran tidak ditemukan atau gagal dimuat.</Alert>
            ) : (
              <>
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-40 w-full" />
              </>
            )}
          </div>
        ) : (
          <DetailBody app={data} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({ app }: { app: ApplicationDetail }) {
  const ui = useApplicationUI();
  const [aiOpen, setAiOpen] = useState(false);
  const plan = usePlan();
  const canTasks = plan.has('tasks');
  const canCv = plan.has('attachments');
  return (
    <>
      <AiAssistantDialog app={app} open={aiOpen} onOpenChange={setAiOpen} />
      <div className="flex flex-col gap-3 border-b p-5 pr-12">
        <div>
          <SheetTitle className="text-lg font-semibold leading-tight">{app.position}</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">{app.company}</SheetDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusSelect
            value={app.status}
            label={`Ubah status lamaran ${app.company}`}
            disabled={ui.pendingStatusId === app.id}
            onChange={(s) => ui.changeStatus(app, s)}
          />
          <DueBadge date={app.nextActionDate} status={app.status} />
        </div>
        <Button
          onClick={() => setAiOpen(true)}
          className="bg-[#0f172a] text-white hover:bg-[#1e293b]"
        >
          <Sparkles />
          AI Assistant: cover letter & persiapan interview
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <dl className="grid grid-cols-[minmax(0,8.5rem)_1fr] gap-x-3 gap-y-2.5 text-sm">
          <Row label="Tanggal lamar">{formatDate(app.appliedAt)}</Row>
          <Row label="Sumber">{SOURCE_LABELS[app.source]}</Row>
          <Row label="Lokasi">{app.location ?? '-'}</Row>
          <Row label="Tipe kerja">{app.workType ? WORK_TYPE_LABELS[app.workType] : '-'}</Row>
          <Row label="Gaji">{formatSalaryRange(app.salaryMin, app.salaryMax)}</Row>
          <Row label="Lowongan">
            {app.jobUrl ? (
              <a
                href={app.jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 break-all text-primary underline underline-offset-2"
              >
                Buka lowongan
                <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                <span className="sr-only">(tab baru)</span>
              </a>
            ) : (
              '-'
            )}
          </Row>
          <Row label="Kontak HR">
            {app.contactName || app.contactEmail ? (
              <span className="flex flex-col">
                {app.contactName && <span>{app.contactName}</span>}
                {app.contactEmail && (
                  <a href={`mailto:${app.contactEmail}`} className="break-all text-primary underline underline-offset-2">
                    {app.contactEmail}
                  </a>
                )}
              </span>
            ) : (
              '-'
            )}
          </Row>
          <Row label="Tindak lanjut">
            {app.nextActionDate ? (
              <span className="flex flex-col">
                <span>{formatDate(app.nextActionDate)}</span>
                {app.nextActionNote && <span className="text-muted-foreground">{app.nextActionNote}</span>}
              </span>
            ) : (
              '-'
            )}
          </Row>
          <Row label="CV dipakai">
            {!canCv ? (
              <span className="text-muted-foreground">Fitur CV Saya ada di paket Standar</span>
            ) : app.cv ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="font-medium">{app.cv.label}</span>
                {app.cv.archived && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">versi lama</span>
                )}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                  onClick={() => app.cv && downloadCv(app.cv).catch(() => toast.error('Gagal mengunduh CV'))}
                >
                  <Download className="size-3.5" aria-hidden />
                  Unduh
                </button>
                <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => ui.openEdit(app)}>
                  Ganti
                </button>
              </span>
            ) : (
              <span className="text-muted-foreground">
                Belum dipilih.{' '}
                <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => ui.openEdit(app)}>
                  Pilih CV
                </button>{' '}
                atau{' '}
                <Link to="/cv" className="text-primary underline-offset-2 hover:underline">
                  kelola CV Saya
                </Link>
              </span>
            )}
          </Row>
        </dl>

        {app.jobDescription && (
          <details className="mt-6 rounded-xl border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Deskripsi lowongan</summary>
            <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">{app.jobDescription}</p>
          </details>
        )}

        {app.notes && (
          <section className="mt-6">
            <h3 className="mb-2 text-sm font-semibold">Catatan</h3>
            <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{app.notes}</p>
          </section>
        )}


        {canTasks && <ApplicationTasks applicationId={app.id} />}

        <section className="mt-6">
          <h3 className="mb-3 text-sm font-semibold">Riwayat status</h3>
          <ol className="relative flex flex-col gap-4 border-l pl-5">
            {[...app.history].reverse().map((h) => {
              const Icon = STATUS_STYLE[h.toStatus].icon;
              return (
                <li key={h.id} className="relative">
                  <span
                    className={`absolute -left-[1.85rem] top-0 flex size-5 items-center justify-center rounded-full text-white ring-4 ring-card ${STATUS_STYLE[h.toStatus].bar}`}
                  >
                    <Icon className="size-3" aria-hidden />
                  </span>
                  <p className="text-sm font-medium">
                    {h.fromStatus
                      ? `${STATUS_LABELS[h.fromStatus]} → ${STATUS_LABELS[h.toStatus]}`
                      : `Dibuat sebagai ${STATUS_LABELS[h.toStatus]}`}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(h.changedAt)}</p>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <div className="flex gap-2 border-t p-4">
        <Button variant="outline" className="flex-1" onClick={() => ui.openEdit(app)}>
          <Pencil />
          Edit
        </Button>
        <Button
          variant="outline"
          className="flex-1 text-destructive hover:bg-red-50 hover:text-destructive"
          onClick={() => ui.requestDelete(app)}
        >
          <Trash2 />
          Hapus
        </Button>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function ApplicationTasks({ applicationId }: { applicationId: number }) {
  const { data } = useTasks({ status: 'all', applicationId });
  const open = data?.filter((t) => !t.done).length ?? 0;
  return (
    <section className="mt-6">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        <ListTodo className="size-4" aria-hidden />
        Tugas
        <span className="font-normal text-muted-foreground">({open} belum selesai)</span>
      </h3>
      {!!data?.length && (
        <ul className="divide-y">
          {data.map((t) => (
            <TaskItem key={t.id} task={t} showApplication={false} />
          ))}
        </ul>
      )}
      <div className="mt-2">
        <QuickAddTask applicationId={applicationId} stacked />
      </div>
    </section>
  );
}