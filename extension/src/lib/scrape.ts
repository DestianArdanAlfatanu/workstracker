/**
 * Membaca data lowongan dari halaman yang SEDANG dibuka user (dipanggil saat ikon extension diklik,
 * lewat chrome.scripting.executeScript). Fungsi ini disuntikkan ke tab, jadi harus mandiri:
 * tanpa import dan tanpa variabel dari luar fungsi.
 *
 * Urutan sumber data:
 *  1. JSON-LD `JobPosting` (Dealls, Glints, KitaLulus, Loker.id, LinkedIn publik, banyak situs karier)
 *  2. Pembaca khusus portal: Kalibrr (__NEXT_DATA__), Jobstreet (data-automation), Karirhub (label
 *     halaman), Indeed (data-testid), LinkedIn (tampilan). Selector dikumpulkan per portal di bawah
 *     agar mudah diperbarui saat portal mengubah tampilan.
 *  3. Judul halaman / meta og:*
 * Contoh halaman asli untuk tes ada di test/fixtures (ambil ulang: scripts/capture-fixtures.mjs).
 */

export type ScrapeSite =
  | 'linkedin'
  | 'instagram'
  | 'jobstreet'
  | 'glints'
  | 'kalibrr'
  | 'dealls'
  | 'kitalulus'
  | 'loker_id'
  | 'indeed'
  | 'karirhub'
  | 'other';

export interface ScrapeResult {
  site: ScrapeSite;
  url: string;
  pageTitle: string;
  company: string | null;
  position: string | null;
  location: string | null;
  workType: 'onsite' | 'hybrid' | 'remote' | null;
  salaryMin: number | null;
  salaryMax: number | null;
  /** Batas akhir melamar (YYYY-MM-DD, WIB) bila tertulis. */
  deadline: string | null;
  description: string | null;
  /** Instagram: akun pengunggah (@handle) & caption post. */
  author: string | null;
  caption: string | null;
  /** Teks halaman (dipotong) untuk "Isi dengan AI" di situs selain Instagram. */
  pageText: string;
}

export function scrapePage(doc: Document = document, href: string = location.href): ScrapeResult {
  /* ---------------------------- helper ---------------------------- */
  /** Nilai apa pun → teks rapi (daftar digabung koma; objek diabaikan). */
  const clean = (v: unknown): string | null => {
    let s: string;
    if (v == null) return null;
    if (Array.isArray(v)) s = v.map((x) => (typeof x === 'string' || typeof x === 'number' ? String(x) : '')).filter(Boolean).join(', ');
    else if (typeof v === 'string' || typeof v === 'number') s = String(v);
    else return null;
    const t = s.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return t || null;
  };
  const q = (sel: string) => {
    for (const one of sel.split('|')) {
      const el = doc.querySelector(one.trim());
      if (el) return el;
    }
    return null;
  };
  const textOf = (sel: string) => {
    for (const one of sel.split('|')) {
      const t = clean(doc.querySelector(one.trim())?.textContent);
      if (t) return t;
    }
    return null;
  };
  const meta = (name: string) =>
    clean(doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content'));

  /** Teks dari elemen HTML dengan baris baru untuk paragraf & poin (innerText tidak tersedia di semua lingkungan). */
  const blockText = (root: Element | null) => {
    if (!root) return null;
    const BLOCK = /^(P|DIV|LI|UL|OL|H[1-6]|BR|SECTION|ARTICLE|TR)$/;
    let out = '';
    const walk = (node: Node) => {
      if (node.nodeType === 3) {
        out += node.textContent ?? '';
        return;
      }
      if (node.nodeType !== 1) return;
      const el = node as Element;
      if (/^(SCRIPT|STYLE|NOSCRIPT|BUTTON|SVG)$/.test(el.tagName)) return;
      if (el.tagName === 'LI') out += '\n- ';
      else if (BLOCK.test(el.tagName)) out += '\n';
      el.childNodes.forEach(walk);
      if (BLOCK.test(el.tagName) && el.tagName !== 'LI') out += '\n';
    };
    walk(root);
    return clean(out.replace(/\n[ \t]+/g, '\n').replace(/\n- \s*\n/g, '\n'));
  };
  const htmlToText = (html: unknown) => {
    if (typeof html !== 'string' || !html.trim()) return null;
    const box = doc.createElement('div');
    box.innerHTML = html;
    return blockText(box);
  };

  const workTypeOf = (s: string | null | undefined): ScrapeResult['workType'] => {
    if (!s) return null;
    if (/\b(remote|jarak jauh|wfh|work from home|kerja dari rumah|telecommute)\b/i.test(s)) return 'remote';
    if (/\bhybrid\b/i.test(s)) return 'hybrid';
    if (/\b(on-?site|wfo|work from office|kerja di kantor|di kantor)\b/i.test(s)) return 'onsite';
    return null;
  };

  /** "8.000.000" / "8,5 jt" / "750rb" → rupiah penuh. */
  const amount = (num: string, unit: string | undefined) => {
    const u = (unit ?? '').toLowerCase();
    let value: number;
    if (/^(jt|juta)$/.test(u)) value = Number(num.replace(',', '.')) * 1_000_000;
    else if (/^(rb|ribu|k)$/.test(u)) value = Number(num.replace(',', '.')) * 1_000;
    else value = Number(num.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
    return Number.isFinite(value) && value >= 100_000 && value < 4_000_000_000 ? Math.round(value) : null;
  };
  /** Gaji bulanan dari teks: "Rp 5 – 7 jt", "IDR 5.000.000 - 7.000.000/bulan", "Rp8,000,000/month". */
  const salaryFrom = (s: string | null): [number | null, number | null] => {
    if (!s || /(dirahasiakan|negotiable|nego|kompetitif|competitive|undisclosed)/i.test(s)) return [null, null];
    if (/\b(year|yr|tahun|annual|hour|jam|hari|day)\b/i.test(s)) return [null, null];
    const range =
      /(?:rp\.?|idr)\s?([\d.,]+)\s*(jt|juta|rb|ribu|k)?(?:\s*\/\s*(?:month|mo|bulan|bln))?\s*(?:[-–—]|s\/d|sampai|hingga|to)\s*(?:rp\.?|idr)?\s?([\d.,]+)\s*(jt|juta|rb|ribu|k)?/i.exec(s);
    if (range) {
      const unit = range[2] ?? range[4];
      const a = amount(range[1], unit);
      const b = amount(range[3], range[4] ?? unit);
      if (a || b) return [a ?? b, b ?? a];
    }
    const single = /(?:rp\.?|idr)\s?([\d.,]+)\s*(jt|juta|rb|ribu|k)?/i.exec(s);
    const v = single ? amount(single[1], single[2]) : null;
    return [v, v];
  };

  /** Tanggal → YYYY-MM-DD (zona WIB). Mendukung ISO dan "14 Des 2026" / "31 October 2026". */
  const MONTHS: Record<string, number> = {
    jan: 1, januari: 1, january: 1, feb: 2, februari: 2, february: 2, mar: 3, maret: 3, march: 3,
    apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7,
    agu: 8, agt: 8, ags: 8, agustus: 8, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
    okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, november: 11, des: 12, desember: 12, dec: 12, december: 12,
  };
  const dateOf = (v: unknown): string | null => {
    const s = clean(v);
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return null;
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = /(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})/.exec(s);
    const month = m ? MONTHS[m[2].toLowerCase()] : undefined;
    if (!m || !month) return null;
    return `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  };

  /** "pt-maju-jaya-01a1…uuid" → "PT Maju Jaya". */
  const fromSlug = (slug: string | null | undefined) => {
    const s = (slug ?? '').replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '').replace(/-+/g, ' ').trim();
    if (!s) return null;
    return s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(Pt|Cv|Tbk|Ud)\b/g, (w) => w.toUpperCase());
  };

  /* --------------------------- situs --------------------------- */
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    url = new URL('about:blank');
  }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const SITES: Array<[RegExp, ScrapeSite]> = [
    [/(^|\.)linkedin\.com$/, 'linkedin'],
    [/(^|\.)instagram\.com$/, 'instagram'],
    [/(^|\.)jobstreet\.(com|co\.id)$/, 'jobstreet'],
    [/(^|\.)glints\.com$/, 'glints'],
    [/(^|\.)kalibrr\.(com|id)$/, 'kalibrr'],
    [/(^|\.)dealls\.com$/, 'dealls'],
    [/(^|\.)kitalulus\.com$/, 'kitalulus'],
    [/(^|\.)loker\.id$/, 'loker_id'],
    [/(^|\.)indeed\.com$/, 'indeed'],
    [/(^|\.)karirhub\.kemnaker\.go\.id$/, 'karirhub'],
  ];
  const site: ScrapeSite = SITES.find(([re]) => re.test(host))?.[1] ?? 'other';

  const result: ScrapeResult = {
    site,
    url: href,
    pageTitle: clean(doc.title) ?? '',
    company: null,
    position: null,
    location: null,
    workType: null,
    salaryMin: null,
    salaryMax: null,
    deadline: null,
    description: null,
    author: null,
    caption: null,
    pageText: '',
  };
  const setSalary = (min: number | null, max: number | null) => {
    if (result.salaryMin != null || (min == null && max == null)) return;
    let lo = min ?? max;
    let hi = max ?? min;
    if (lo != null && hi != null && hi < lo) [lo, hi] = [hi, lo];
    // Beberapa portal menulis gaji tetap sebagai rentang 1 rupiah (mis. 3.000.000–3.000.001).
    if (lo != null && hi != null && hi - lo <= 1) hi = lo;
    result.salaryMin = lo;
    result.salaryMax = hi;
  };

  /* ---------------------- 1. JSON-LD JobPosting ---------------------- */
  const postings: Array<Record<string, any>> = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      const data = JSON.parse(s.textContent ?? '');
      const items = Array.isArray(data) ? data : data?.['@graph'] ?? [data];
      for (const item of items) {
        const type = item?.['@type'];
        if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) postings.push(item);
      }
    } catch {
      /* JSON-LD rusak: abaikan */
    }
  });
  const jp = postings[0];
  if (jp) {
    result.position = clean(jp.title);
    const org = jp.hiringOrganization;
    result.company = clean(typeof org === 'string' ? org : org?.name);
    const loc = Array.isArray(jp.jobLocation) ? jp.jobLocation[0] : jp.jobLocation;
    const addr = loc?.address;
    if (typeof addr === 'string') result.location = clean(addr);
    else if (addr) {
      const parts = [clean(addr.addressLocality), clean(addr.addressRegion)].filter((p): p is string => !!p);
      result.location = clean([...new Set(parts)].join(', '));
    }
    const remote = jp.jobLocationType === 'TELECOMMUTE' || (Array.isArray(jp.jobLocationType) && jp.jobLocationType.includes('TELECOMMUTE'));
    result.workType = remote ? 'remote' : workTypeOf(clean(jp.employmentType));
    result.description = htmlToText(jp.description);
    result.deadline = dateOf(jp.validThrough);
    const bs = jp.baseSalary;
    const val = bs?.value;
    const unit = String(val?.unitText ?? bs?.unitText ?? 'MONTH').toUpperCase();
    const currency = String(bs?.currency ?? val?.currency ?? 'IDR').toUpperCase();
    if (val != null && /^(MONTH|BULAN|MONTHLY)$/.test(unit) && currency === 'IDR') {
      const num = (x: unknown) => (typeof x === 'number' || typeof x === 'string' ? Number(x) : NaN);
      const min = num(typeof val === 'object' ? val.minValue ?? val.value : val);
      const max = num(typeof val === 'object' ? val.maxValue ?? val.value : val);
      setSalary(Number.isFinite(min) && min > 0 ? Math.round(min) : null, Number.isFinite(max) && max > 0 ? Math.round(max) : null);
    }
  }

  /* --------------------------- 2. pembaca khusus --------------------------- */
  if (site === 'linkedin') {
    const LINKEDIN = {
      title:
        '.job-details-jobs-unified-top-card__job-title h1|.job-details-jobs-unified-top-card__job-title|.jobs-unified-top-card__job-title|.top-card-layout__title|h1.t-24|main h1',
      company:
        '.job-details-jobs-unified-top-card__company-name a|.job-details-jobs-unified-top-card__company-name|.jobs-unified-top-card__company-name|.topcard__org-name-link|.top-card-layout__second-subline a',
      location:
        '.job-details-jobs-unified-top-card__primary-description-container .tvm__text|.job-details-jobs-unified-top-card__bullet|.jobs-unified-top-card__bullet|.topcard__flavor--bullet',
      workplace:
        '.job-details-fit-level-preferences|.job-details-preferences-and-skills|.job-details-jobs-unified-top-card__workplace-type|.jobs-unified-top-card__workplace-type',
      description: '#job-details|.jobs-description__content|.jobs-box__html-content|.show-more-less-html__markup|.description__text',
    };
    result.position ??= textOf(LINKEDIN.title);
    result.company ??= textOf(LINKEDIN.company);
    result.location ??= textOf(LINKEDIN.location)?.split(/·|\n/)[0]?.trim() ?? null;
    const prefs = textOf(LINKEDIN.workplace);
    result.workType ??= workTypeOf(prefs);
    setSalary(...salaryFrom(prefs));
    result.description ??= blockText(q(LINKEDIN.description));
    // Cadangan dari judul tab: "Frontend Engineer | Gojek | LinkedIn" atau "(3) Frontend Engineer at Gojek | LinkedIn".
    const t = result.pageTitle.replace(/^\(\d+\)\s*/, '').replace(/\s*\|\s*LinkedIn\s*$/i, '');
    const parts = t.split(/\s+\|\s+/);
    if (parts.length >= 2) {
      result.position ??= clean(parts[0]);
      result.company ??= clean(parts[1]);
    } else {
      const at = /^(.+?)\s+(?:at|di)\s+(.+)$/i.exec(t);
      if (at) {
        result.position ??= clean(at[1]);
        result.company ??= clean(at[2]);
      }
    }
    if (result.position && /^(linkedin|jobs|lowongan)$/i.test(result.position)) result.position = null;
  }

  if (site === 'kalibrr') {
    // Kalibrr (Next.js): data lowongan lengkap ada di __NEXT_DATA__ → props.pageProps.job
    try {
      const job = JSON.parse(doc.getElementById('__NEXT_DATA__')?.textContent ?? '{}')?.props?.pageProps?.job;
      if (job) {
        result.position ??= clean(job.name);
        result.company ??= clean(job.company?.name ?? job.companyInfo?.name);
        const addr = clean(job.googleLocation?.formattedAddress);
        if (addr && !result.location) {
          const parts = addr
            .split(',')
            .map((p) => p.trim())
            .filter((p) => p && !/^indonesia$/i.test(p))
            .map((p) => /\(([^)]+)\)\s*$/.exec(p)?.[1] ?? p);
          result.location = clean(parts.slice(-2).join(', '));
        }
        result.workType ??= job.isWorkFromHome ? 'remote' : job.isHybrid ? 'hybrid' : 'onsite';
        const interval = String(job.salaryInterval ?? 'monthly').toLowerCase();
        const cur = String(job.salaryCurrency ?? 'IDR').toUpperCase();
        if (job.salaryShown !== false && /month|bulan/.test(interval) && cur === 'IDR') {
          const n = (x: unknown) => (typeof x === 'number' && x > 0 ? Math.round(x) : null);
          setSalary(n(job.baseSalary), n(job.maximumSalary));
        }
        result.deadline ??= dateOf(job.applicationEndDate);
        const desc = [htmlToText(job.description), htmlToText(job.qualifications)].filter(Boolean).join('\n\n');
        result.description ??= clean(desc);
      }
    } catch {
      /* __NEXT_DATA__ tidak terbaca: lanjut ke cadangan */
    }
    const og = meta('og:title'); // "Sales Trainee … at Ruangguru"
    const at = og ? /^(.+?)\s+at\s+(.+)$/i.exec(og) : null;
    result.position ??= at ? clean(at[1]) : textOf('h1');
    result.company ??= at ? clean(at[2]) : null;
  }

  if (site === 'jobstreet') {
    // Jobstreet: atribut data-automation (halaman detail & panel di halaman pencarian).
    const JOBSTREET = {
      title: '[data-automation="job-detail-title"]',
      company: '[data-automation="advertiser-name"]',
      location: '[data-automation="job-detail-location"]',
      workType: '[data-automation="job-detail-work-type"]',
      salary: '[data-automation="job-detail-salary"]',
      description: '[data-automation="jobAdDetails"]',
    };
    result.position ??= textOf(JOBSTREET.title);
    result.company ??= textOf(JOBSTREET.company);
    const loc = textOf(JOBSTREET.location);
    result.location ??= loc?.replace(/\s*\((hybrid|remote|on-?site)\)\s*$/i, '') ?? null;
    result.workType ??= workTypeOf(loc) ?? workTypeOf(textOf(JOBSTREET.workType));
    setSalary(...salaryFrom(textOf(JOBSTREET.salary)));
    result.description ??= blockText(q(JOBSTREET.description));
  }

  if (site === 'karirhub') {
    // Karirhub (Kemnaker): tanpa data terstruktur; baca dari label di halaman.
    const h1 = doc.querySelector('h1');
    result.position ??= clean(h1?.textContent);
    // Baris setelah judul: "Kab. Cianjur, Jawa Barat" + "Diposting … • Jumlah lowongan …".
    const info = h1?.nextElementSibling;
    const loc = clean((info?.firstElementChild ?? info)?.textContent)?.split(/Diposting|Batas waktu/i)[0]?.trim();
    if (loc) result.location ??= loc;
    const valueAfter = (label: string) => {
      const els = [...doc.querySelectorAll('div, span, p, dt, h2, h3, h4')];
      const el = els.find((e) => clean(e.textContent)?.toLowerCase() === label.toLowerCase() && e.children.length === 0);
      return clean(el?.nextElementSibling?.textContent);
    };
    setSalary(...salaryFrom(valueAfter('Rentang gaji')));
    result.workType ??= workTypeOf(valueAfter('Sistem kerja'));
    const body = clean(doc.body?.textContent?.replace(/\s+/g, ' ')) ?? '';
    result.deadline ??= dateOf(/Batas waktu lamaran\s+(\d{1,2}\s+[A-Za-z]+\.?\s+\d{4})/i.exec(body)?.[1]);
    const companyLink = doc.querySelector('a[href*="/perusahaan/"]')?.getAttribute('href');
    result.company ??= fromSlug(companyLink?.split('/perusahaan/')[1]?.split(/[?#/]/)[0]);
    const descLabel = [...doc.querySelectorAll('div, h2, h3')].find((e) => clean(e.textContent) === 'Deskripsi Pekerjaan' && e.children.length === 0);
    result.description ??= blockText(descLabel?.nextElementSibling ?? null);
  }

  if (site === 'indeed') {
    const INDEED = {
      title: '[data-testid="jobsearch-JobInfoHeader-title"]|h1.jobsearch-JobInfoHeader-title|.jobsearch-JobInfoHeader-title',
      company: '[data-testid="inlineHeader-companyName"]|[data-company-name="true"]|.jobsearch-CompanyInfoContainer a',
      location: '[data-testid="inlineHeader-companyLocation"]|[data-testid="job-location"]|[data-testid="jobsearch-JobInfoHeader-companyLocation"]',
      salary: '#salaryInfoAndJobType|[data-testid="jobsearch-OtherJobDetailsContainer"]',
      description: '#jobDescriptionText',
    };
    result.position ??= textOf(INDEED.title)?.replace(/\s*-\s*job post\s*$/i, '') ?? null;
    result.company ??= textOf(INDEED.company);
    const loc = textOf(INDEED.location);
    result.location ??= loc?.replace(/•.*$/, '').trim() || null;
    result.workType ??= workTypeOf(loc);
    setSalary(...salaryFrom(textOf(INDEED.salary)));
    result.description ??= blockText(q(INDEED.description));
  }

  /* --------------------------- Instagram --------------------------- */
  if (site === 'instagram') {
    const ogTitle = meta('og:title') ?? '';
    const ogDesc = meta('og:description') ?? meta('description') ?? '';
    // og:description: '123 likes, 4 comments - kopisenja.jogja on October 10, 2026: "Caption..."'
    const handle =
      /-\s*([A-Za-z0-9._]+)\s+on\s/.exec(ogDesc)?.[1] ??
      /@([A-Za-z0-9._]+)/.exec(ogTitle)?.[1] ??
      clean(doc.querySelector('header a[href^="/"]')?.getAttribute('href')?.replace(/\//g, ''));
    result.author = handle ? `@${handle.replace(/^@/, '')}` : null;
    const quoted = /:\s*"([\s\S]+)"\s*$/.exec(ogDesc)?.[1] ?? /:\s*"([\s\S]+)"/.exec(ogTitle)?.[1];
    result.caption =
      clean(doc.querySelector('article h1, main h1')?.textContent) ?? clean(quoted?.replace(/\\n/g, '\n')) ?? null;
    result.description ??= result.caption;
  }

  /* ----------------------- 3. cadangan umum ----------------------- */
  if (site !== 'instagram' && site !== 'linkedin') {
    result.position ??= clean(doc.querySelector('h1')?.textContent) ?? meta('og:title');
    // Di situs karier perusahaan, nama situs biasanya nama perusahaan (bukan untuk portal loker).
    if (site === 'other') result.company ??= meta('og:site_name');
    result.description ??= meta('og:description');
  }
  const main = doc.querySelector('main') ?? doc.body;
  const mainText = blockText(main);
  if (result.salaryMin == null) {
    // Baris yang menyebut gaji di deskripsi, atau di teks halaman bila deskripsi tidak ada.
    const lines = (result.description ?? mainText ?? '').split('\n');
    const line = lines.find((l) => /(gaji|salary|upah)/i.test(l) && /(rp|idr|dirahasiakan|nego)/i.test(l)) ?? lines.find((l) => /(rp|idr)\.?\s?\d/i.test(l)) ?? null;
    setSalary(...salaryFrom(line));
  }
  result.workType ??= workTypeOf(result.location) ?? workTypeOf(result.position);
  if (!result.workType && site !== 'instagram') {
    // Label sistem kerja yang berdiri sendiri, mis. chip "On-site" / "Remote" / "Kerja dari rumah".
    const chip = [...(doc.querySelector('main') ?? doc.body ?? doc.documentElement).querySelectorAll('span, div, p, li')].find(
      (e) =>
        e.children.length === 0 &&
        /^(remote|hybrid|on-?site|wfo|wfh|kerja di kantor|kerja dari rumah|kerja hybrid|work from (home|office))$/i.test(e.textContent?.trim() ?? ''),
    );
    result.workType = workTypeOf(chip?.textContent);
  }

  result.pageText = (result.description ?? mainText ?? '').slice(0, 20000);
  return result;
}
