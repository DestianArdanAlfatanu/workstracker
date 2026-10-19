import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LogoMark } from '@/components/brand';
import { ADMIN_WHATSAPP, whatsappLink } from '@/lib/config';
import './landing.css';

const UPDATED = '19 Oktober 2026';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="m-0 text-[22px] font-extrabold tracking-[-0.02em] text-[#0f172a]">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed text-[#334155] [&_li]:mt-1.5 [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

/** Kebijakan privasi publik (dipakai juga sebagai URL privasi di Chrome Web Store). */
export function PrivacyPage() {
  useEffect(() => {
    // Dibuka dari footer landing: mulai dari atas, bukan posisi scroll halaman sebelumnya.
    window.scrollTo(0, 0);
    const prev = document.title;
    document.title = 'Kebijakan Privasi | WorksTracker';
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="lp min-h-dvh bg-white">
      <header className="border-b border-[#e2e8f0] bg-white">
        <div className="mx-auto flex max-w-[820px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2.5 text-[#0f172a] no-underline" aria-label="WorksTracker, ke beranda">
            <LogoMark className="size-[34px]" />
            <span className="text-[19px] font-extrabold tracking-[-0.035em]">WorksTracker</span>
          </Link>
          <Link to="/login" className="lp-btn lp-btn-sm shrink-0 bg-transparent text-[#0f172a] hover:bg-[#f1f5f9] hover:text-[#0f172a]">
            Masuk
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[820px] px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <h1 className="m-0 text-[clamp(2rem,5vw,2.75rem)] font-extrabold leading-[1.1] tracking-[-0.035em] text-[#0f172a]">
          Kebijakan Privasi
        </h1>
        <p className="mt-3 text-sm text-[#64748b]">Berlaku sejak {UPDATED}</p>
        <p className="mt-6 text-[15px] leading-relaxed text-[#334155]">
          Halaman ini menjelaskan data apa saja yang dikumpulkan WorksTracker (website, aplikasi di HP, dan Chrome Extension
          "WorksTracker: Simpan Lowongan"), untuk apa data itu dipakai, dan bagaimana kamu bisa meminta data dihapus.
        </p>

        <Section title="Data yang kami simpan">
          <ul>
            <li>
              <strong>Akun:</strong> nama, email, password yang disimpan dalam bentuk hash, paket yang dibeli, dan saldo
              kredit AI.
            </li>
            <li>
              <strong>Isi yang kamu catat:</strong> lamaran (perusahaan, posisi, status, tanggal, gaji, catatan, link
              lowongan, deskripsi lowongan), tugas, target mingguan, profil karier, dan file CV yang kamu unggah.
            </li>
            <li>
              <strong>Pembayaran:</strong> nomor pesanan, paket, nominal, dan status pembayaran. Data kartu atau rekening
              diproses langsung oleh Midtrans dan tidak pernah kami simpan.
            </li>
            <li>
              <strong>Notifikasi:</strong> alamat langganan notifikasi push perangkat bila kamu mengaktifkannya.
            </li>
            <li>
              <strong>Data teknis:</strong> cookie login dan log server (alamat IP, waktu akses) untuk keamanan dan
              mencegah penyalahgunaan.
            </li>
          </ul>
        </Section>

        <Section title="Chrome Extension">
          <ul>
            <li>
              Extension hanya membaca halaman yang <strong>sedang kamu buka</strong>, dan hanya saat kamu mengklik ikon
              WorksTracker. Extension tidak membaca riwayat browsing atau situs lain di latar belakang.
            </li>
            <li>
              Yang diambil dari halaman lowongan: nama perusahaan, posisi, lokasi, gaji, batas melamar, deskripsi, dan
              link. Data ini dikirim ke server WorksTracker hanya saat kamu menekan tombol simpan.
            </li>
            <li>
              Fitur "Isi dari poster di layar (AI)" mengambil tangkapan layar tab yang sedang dibuka, hanya saat tombol itu
              kamu tekan, lalu mengirimkannya ke server untuk dibaca AI.
            </li>
            <li>
              Extension memakai sesi login website. Token akses sementara disimpan di penyimpanan sesi browser dan hilang
              saat browser ditutup atau kamu keluar.
            </li>
          </ul>
        </Section>

        <Section title="Untuk apa data dipakai">
          <ul>
            <li>Menjalankan fitur WorksTracker: mencatat lamaran, kalender, pengingat, insight, dan ekspor.</li>
            <li>Mengirim email dan notifikasi pengingat yang kamu aktifkan.</li>
            <li>Menjalankan fitur AI yang kamu minta (isi otomatis, cover letter, persiapan interview, cek CV).</li>
            <li>Memproses pembelian paket dan isi ulang kredit.</li>
          </ul>
          <p>
            Kami <strong>tidak menjual</strong> data kamu, tidak memakainya untuk iklan, dan tidak membagikannya kepada pihak
            lain selain penyedia layanan di bawah.
          </p>
        </Section>

        <Section title="Penyedia layanan pihak ketiga">
          <ul>
            <li>
              <strong>Google Gemini:</strong> menerima teks lowongan, gambar poster, CV, atau profil karier hanya saat kamu
              memakai fitur AI.
            </li>
            <li>
              <strong>Midtrans:</strong> memproses pembayaran.
            </li>
            <li>
              <strong>Layanan email:</strong> mengirim email pengingat, atur ulang password, dan bukti pembelian.
            </li>
            <li>
              <strong>Penyedia server:</strong> menyimpan database dan file CV.
            </li>
          </ul>
        </Section>

        <Section title="Penyimpanan dan penghapusan">
          <ul>
            <li>Data disimpan selama akunmu aktif.</li>
            <li>Lamaran yang kamu hapus dihapus permanen setelah 30 hari.</li>
            <li>Akun demo beserta datanya dihapus otomatis setelah 24 jam.</li>
            <li>
              Kamu bisa mengekspor data lamaran kapan saja, dan bisa meminta akun beserta seluruh datanya dihapus dengan
              menghubungi admin.
            </li>
          </ul>
        </Section>

        <Section title="Keamanan">
          <p>
            Koneksi memakai HTTPS, password disimpan dalam bentuk hash, dan setiap akun hanya bisa mengakses datanya
            sendiri.
          </p>
        </Section>

        <Section title="Kontak">
          <p>
            Pertanyaan atau permintaan penghapusan data bisa dikirim lewat WhatsApp admin di{' '}
            <a href={whatsappLink('Halo admin, saya ingin bertanya tentang privasi data WorksTracker.')} className="font-semibold text-primary hover:underline">
              +{ADMIN_WHATSAPP}
            </a>
            .
          </p>
          <p>Bila kebijakan ini berubah, tanggal di bagian atas halaman akan diperbarui.</p>
        </Section>
      </main>
    </div>
  );
}
