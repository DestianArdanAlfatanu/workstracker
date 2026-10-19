# Bahan listing Chrome Web Store: WorksTracker

Salin isi tiap bagian ke Developer Dashboard (https://chrome.google.com/webstore/devconsole).
Gambar ada di folder ini. Untuk membuat ulang gambar: `node scripts/store-screenshots.mjs` dari folder `extension`.

## Package

- File: `extension/workstracker-extension-<versi>.zip`
- Dibuat dengan: `$env:VITE_WT_URL='https://workstracker.techworksnesia.com'; npm run zip -w extension`

## Store listing

**Nama** (dari manifest, otomatis): WorksTracker: Simpan Lowongan

**Ringkasan** (otomatis dari `description` manifest, 121 dari maks. 132 karakter):

```
Simpan lowongan kerja dari halaman yang sedang kamu buka ke WorksTracker. Data lowongan terisi otomatis, cukup satu klik.
```

> Versi 1.0.0 ditolak dengan kode **Yellow Argon (spam kata kunci)** karena deskripsi berisi daftar nama portal lowongan.
> Jangan menulis daftar nama portal atau situs di deskripsi, ringkasan, maupun gambar promosi.

**Deskripsi lengkap:**

```
WorksTracker membantu kamu mencatat semua lamaran kerja di satu tempat. Extension ini membuat pencatatan jadi satu klik: buka halaman lowongan, klik ikon WorksTracker, data lowongan langsung terisi, lalu simpan.

Yang bisa dilakukan:
- Mengisi otomatis perusahaan, posisi, lokasi, gaji, tipe kerja, batas melamar, dan deskripsi dari halaman lowongan.
- Bekerja di portal lowongan kerja populer di Indonesia dan di situs karier perusahaan.
- Bisa juga menyimpan loker yang diunggah di media sosial. Pengguna paket Premium bisa mengisi data dari poster di layar dengan AI.
- Pilih langsung status Wishlist atau Applied, dan CV yang dipakai.
- Memberi peringatan bila lowongan yang sama sudah pernah disimpan.
- Batas melamar otomatis masuk ke agenda pengingat.

Cara pakai:
1. Masuk ke akun WorksTracker di https://workstracker.techworksnesia.com.
2. Buka halaman lowongan, lalu klik ikon WorksTracker di toolbar Chrome.
3. Periksa isian, pilih Wishlist atau Applied, lalu klik Simpan.

Extension tidak punya login sendiri. Extension memakai sesi login website, jadi cukup masuk sekali di website.

Privasi: extension hanya membaca halaman yang sedang kamu buka, dan hanya saat ikon diklik. Tidak ada pembacaan riwayat browsing atau situs lain di latar belakang.

Extension ini tersedia untuk pengguna WorksTracker paket Standar dan Premium.
```

**Kategori:** Productivity → Workflow & Planning (atau "Tools" bila pilihan itu tidak ada)

**Bahasa:** Indonesian

**Gambar:**
- Ikon store 128×128: `extension/public/icons/icon-128.png`
- Screenshot 1280×800: `screenshot-1.png`, `screenshot-2.png`, `screenshot-3.png`
- Small promo tile 440×280: `promo-440x280.png`

**URL tambahan:**
- Homepage URL: `https://workstracker.techworksnesia.com`
- Support URL: `https://workstracker.techworksnesia.com/#faq`

## Privacy practices

**Single purpose:**

```
Menyimpan lowongan kerja dari halaman yang sedang dibuka pengguna ke akun WorksTracker miliknya.
```

**Alasan izin:**

| Izin | Alasan (salin ke kolom justification) |
|---|---|
| `activeTab` | Membaca isi halaman lowongan di tab yang sedang dibuka, hanya saat pengguna mengklik ikon extension, untuk mengisi form lamaran. |
| `scripting` | Menjalankan skrip pembaca lowongan di tab aktif tersebut (setelah ikon diklik) untuk mengambil perusahaan, posisi, lokasi, gaji, dan deskripsi. |
| `storage` | Menyimpan token sesi sementara di penyimpanan sesi browser agar pengguna tidak perlu login ulang selama browser terbuka. Dihapus saat browser ditutup atau logout. |
| Host permission `https://workstracker.techworksnesia.com/*` | Mengirim lowongan yang disimpan ke akun WorksTracker pengguna dan memakai sesi login website WorksTracker. Tidak ada akses ke situs lain. |

**Are you using remote code?** No, I am not using remote code. (Semua JavaScript dibundel di dalam paket.)

**Data usage**, centang:
- [x] **Personally identifiable information**: email dan nama akun WorksTracker (untuk menampilkan akun yang sedang login).
- [x] **Website content**: teks lowongan dari halaman yang dibuka pengguna, dan tangkapan layar tab bila pengguna menekan "Isi dari poster di layar (AI)".
- [ ] Yang lain (health, financial, authentication info, personal communications, location, web history, user activity) tidak dicentang.

Ketiga pernyataan berikut dicentang:
- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** `https://workstracker.techworksnesia.com/privasi`

## Distribution

- Payments: Free of charge
- Visibility: Public (atau Unlisted bila hanya untuk pembeli lewat link)
- Regions: All regions
