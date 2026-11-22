# DAKARA 02 — Website Ujian Kepramukaan

Website statis HTML, CSS, dan JavaScript untuk GitHub Pages. Backend menggunakan Google Apps Script dan Google Sheets.

## Fitur

- Pangkalan peserta otomatis: **SMPN 2 Cikarang Utara**.
- Paket awal **Ujian 1** menggunakan 140 soal dari file sumber (Bab 1–2 dan Bab 3 — Baden Powell).
- Pemeriksa dapat membuat paket baru seperti **Ujian 2**, **Ujian 3**, dan seterusnya.
- Bank soal paket baru dapat diketik atau diunggah dalam format TXT/CSV.
- Pemeriksa dapat mengatur paket menjadi **Ditampilkan** atau **Disembunyikan**. Hanya paket yang ditampilkan yang muncul di halaman peserta.
- Kunci jawaban dan jawaban alternatif disimpan di backend dan tidak dikirim ke halaman peserta.
- Jawaban dengan kunci dinilai otomatis berdasarkan kecocokan teks setelah normalisasi huruf besar/kecil, aksen, spasi, dan tanda baca umum.
- Soal tanpa kunci jawaban ditandai **Belum dikoreksi** dan dapat dinilai manual oleh pemeriksa.
- Pemeriksa dapat menyimpan hasil koreksi Benar/Salah/Belum dikoreksi.
- Jawaban, durasi, dan catatan fokus peserta tetap disimpan di Google Sheets.

## Format bank soal

Satu soal per baris.

### TXT

Pisahkan kolom menggunakan tanda `|`:

```text
Siapa Bapak Pandu Sedunia? | Baden-Powell | Robert Baden-Powell
Apa kepanjangan WOSM? | World Organization of the Scout Movement
Sebutkan manfaat kegiatan Pramuka di alam terbuka! | (kosongkan jika ingin dikoreksi manual)
```

Kolom pertama adalah pertanyaan, kolom kedua kunci jawaban, kolom berikutnya jawaban alternatif yang juga dianggap benar. Kunci jawaban boleh dikosongkan untuk koreksi manual.

### CSV

Gunakan kolom: `Soal,Kunci Jawaban,Alternatif 1,Alternatif 2`.

Contoh:

```csv
Soal,Kunci Jawaban,Alternatif 1
Siapa Bapak Pandu Sedunia?,Baden-Powell,Robert Baden-Powell
Apa kepanjangan WOSM?,World Organization of the Scout Movement,
```

## Pemasangan frontend ke GitHub Pages

1. Ekstrak ZIP pembaruan.
2. Di repository GitHub, buka folder yang menjadi sumber GitHub Pages (untuk pengaturan `main / root`, langsung di halaman utama repository).
3. Upload/ganti file `index.html`, `app.js`, `style.css`, dan `questions.js` dari folder paket ini. Jangan menaruhnya di dalam folder `dakara02-website` lagi.
4. Commit perubahan.

Pastikan `index.html`, `app.js`, `style.css`, dan `questions.js` berada pada folder yang sama.

## Memperbarui backend Apps Script

1. Buka Google Sheets yang digunakan DAKARA 02.
2. Pilih **Ekstensi → Apps Script**.
3. Buka `Kode.gs`, pilih semua kode lama, lalu ganti dengan isi `apps-script/Code.gs` dari paket ini.
4. Simpan, pilih fungsi `setupSheet`, lalu klik **Jalankan** satu kali. Fungsi ini menyiapkan tab `ExamSets` dan `ExamQuestions`, serta menambahkan kolom baru pada `Submissions` bila belum ada. Data lama tidak dihapus.
5. Pilih fungsi `setReviewerCode`, klik **Jalankan**, lalu masukkan kode rahasia yang akan dipakai pada halaman Pemeriksa (misalnya kode yang sudah digunakan sebelumnya). Kode disimpan di Script Properties, bukan di file JavaScript website.
6. Klik **Terapkan → Kelola deployment**.
7. Edit deployment Web App yang lama, pilih **Versi baru**, lalu Terapkan. Pertahankan URL `/exec` yang sama agar frontend tidak perlu diganti.

**Keamanan:** jangan upload folder `apps-script` ke repository publik GitHub. Gunakan `Code.gs` hanya untuk ditempel ke editor Apps Script. File backend tidak perlu berada di folder GitHub Pages.

Pengaturan Web App: **Jalankan sebagai: Saya** dan **Siapa yang memiliki akses: Siapa saja**.

## Alur pemeriksa

1. Masuk ke tombol **Pemeriksa** menggunakan kode pemeriksa.
2. Pada bagian **Paket ujian**, tekan **Buat ujian**.
3. Isi judul, keterangan, lalu ketik atau unggah bank soal.
4. Format TXT: `Pertanyaan | Kunci | Alternatif 1 | Alternatif 2`.
5. Pilih centang **Tampilkan paket ini kepada peserta** sebelum menyimpan, atau simpan dalam keadaan tidak dicentang lalu tekan **Tampilkan** saat siap.
6. Untuk mengganti paket yang muncul, tekan **Sembunyikan** pada ujian lama dan **Tampilkan** pada ujian baru.
7. Di daftar peserta, pilih **Periksa**. Jawaban berkunci akan dinilai otomatis; soal tanpa kunci dapat diperiksa manual. Tekan **Simpan koreksi** agar hasilnya masuk ke Google Sheets.

## Catatan penilaian

Penilaian otomatis menggunakan kecocokan teks yang dinormalisasi, bukan AI atau penilaian makna. Untuk jawaban yang bisa memiliki beberapa variasi, isi beberapa alternatif jawaban pada baris yang sama. Pertanyaan uraian yang jawabannya panjang atau bervariasi sebaiknya dibiarkan tanpa kunci dan dinilai manual oleh pemeriksa.

## Catatan keamanan dan browser

GitHub Pages hanya menyajikan frontend. Google Apps Script memvalidasi kode pemeriksa untuk tindakan pengelolaan dan menyimpan data di Google Sheets. Browser tidak dapat mengunci perangkat sepenuhnya; sistem hanya dapat meminta layar penuh serta mencatat perpindahan tab/aplikasi yang terdeteksi.
