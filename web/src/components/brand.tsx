import logoUrl from '@/assets/brand/workstracker-logo.svg';
import logoOnBlueUrl from '@/assets/brand/workstracker-logo-on-blue.svg';
import logoOnDarkUrl from '@/assets/brand/workstracker-logo-on-dark.svg';
import markUrl from '@/assets/brand/workstracker-mark.svg';
import { cn } from '@/lib/utils';

/** Warna resmi logo WorksTracker (sesuai berkas di folder assets/). */
export const BRAND_BLUE = '#1D4ED8';
export const BRAND_NAVY = '#0F172A';

/** File logo resmi (salinan dari assets/ di root proyek). */
export const LOGO_FILES = { light: logoUrl, dark: logoOnDarkUrl, blue: logoOnBlueUrl, mark: markUrl } as const;
/** Rasio lebar:tinggi logo lengkap (698×128). */
export const LOGO_RATIO = 698 / 128;

/** Ikon logo saja (kotak biru dengan "W"). */
export function LogoMark({ className }: { className?: string }) {
  return <img src={markUrl} alt="" aria-hidden className={cn('size-9 shrink-0', className)} draggable={false} />;
}

/**
 * Logo lengkap (ikon + tulisan WorksTracker).
 * `tone`: `light` = latar terang (tulisan navy), `dark` = latar gelap (tulisan putih), `blue` = latar biru.
 */
export function Logo({ className, tone = 'light' }: { className?: string; tone?: 'light' | 'dark' | 'blue' }) {
  return (
    <img
      src={LOGO_FILES[tone]}
      alt="WorksTracker"
      width={698}
      height={128}
      className={cn('h-8 w-auto shrink-0', className)}
      draggable={false}
    />
  );
}
