import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scrapePage } from '../src/lib/scrape';

const page = (html: string) => new DOMParser().parseFromString(html, 'text/html');

/** Halaman lowongan asli yang dipangkas (scripts/capture-fixtures.mjs); baris pertama berisi URL aslinya. */
function fixture(name: string) {
  const raw = readFileSync(resolve(__dirname, 'fixtures', `${name}.html`), 'utf8');
  const url = /<!-- (\S+) -->/.exec(raw)![1];
  return scrapePage(page(raw), url);
}

describe('portal loker (halaman asli)', () => {
  it.each([
    ['dealls', { site: 'dealls', company: 'ORDO Apps', position: 'Manual Quality Assurance', location: 'Surabaya', workType: 'onsite', salaryMin: 3_000_000, salaryMax: 3_000_000 }],
    ['glints', { site: 'glints', company: 'Tujuh Sembilan', position: 'Fullstack Developer', location: 'Jakarta Selatan, DKI Jakarta', salaryMin: 7_000_000, salaryMax: 10_000_000, deadline: '2026-10-31' }],
    ['kitalulus', { site: 'kitalulus', company: 'Misi Seru - KitaLulus', location: 'Jakarta Timur, DKI Jakarta', workType: 'remote', deadline: '2026-12-31' }],
    ['loker_id', { site: 'loker_id', company: 'PT CORE JAYA PRATAMA', position: 'Admin Pilates', location: 'Jakarta Utara, DKI Jakarta' }],
    ['kalibrr', { site: 'kalibrr', company: 'Ruangguru', position: 'Sales Trainee Academy By Ruangguru Bandung Antapani', location: 'Bandung, Jawa Barat', workType: 'onsite', deadline: '2026-12-14' }],
    ['jobstreet', { site: 'jobstreet', company: 'PT Buana Finance Tbk', position: 'IT Application Developer', location: 'Jakarta Selatan, Jakarta Raya' }],
    ['karirhub', { site: 'karirhub', company: 'Ruangguru', location: 'Kab. Cianjur, Jawa Barat', salaryMin: null, deadline: '2026-12-14' }],
    ['indeed', { site: 'indeed', company: 'PT Sinar Digital Nusantara', position: 'Frontend Developer', location: 'Jakarta Selatan, Jakarta Raya', salaryMin: 8_000_000, salaryMax: 12_000_000 }],
  ])('%s', (name, expected) => {
    const r = fixture(name);
    expect(r).toMatchObject(expected);
    expect(r.description?.length ?? 0).toBeGreaterThan(30);
  });
});

describe('format gaji & tanggal', () => {
  const salaryOf = (text: string) => {
    const r = scrapePage(page(`<main><h1>Staff</h1><p>${text}</p></main>`), 'https://karir.contoh.co.id/a');
    return [r.salaryMin, r.salaryMax];
  };
  it.each([
    ['Gaji: Rp 5 – 7 jt per bulan', [5_000_000, 7_000_000]],
    ['Salary IDR 5.000.000 - 7.000.000/bulan', [5_000_000, 7_000_000]],
    ['Gaji Rp8,000,000/month', [8_000_000, 8_000_000]],
    ['Gaji Rp 4,5 juta', [4_500_000, 4_500_000]],
    ['Gaji: Dirahasiakan', [null, null]],
    ['Salary Rp 120.000.000 per tahun', [null, null]],
  ])('%s', (text, expected) => expect(salaryOf(text)).toEqual(expected));

  it('validThrough ISO (UTC) → tanggal WIB', () => {
    const ld = { '@type': 'JobPosting', title: 'Kasir', hiringOrganization: 'Toko A', validThrough: '2026-11-30T17:00:00.000Z', employmentType: ['FULL_TIME'] };
    const r = scrapePage(page(`<script type="application/ld+json">${JSON.stringify(ld)}</script>`), 'https://dealls.com/loker/kasir~toko-a');
    expect(r).toMatchObject({ deadline: '2026-12-01', company: 'Toko A' });
  });
});

describe('LinkedIn', () => {
  it('membaca tampilan lowongan (login) tanpa JSON-LD', () => {
    const doc = page(`
      <title>(3) Frontend Engineer | Gojek | LinkedIn</title>
      <main>
        <div class="job-details-jobs-unified-top-card__company-name"><a href="#">Gojek</a></div>
        <div class="job-details-jobs-unified-top-card__job-title"><h1>Frontend Engineer</h1></div>
        <div class="job-details-jobs-unified-top-card__primary-description-container">
          <span class="tvm__text">Jakarta, Indonesia</span><span class="tvm__text"> · 2 days ago</span>
        </div>
        <div class="job-details-preferences-and-skills">Hybrid Full-time Rp8,000,000/month - Rp12,000,000/month</div>
        <div id="job-details"><p>About the role</p><ul><li>Build React apps</li><li>Write tests</li></ul></div>
      </main>`);
    const r = scrapePage(doc, 'https://www.linkedin.com/jobs/search/?currentJobId=4012345678');
    expect(r).toMatchObject({
      site: 'linkedin',
      position: 'Frontend Engineer',
      company: 'Gojek',
      location: 'Jakarta, Indonesia',
      workType: 'hybrid',
      salaryMin: 8_000_000,
      salaryMax: 12_000_000,
    });
    expect(r.description).toContain('- Build React apps');
    expect(r.description).toContain('- Write tests');
  });

  it('memakai JSON-LD JobPosting (versi publik) dan cadangan judul tab', () => {
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: 'Data Analyst',
      hiringOrganization: { '@type': 'Organization', name: 'PT Arunika Data' },
      jobLocation: { address: { addressLocality: 'Bandung', addressRegion: 'Jawa Barat' } },
      jobLocationType: 'TELECOMMUTE',
      description: '<p>Kualifikasi:</p><ul><li>SQL</li><li>Python</li></ul>',
    };
    const r = scrapePage(
      page(`<title>Data Analyst | PT Arunika Data | LinkedIn</title><script type="application/ld+json">${JSON.stringify(ld)}</script>`),
      'https://www.linkedin.com/jobs/view/data-analyst-at-arunika-4099999999',
    );
    expect(r).toMatchObject({ position: 'Data Analyst', company: 'PT Arunika Data', location: 'Bandung, Jawa Barat', workType: 'remote' });
    expect(r.description).toContain('- SQL');

    const fromTitle = scrapePage(page('<title>UI Designer at Traveloka | LinkedIn</title>'), 'https://www.linkedin.com/jobs/view/4011111111/');
    expect(fromTitle).toMatchObject({ position: 'UI Designer', company: 'Traveloka' });
  });
});

describe('Instagram', () => {
  it('membaca akun & caption dari meta post', () => {
    const doc = page(`
      <meta property="og:title" content="Kopi Senja (@kopisenja.jogja) on Instagram" />
      <meta property="og:description" content="120 likes, 8 comments - kopisenja.jogja on October 10, 2026: &quot;WE ARE HIRING! Barista Yogyakarta. Kirim CV ke rekrutmen@kopisenja.id&quot;" />`);
    const r = scrapePage(doc, 'https://www.instagram.com/p/DAbc123/?img_index=1');
    expect(r).toMatchObject({ site: 'instagram', author: '@kopisenja.jogja', company: null, position: null });
    expect(r.caption).toContain('WE ARE HIRING! Barista Yogyakarta');
    expect(r.description).toBe(r.caption);
  });
});

describe('situs lain', () => {
  it('Jobstreet: JSON-LD dengan gaji bulanan rupiah', () => {
    const ld = {
      '@type': 'JobPosting',
      title: 'Staff Admin Gudang',
      hiringOrganization: 'PT Sinar Logistik',
      jobLocation: [{ address: { addressLocality: 'Surabaya' } }],
      baseSalary: { currency: 'IDR', value: { minValue: 4500000, maxValue: 5500000, unitText: 'MONTH' } },
      description: 'Teliti dan jujur',
    };
    const r = scrapePage(
      page(`<meta property="og:site_name" content="Jobstreet" /><script type="application/ld+json">${JSON.stringify(ld)}</script>`),
      'https://id.jobstreet.com/id/job/12345',
    );
    expect(r).toMatchObject({
      site: 'jobstreet',
      position: 'Staff Admin Gudang',
      company: 'PT Sinar Logistik',
      location: 'Surabaya',
      salaryMin: 4_500_000,
      salaryMax: 5_500_000,
    });
  });

  it('situs karier perusahaan: h1 & nama situs; JSON-LD rusak diabaikan', () => {
    const r = scrapePage(
      page(`<meta property="og:site_name" content="Karir Bank Contoh" /><script type="application/ld+json">{rusak</script>
            <main><h1>Management Trainee 2026</h1><p>Gaji Rp 6 juta - Rp 7,5 juta per bulan. Penempatan WFO.</p></main>`),
      'https://karir.bankcontoh.co.id/lowongan/mt-2026',
    );
    expect(r).toMatchObject({ site: 'other', position: 'Management Trainee 2026', company: 'Karir Bank Contoh' });
    expect(r.pageText).toContain('Gaji Rp 6 juta');
  });
});
