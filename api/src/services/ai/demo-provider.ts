import type * as z from 'zod/v4';
import type { AiPrompt, AiProvider, AiUsageInfo, StreamCallbacks } from '../../lib/ai';

/**
 * Provider untuk akun demo instan: menampilkan contoh hasil AI yang realistis tanpa
 * memanggil API (biaya 0). Nama perusahaan & posisi diambil dari prompt agar terasa personal.
 */

const DEMO_USAGE: AiUsageInfo = {
  model: 'demo',
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costMicroUsd: 0,
};

function promptText(prompt: AiPrompt) {
  return prompt.parts.map((p) => (p.type === 'text' ? p.text : '')).join('\n');
}

const field = (text: string, label: string, fallback: string) =>
  new RegExp(`^${label}: (.+)$`, 'm').exec(text)?.[1]?.trim() ?? fallback;

function coverLetter(prompt: AiPrompt) {
  const text = promptText(prompt);
  const company = field(text, 'Perusahaan', 'perusahaan Anda');
  const position = field(text, 'Posisi', 'posisi yang dibuka');
  const date = field(text, 'date', '14 Oktober 2026');
  return `Jakarta, ${date}

Perihal: Lamaran Posisi ${position}

Kepada Yth.
Tim Rekrutmen ${company}

Dengan hormat,

Saya ingin mengajukan lamaran untuk posisi ${position} di ${company}. Dengan tiga tahun pengalaman membangun aplikasi web menggunakan React dan TypeScript, saya yakin dapat berkontribusi langsung pada tim Anda.

Di PT Niaga Digital, saya membangun dashboard admin berbasis React yang kini dipakai lebih dari 200 staf setiap hari. Saya juga memimpin optimasi performa dengan code splitting yang menurunkan waktu muat halaman hingga 40%. Pengalaman ini sejalan dengan kebutuhan ${company} akan engineer yang memahami performa web dan kualitas kode.

Saya terbiasa bekerja erat dengan tim produk dan desain, serta menulis unit test menggunakan Testing Library untuk menjaga kualitas rilis. Saya juga senang mempelajari teknologi baru, misalnya [sebutkan pengalaman GraphQL bila ada].

Saya akan sangat senang mendapat kesempatan untuk mendiskusikan bagaimana pengalaman saya dapat membantu tim ${company}. Terima kasih atas waktu dan perhatian Bapak/Ibu.

Hormat saya,
Pengunjung Demo`;
}

const SAMPLES = {
  profile: {
    headline: 'Frontend Developer',
    summary:
      'Frontend developer dengan tiga tahun pengalaman membangun aplikasi web React dan TypeScript. Terbiasa bekerja bersama tim produk dan desain, serta fokus pada performa dan kualitas kode.',
    skills: 'React, TypeScript, Next.js, Tailwind CSS, Testing Library, Figma, Git',
    experience:
      'Frontend Developer, PT Niaga Digital (2023–sekarang)\n- Membangun dashboard admin React yang dipakai 200+ staf\n- Menurunkan waktu muat halaman 40% dengan code splitting\n\nWeb Developer, Studio Kreatif (2021–2023)\n- Mengembangkan 15+ landing page klien dengan Next.js',
    education: 'S1 Teknik Informatika, Universitas Indonesia (2017–2021)',
    achievements: '- Meta Front-End Developer Professional Certificate\n- Juara 2 Hackathon Fintech 2022',
    city: 'Jakarta',
  },
  prep: {
    overview:
      'Interview user biasanya menilai kedalaman teknis React/TypeScript, cara Anda mengoptimalkan performa, dan kemampuan berkolaborasi dengan tim produk.',
    questions: [
      {
        category: 'technical',
        question: 'Bagaimana Anda mendiagnosis dan memperbaiki halaman React yang lambat?',
        whyAsked: 'Lowongan menekankan optimasi performa web.',
        pointsToHighlight: ['Code splitting yang menurunkan waktu muat 40%', 'Mengukur dulu dengan Lighthouse/Profiler'],
        answerOutline: ['Ukur metrik (LCP, TBT)', 'Temukan penyebab (bundle besar, re-render)', 'Terapkan perbaikan', 'Validasi hasil dengan angka'],
        avoid: 'Langsung menyebut solusi tanpa menjelaskan cara mengukur.',
      },
      {
        category: 'behavioral',
        question: 'Ceritakan saat Anda berbeda pendapat dengan desainer atau product manager.',
        whyAsked: 'Menilai kolaborasi lintas fungsi.',
        pointsToHighlight: ['Kerja sama dengan tim produk & desain di PT Niaga Digital'],
        answerOutline: ['Situation: konteks fitur', 'Task: target bersama', 'Action: diskusi berbasis data/prototipe', 'Result: keputusan & dampaknya'],
        avoid: 'Menyalahkan pihak lain.',
      },
      {
        category: 'technical',
        question: 'Bagaimana Anda memastikan kualitas kode sebelum rilis?',
        whyAsked: 'Lowongan meminta pengalaman menulis unit test.',
        pointsToHighlight: ['Testing Library', 'Code review'],
        answerOutline: ['Strategi test (unit vs integrasi)', 'Contoh test yang mencegah bug', 'Peran CI'],
        avoid: 'Mengatakan testing dikerjakan QA saja.',
      },
      {
        category: 'motivation',
        question: 'Mengapa Anda tertarik bergabung dengan tim ini?',
        whyAsked: 'Menilai motivasi dan riset Anda tentang perusahaan.',
        pointsToHighlight: ['Minat pada produk yang dipakai jutaan pengguna', 'Pengalaman dashboard yang relevan'],
        answerOutline: ['Apa yang Anda ketahui tentang produk', 'Kaitkan dengan pengalaman', 'Apa yang ingin Anda pelajari'],
        avoid: 'Jawaban umum seperti "perusahaan besar".',
      },
    ],
    questionsToAsk: ['Seperti apa ukuran keberhasilan di 90 hari pertama?', 'Bagaimana proses code review di tim ini?'],
    finalTips: ['Siapkan 2 cerita STAR dengan angka.', 'Pelajari fitur utama produk sebelum interview.'],
  },
  ats: {
    score: 78,
    verdict: 'Cukup cocok',
    summary:
      'Pengalaman React, TypeScript, dan optimasi performa sangat sesuai. Nilai berkurang karena belum ada bukti pengalaman GraphQL dan pengujian yang terukur.',
    matchedKeywords: ['React', 'TypeScript', 'Optimasi performa', 'Testing Library', 'Kolaborasi tim produk'],
    missingKeywords: ['GraphQL', 'Core Web Vitals', 'CI/CD'],
    requirements: [
      { requirement: '2+ tahun React & TypeScript', status: 'met', evidence: 'Frontend Developer, PT Niaga Digital (2023–sekarang)', suggestion: 'Sebutkan total tahun pengalaman di ringkasan CV.' },
      { requirement: 'Optimasi performa web', status: 'met', evidence: 'Menurunkan waktu muat halaman 40% dengan code splitting', suggestion: 'Tambahkan metrik Core Web Vitals yang membaik.' },
      { requirement: 'Menulis unit test', status: 'partial', evidence: 'Skill: Testing Library', suggestion: 'Tulis contoh proyek dengan cakupan test yang terukur.' },
      { requirement: 'Pengalaman GraphQL (nilai tambah)', status: 'missing', evidence: '', suggestion: 'Buat proyek portofolio kecil memakai GraphQL.' },
    ],
    cvImprovements: [
      'Ubah "Membangun dashboard admin" menjadi "Membangun dashboard admin React + TypeScript yang dipakai 200+ staf setiap hari".',
      'Tambahkan baris tentang testing: alat yang dipakai dan dampaknya pada bug produksi.',
      'Letakkan skill React, TypeScript, dan performa web di bagian atas CV.',
    ],
    nextSteps: ['Perbarui CV dengan saran di atas.', 'Siapkan contoh optimasi performa untuk interview.'],
  },
  extract: {
    company: 'PT Contoh Teknologi Nusantara',
    position: 'Frontend Engineer',
    location: 'Jakarta Selatan',
    workType: 'hybrid',
    salaryMin: 12000000,
    salaryMax: 18000000,
    source: 'linkedin',
    jobDescription:
      'Tanggung jawab:\n- Mengembangkan fitur web dengan React & TypeScript\n- Berkolaborasi dengan tim produk dan desain\n\nKualifikasi:\n- Minimal 2 tahun pengalaman frontend\n- Memahami optimasi performa web',
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    deadline: null,
    applyInstructions: null,
    posterText: null,
  },
  poster: {
    company: 'PT Sinar Logistik Nusantara',
    position: 'Staff Admin Gudang',
    location: 'Surabaya',
    workType: 'onsite',
    salaryMin: 4500000,
    salaryMax: 5500000,
    source: 'instagram',
    jobDescription:
      'Tanggung jawab:\n- Mencatat barang masuk & keluar gudang\n- Membuat laporan stok harian\n\nKualifikasi:\n- Pendidikan min. SMA/SMK sederajat\n- Usia maks. 30 tahun\n- Menguasai Microsoft Excel\n- Teliti, jujur, dan bertanggung jawab',
    contactName: null,
    contactEmail: 'rekrutmen@sinarlogistik.co.id',
    contactPhone: '081234567890',
    deadline: '2026-10-31',
    applyInstructions: 'Kirim CV & pas foto ke rekrutmen@sinarlogistik.co.id dengan subjek "Admin Gudang_Nama Lengkap".',
    posterText:
      'WE ARE HIRING!\nPT SINAR LOGISTIK NUSANTARA\nStaff Admin Gudang\nPenempatan: Surabaya\nGaji Rp 4,5 – 5,5 juta\n\nKualifikasi:\n• Min. SMA/SMK sederajat\n• Usia maks. 30 tahun\n• Menguasai Microsoft Excel\n• Teliti, jujur, dan bertanggung jawab\n\nKirim CV & pas foto ke rekrutmen@sinarlogistik.co.id\nSubjek: Admin Gudang_Nama Lengkap\nPaling lambat 31 Oktober 2026\nInfo: 0812-3456-7890 (WA)',
  },
};

export class DemoAiProvider implements AiProvider {
  async streamText(prompt: AiPrompt, cb: StreamCallbacks, signal: AbortSignal) {
    const text = coverLetter(prompt);
    // Alirkan per kata agar terasa seperti AI sungguhan.
    for (const word of text.split(/(?<=\s)/)) {
      if (signal.aborted) throw new Error('aborted');
      cb.onText(word);
      await new Promise((r) => setTimeout(r, 12));
    }
    return { text, usage: DEMO_USAGE };
  }

  async structured<T>(prompt: AiPrompt, schema: z.ZodType<T>) {
    // Pilih contoh yang cocok dengan skema yang diminta (poster bila ada gambar).
    const hasImage = prompt.parts.some((p) => p.type === 'file' && p.mimeType.startsWith('image/'));
    for (const sample of [SAMPLES.prep, SAMPLES.ats, hasImage ? SAMPLES.poster : SAMPLES.extract, SAMPLES.profile]) {
      const parsed = schema.safeParse(sample);
      if (parsed.success) {
        await new Promise((r) => setTimeout(r, 1200));
        return { data: parsed.data, usage: DEMO_USAGE };
      }
    }
    throw new Error('Tidak ada contoh demo untuk skema ini');
  }
}

export const demoAiProvider = new DemoAiProvider();
