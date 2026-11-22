DAKARA 02 — PEMBARUAN URL APPS SCRIPT

URL WEB APP TERBARU
https://script.google.com/macros/s/AKfycbwxTvUe8pnX7rJsLgd2bik05ClwXiAXP9wbKUuTqN-C0g9S2WIXcFWmvan8OmKq9AZj/exec

ISI PAKET
- index.html, app.js, style.css, questions.js, questions.json: unggah ke root repository GitHub Pages.
- apps-script/Code.gs: untuk editor Google Apps Script saja; jangan unggah ke repository publik.

PEMASANGAN
1. URL Apps Script baru sudah dipasang di app.js.
2. Di repository GitHub, buka folder utama tempat index.html berada. Ganti app.js dengan app.js dari paket ini. Tidak perlu mengganti file lain apabila versi Multi Ujian + Hapus Peserta sudah terpasang.
3. Commit changes.
4. Buka website GitHub Pages lalu tekan Ctrl+F5.
5. Tes URL backend dengan membuka URL di atas ditambah ?action=publicExams. Respons yang diharapkan adalah JSON dengan ok:true dan data berisi paket ujian yang ditampilkan.

CATATAN BACKEND
- Screenshot deployment yang terbaru menunjukkan Execute as: Saya dan akses: Siapa saja.
- Pastikan deployment /exec terbaru ini menggunakan Code.gs versi Multi Ujian + Hapus Peserta. Jika kode Code.gs berubah setelah deployment, terbitkan Versi baru melalui Kelola deployment.
- Jika tes publicExams masih meminta kode pemeriksa, berarti deployment belum menggunakan versi Code.gs yang benar.

FITUR YANG DIPERTAHANKAN
- Multi paket ujian; pemeriksa dapat membuat paket dan menampilkan/menyembunyikan ujian.
- Upload bank soal TXT/CSV dan kunci jawaban.
- Koreksi benar/salah serta status belum dikoreksi.
- Hapus satu peserta berdasarkan ID dari daftar pemeriksa.
- Pengiriman jawaban dan catatan fokus.
