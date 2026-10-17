import { STATUS_LABELS, type Application, type Status } from '@wt/shared';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { useChangeStatus, useDeleteApplication, useRestoreApplication } from '@/lib/queries';
import { ApplicationDetailSheet } from './ApplicationDetailSheet';
import { ApplicationFormDialog, type ApplicationPrefill } from './ApplicationFormDialog';
import { ConfirmDialog } from './common';

interface ApplicationUI {
  openCreate: () => void;
  /** Form Tambah lamaran yang sudah terisi (mis. dari loker yang dibagikan ke aplikasi). */
  openCreateWith: (prefill: ApplicationPrefill) => void;
  openEdit: (app: Application) => void;
  openDetail: (id: number) => void;
  requestDelete: (app: Pick<Application, 'id' | 'company'>) => void;
  changeStatus: (app: Pick<Application, 'id' | 'company'>, status: Status, onSettled?: () => void) => void;
  pendingStatusId: number | null;
}

const Ctx = createContext<ApplicationUI | null>(null);

export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.message : 'Terjadi kesalahan, coba lagi nanti';

/**
 * Menyediakan dialog form, sheet detail, dan konfirmasi hapus untuk seluruh aplikasi,
 * sehingga dashboard maupun daftar bisa membuka aksi yang sama.
 */
export function ApplicationUIProvider({ children }: { children: ReactNode }) {
  const [form, setForm] = useState<{ open: boolean; app: Application | null; prefill?: ApplicationPrefill }>({ open: false, app: null });
  const [detailId, setDetailId] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<Pick<Application, 'id' | 'company'> | null>(null);
  const [pendingStatusId, setPendingStatusId] = useState<number | null>(null);

  const statusMutation = useChangeStatus();
  const deleteMutation = useDeleteApplication();
  const restoreMutation = useRestoreApplication();

  const changeStatus = useCallback(
    (app: Pick<Application, 'id' | 'company'>, status: Status, onSettled?: () => void) => {
      setPendingStatusId(app.id);
      statusMutation.mutate(
        { id: app.id, status },
        {
          onSuccess: () => toast.success(`Status ${app.company} diubah ke ${STATUS_LABELS[status]}`),
          onError: (e) => toast.error(errorMessage(e)),
          onSettled: () => {
            setPendingStatusId(null);
            onSettled?.();
          },
        },
      );
    },
    [statusMutation],
  );

  const confirmDelete = () => {
    const target = toDelete;
    if (!target) return;
    setToDelete(null);
    deleteMutation.mutate(target.id, {
      onSuccess: () => {
        if (detailId === target.id) setDetailId(null);
        toast(`Lamaran ke ${target.company} dihapus`, {
          duration: 5000,
          action: {
            label: 'Undo',
            onClick: () =>
              restoreMutation.mutate(target.id, {
                onSuccess: () => toast.success(`Lamaran ke ${target.company} dipulihkan`),
                onError: (e) => toast.error(errorMessage(e)),
              }),
          },
        });
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  const value = useMemo<ApplicationUI>(
    () => ({
      openCreate: () => setForm({ open: true, app: null }),
      openCreateWith: (prefill) => setForm({ open: true, app: null, prefill: { ...prefill, id: Date.now() } }),
      openEdit: (app) => setForm({ open: true, app }),
      openDetail: setDetailId,
      requestDelete: setToDelete,
      changeStatus,
      pendingStatusId,
    }),
    [changeStatus, pendingStatusId],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <ApplicationFormDialog
        open={form.open}
        application={form.app}
        prefill={form.prefill}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
      />
      <ApplicationDetailSheet id={detailId} onClose={() => setDetailId(null)} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Hapus lamaran?"
        description={
          <>
            Lamaran ke <strong className="text-foreground">{toDelete?.company}</strong> akan dihapus. Anda masih bisa
            membatalkannya beberapa detik setelahnya.
          </>
        }
        confirmLabel="Hapus"
        destructive
        onConfirm={confirmDelete}
      />
    </Ctx.Provider>
  );
}

export function useApplicationUI() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApplicationUI harus dipakai di dalam ApplicationUIProvider');
  return ctx;
}
