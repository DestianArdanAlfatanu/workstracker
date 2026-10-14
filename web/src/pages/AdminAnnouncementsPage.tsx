import { zodResolver } from '@hookform/resolvers/zod';
import { announcementSchema, type Announcement, type AnnouncementInput, type AnnouncementLevel } from '@wt/shared';
import { Eye, EyeOff, Megaphone, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import { errorMessage } from '@/components/application-ui';
import { ConfirmDialog, EmptyState } from '@/components/common';
import { AnnouncementCard, LEVEL_META } from '@/components/dashboard-extras';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format';
import {
  useAdminAnnouncements,
  useCreateAnnouncement,
  useDeleteAnnouncement,
  useUpdateAnnouncement,
} from '@/lib/queries';
import { cn } from '@/lib/utils';

type FormValues = { title: string; body: string; level: AnnouncementLevel; published: boolean };
const resolver = zodResolver(announcementSchema) as unknown as Resolver<FormValues>;

export function AdminAnnouncementsPage() {
  const { data, isPending, isError } = useAdminAnnouncements();
  const update = useUpdateAnnouncement();
  const remove = useDeleteAnnouncement();
  const [editing, setEditing] = useState<{ open: boolean; item: Announcement | null }>({ open: false, item: null });
  const [toDelete, setToDelete] = useState<Announcement | null>(null);

  const togglePublish = (a: Announcement) =>
    update.mutate(
      { id: a.id, input: { published: !a.published } },
      {
        onSuccess: () => toast.success(a.published ? 'Pengumuman ditarik' : 'Pengumuman ditayangkan ke semua pembeli'),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Pengumuman yang ditayangkan muncul di dashboard dan notifikasi semua pembeli.
        </p>
        <Button onClick={() => setEditing({ open: true, item: null })}>
          <Plus />
          Buat pengumuman
        </Button>
      </div>

      {isError && <Alert variant="destructive">Gagal memuat pengumuman.</Alert>}

      {isPending ? (
        <Skeleton className="h-40 w-full rounded-2xl bg-card" />
      ) : !data?.length ? (
        <Card>
          <EmptyState
            icon={Megaphone}
            title="Belum ada pengumuman"
            description="Bagikan info fitur baru, promo, atau jadwal maintenance ke semua pembeli."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((a) => (
            <li key={a.id}>
              <Card className="flex flex-col gap-3 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold',
                        a.published ? 'bg-green-100 text-green-800' : 'bg-zinc-100 text-zinc-700',
                      )}
                    >
                      {a.published ? <Eye className="size-3" aria-hidden /> : <EyeOff className="size-3" aria-hidden />}
                      {a.published ? 'Tayang' : 'Draf'}
                    </span>
                    <span className="text-muted-foreground">
                      {a.published && a.publishedAt
                        ? `Ditayangkan ${formatDateTime(a.publishedAt)}`
                        : `Dibuat ${formatDateTime(a.createdAt)}`}
                    </span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal />
                        <span className="sr-only">Aksi untuk {a.title}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-xl">
                      <DropdownMenuItem onSelect={() => setEditing({ open: true, item: a })}>
                        <Pencil />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => togglePublish(a)}>
                        {a.published ? <EyeOff /> : <Eye />}
                        {a.published ? 'Tarik (jadikan draf)' : 'Tayangkan'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setToDelete(a)}>
                        <Trash2 />
                        Hapus
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <AnnouncementCard a={a} />
              </Card>
            </li>
          ))}
        </ul>
      )}

      <AnnouncementDialog
        open={editing.open}
        item={editing.item}
        onOpenChange={(open) => setEditing((s) => ({ ...s, open }))}
      />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Hapus pengumuman?"
        description={`"${toDelete?.title}" akan dihapus untuk semua pembeli.`}
        confirmLabel="Hapus"
        destructive
        onConfirm={() => {
          const target = toDelete;
          setToDelete(null);
          if (target)
            remove.mutate(target.id, {
              onSuccess: () => toast.success('Pengumuman dihapus'),
              onError: (e) => toast.error(errorMessage(e)),
            });
        }}
      />
    </div>
  );
}

function AnnouncementDialog({
  open,
  item,
  onOpenChange,
}: {
  open: boolean;
  item: Announcement | null;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateAnnouncement();
  const update = useUpdateAnnouncement();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver });

  useEffect(() => {
    if (open) {
      reset(
        item
          ? { title: item.title, body: item.body, level: item.level, published: item.published }
          : { title: '', body: '', level: 'info', published: true },
      );
    }
  }, [open, item, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const input = values as AnnouncementInput;
    try {
      if (item) await update.mutateAsync({ id: item.id, input });
      else await create.mutateAsync(input);
      toast.success(item ? 'Pengumuman diperbarui' : input.published ? 'Pengumuman ditayangkan' : 'Draf disimpan');
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? 'Edit pengumuman' : 'Buat pengumuman'}</DialogTitle>
          <DialogDescription>Tampil di dashboard semua pembeli sampai mereka menutupnya.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ann-title">Judul</Label>
            <Input id="ann-title" aria-invalid={!!errors.title} {...register('title')} placeholder="mis. Fitur baru: Board Kanban" />
            {errors.title && <p className="text-xs font-medium text-destructive">{errors.title.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ann-body">Isi</Label>
            <Textarea id="ann-body" rows={5} aria-invalid={!!errors.body} {...register('body')} />
            {errors.body && <p className="text-xs font-medium text-destructive">{errors.body.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ann-level">Jenis</Label>
            <Controller
              control={control}
              name="level"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="ann-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(LEVEL_META) as AnnouncementLevel[]).map((l) => (
                      <SelectItem key={l} value={l}>
                        {LEVEL_META[l].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <Controller
            control={control}
            name="published"
            render={({ field }) => (
              <label className="flex items-center gap-2.5 text-sm">
                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                Tayangkan sekarang (jika tidak, disimpan sebagai draf)
              </label>
            )}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
