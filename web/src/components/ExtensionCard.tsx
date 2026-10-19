import { ExternalLink, Puzzle } from 'lucide-react';
import { CHROME_EXTENSION_URL } from '@/lib/config';
import { PlanBadge, usePlan, useUpgradePrompt } from './plan';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

/** Pengaturan: pasang Chrome Extension untuk menyimpan lowongan dari browser di komputer. */
export function ExtensionCard() {
  const { has } = usePlan();
  const [upgradeDialog, promptUpgrade] = useUpgradePrompt();
  const allowed = has('extension');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Puzzle className="size-5 text-primary" aria-hidden />
          Chrome Extension
          {!allowed && <PlanBadge plan="standard" />}
        </CardTitle>
        <CardDescription>
          Simpan lowongan dari browser di komputer dengan satu klik. Data lowongan terisi otomatis dari halaman yang sedang
          dibuka.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {upgradeDialog}
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Pasang extension dari Chrome Web Store, lalu sematkan ikonnya di toolbar.</li>
          <li>Pastikan Anda sudah masuk di website WorksTracker pada browser yang sama.</li>
          <li>Buka halaman lowongan, klik ikon WorksTracker, lalu Simpan.</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={CHROME_EXTENSION_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              Pasang dari Chrome Web Store
            </a>
          </Button>
          {!allowed && (
            <Button variant="outline" onClick={() => promptUpgrade('extension')}>
              Lihat paket Standar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
