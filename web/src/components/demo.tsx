import { FlaskConical, LogOut, MessageCircle, PlayCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BUY_MESSAGE, PRICE_PROMO, whatsappLink } from '@/lib/config';
import { formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './ui/button';

/** Tombol "Coba demo gratis": membuat akun demo sementara lalu masuk ke dashboard. */
export function TryDemoButton({ label = 'Coba demo gratis', className, ...props }: ButtonProps & { label?: string }) {
  const { startDemo } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    try {
      await startDemo();
      navigate('/', { replace: true });
      toast.success('Selamat datang di demo WorksTracker! Silakan coba semua fitur.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Gagal membuka demo, coba lagi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button type="button" variant="outline" loading={loading} onClick={() => void start()} className={className} {...props}>
      {!loading && <PlayCircle />}
      {loading ? 'Menyiapkan demo…' : label}
    </Button>
  );
}

/** Banner di aplikasi selama memakai akun demo. */
export function DemoBanner({ expiresAt, onExit }: { expiresAt: string | null; onExit: () => void }) {
  const hoursLeft = expiresAt ? Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 3_600_000)) : 24;
  return (
    <div
      role="status"
      className={cn(
        'mb-4 flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#14162b] to-[#2b3fd0] p-4 text-white sm:flex-row sm:items-center',
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15">
        <FlaskConical className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Anda sedang memakai mode demo</p>
        <p className="text-sm text-white/80">
          Data contoh ini akan dihapus dalam {hoursLeft} jam. Upload lampiran, email, dan ganti password dinonaktifkan;
          hasil AI berupa contoh.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild className="bg-white text-[#14162b] hover:bg-white/90">
          <a href={whatsappLink(BUY_MESSAGE)} target="_blank" rel="noopener noreferrer">
            <MessageCircle />
            Beli akses {formatRupiah(PRICE_PROMO)}
          </a>
        </Button>
        <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={onExit}>
          <LogOut />
          Keluar demo
        </Button>
      </div>
    </div>
  );
}
