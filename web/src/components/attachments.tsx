import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_PER_APPLICATION, ATTACHMENT_TYPES, type Attachment } from '@wt/shared';
import { Download, FileImage, FileText, Paperclip, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { downloadAttachment, useDeleteAttachment, useUploadAttachment } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { errorMessage } from './application-ui';
import { Button } from './ui/button';

const ACCEPT = Object.keys(ATTACHMENT_TYPES).join(',');

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Validasi di browser agar pengguna dapat pesan langsung sebelum upload. */
function validate(file: File) {
  if (!ATTACHMENT_TYPES[file.type]) return 'Format tidak didukung. Gunakan PDF, DOC, DOCX, PNG, atau JPG.';
  if (file.size > ATTACHMENT_MAX_BYTES) return `Ukuran file maksimal ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB`;
  return null;
}

export function AttachmentsSection({ applicationId, items }: { applicationId: number; items: Attachment[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const upload = useUploadAttachment();
  const remove = useDeleteAttachment();
  const isDemo = useAuth().state.user?.isDemo ?? false;
  const full = items.length >= ATTACHMENT_MAX_PER_APPLICATION;

  const uploadFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const error = validate(file);
      if (error) {
        toast.error(`${file.name}: ${error}`);
        continue;
      }
      try {
        await upload.mutateAsync({ applicationId, file });
        toast.success(`${file.name} diunggah`);
      } catch (e) {
        toast.error(`${file.name}: ${errorMessage(e)}`);
      }
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!full) void uploadFiles(e.dataTransfer.files);
  };

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Paperclip className="size-4" aria-hidden />
        Lampiran
        <span className="font-normal text-muted-foreground">({items.length})</span>
      </h3>
      {items.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1.5">
          {items.map((a) => {
            const Icon = a.mimeType.startsWith('image/') ? FileImage : FileText;
            return (
              <li key={a.id} className="flex items-center gap-2.5 rounded-xl border px-3 py-2">
                <Icon className="size-5 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={a.originalName}>
                    {a.originalName}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatSize(a.size)} · {formatDate(a.createdAt.slice(0, 10))}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => downloadAttachment(a).catch((e) => toast.error(errorMessage(e)))}
                >
                  <Download />
                  <span className="sr-only">Unduh {a.originalName}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate(a.id, {
                      onSuccess: () => toast.success(`${a.originalName} dihapus`),
                      onError: (e) => toast.error(errorMessage(e)),
                    })
                  }
                >
                  <Trash2 />
                  <span className="sr-only">Hapus {a.originalName}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {isDemo && (
        <p className="rounded-xl border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
          Upload CV tidak tersedia di mode demo.
        </p>
      )}
      {!full && !isDemo && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center gap-1 rounded-xl border border-dashed px-3 py-4 text-center transition-colors',
            dragOver ? 'border-primary bg-accent' : 'border-[#c5cad9]',
          )}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={upload.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {!upload.isPending && <Upload />}
            {upload.isPending ? 'Mengunggah…' : 'Unggah CV / dokumen'}
          </Button>
          <p className="text-[11px] text-muted-foreground">PDF, DOC, DOCX, PNG, JPG · maks. 5 MB · atau seret file ke sini</p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              if (e.target.files) void uploadFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </section>
  );
}
