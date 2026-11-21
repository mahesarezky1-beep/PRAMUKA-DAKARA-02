# DAKARA 02 — Website Ujian Kepramukaan

Website ujian berbasis HTML, CSS, dan JavaScript. Bank soal diambil dari PDF yang diberikan: **Bab 1 dan 2 (40 soal)** serta **Bab 3 – Baden Powell (100 soal)**. Total 140 soal isian.

## Isi folder

- `index.html` — halaman peserta dan pemeriksa.
- `style.css` — desain responsif.
- `questions.js` — 140 pertanyaan dari dokumen.
- `app.js` — navigasi ujian, pencatatan fokus, dan komunikasi ke backend.
- `apps-script/Code.gs` — salinan template backend Google Apps Script. Folder ini tidak perlu diunggah ke GitHub Pages; backend yang aktif sudah diterbitkan dari akun pengelola.

## 1. Siapkan penyimpanan jawaban

Website GitHub Pages adalah hosting statis. Agar jawaban dari HP peserta masuk ke satu daftar yang bisa dibuka pemeriksa, siapkan Google Sheets sebagai penyimpanan:

1. Buat satu Google Sheets baru, misalnya `DAKARA 02 - Hasil Ujian`.
2. Dari Google Sheets, buka **Extensions / Ekstensi → Apps Script**.
3. Hapus kode contoh, lalu salin seluruh isi `apps-script/Code.gs` ke editor Apps Script.
4. Pada bagian paling atas, ganti nilai `REVIEWER_CODE` menjadi kode rahasia pemeriksa yang tidak dibagikan ke peserta. Contoh: `DKR02-Periksa-2026`.
5. Simpan proyek. Jalankan fungsi `setupSheet` satu kali dari editor Apps Script, lalu izinkan akses yang diminta Google. Tab `Submissions` akan dibuat otomatis.
6. Pilih **Deploy → New deployment**. Klik ikon roda gigi, pilih **Web app**.
7. Atur **Execute as: Me** dan **Who has access: Anyone**. Deploy, lalu salin URL Web App yang berakhiran `/exec`.
8. URL Web App sudah dipasang pada `app.js` sesuai deployment DAKARA 02 yang diberikan pengelola. Tidak perlu menggantinya lagi selama deployment tersebut masih aktif. Jangan tempel kode pemeriksa ke `app.js`.

Catatan: akses Web App harus `Anyone` agar browser peserta dapat mengirim data tanpa login Google. Kode pemeriksa divalidasi di Apps Script, bukan di halaman website. Link Web App tetap perlu dijaga agar tidak disalahgunakan untuk mengirim spam.

## 2. Hosting di GitHub Pages

1. Buat repository GitHub baru, misalnya `dakara-02-ujian`.
2. Unggah `index.html`, `style.css`, `questions.js`, `app.js`, dan `README.md` ke root repository. Folder `apps-script` boleh disimpan di repository sebagai arsip, tetapi tidak perlu dipublikasikan untuk menjalankan website.
3. Buka **Settings → Pages**.
4. Pada **Build and deployment**, pilih **Deploy from a branch**.
5. Pilih branch `main` dan folder `/(root)`, kemudian Save.
6. Tunggu sampai GitHub menampilkan alamat website Pages repository. Bagikan alamat tersebut kepada peserta.

## 3. Cara menggunakan

**Peserta:** buka website → isi nama (pangkalan otomatis: SMPN 2 Cikarang Utara) → tekan `Mulai mengerjakan` → isi soal → `Kirim jawaban`.

**Pemeriksa:** tekan `Pemeriksa` di kanan atas → masukkan kode yang diatur pada `REVIEWER_CODE` di Apps Script → lihat daftar peserta → pilih `Periksa` untuk membaca semua jawaban dan catatan fokus.

Jawaban tidak dinilai otomatis karena PDF sumber hanya berisi pertanyaan, bukan kunci jawaban. Pemeriksa menilai jawaban secara manual.

## Catatan penting tentang penguncian perangkat

Website biasa yang dibuka melalui browser **tidak dapat menjamin** peserta tidak membuka aplikasi lain, menggunakan split-screen/dua layar, mengambil tangkapan layar, atau berpindah perangkat. Browser tidak diberi wewenang untuk mengunci sistem operasi. Website ini hanya:

- meminta browser masuk ke mode layar penuh saat tombol mulai ditekan;
- menampilkan konfirmasi **“Keluar dari tampilan fokus?”** ketika peserta keluar dari layar penuh;
- pilihan **“Tetap di ujian”** mencoba mengembalikan layar penuh, sedangkan **“Ya, keluar”** menambahkan catatan untuk pemeriksa;
- mencatat perpindahan aplikasi/tab ketika halaman ditinggalkan, lalu menampilkan pemberitahuan saat peserta kembali;
- menampilkan jumlah dan rincian catatan fokus untuk dilihat pemeriksa.

Deteksi browser bukan bukti mutlak kecurangan dan bisa terpicu oleh notifikasi, panggilan, atau perilaku sistem. Browser juga tidak selalu dapat menampilkan dialog sebelum aplikasi lain terbuka; untuk perpindahan aplikasi, catatan dibuat saat halaman ditinggalkan dan pemberitahuan ditampilkan saat peserta kembali. Untuk penguncian yang benar-benar ketat, gunakan perangkat yang dikelola dengan Android kiosk / Lock Task Mode atau solusi ujian khusus yang mendukung secure exam mode. Pengaturan tersebut tidak bisa dipaksakan oleh GitHub Pages.

## Pengelolaan data

Data peserta disimpan pada Google Sheets milik pengelola. Lindungi akses spreadsheet dan jangan membagikan link edit kepada peserta. Buat kode pemeriksa yang kuat dan ubah jika terlanjur tersebar. Untuk setiap perubahan kode Apps Script, lakukan deployment versi baru atau kelola deployment agar versi aktif ikut diperbarui.
