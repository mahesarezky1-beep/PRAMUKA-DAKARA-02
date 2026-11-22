DAKARA 02 — FITUR HAPUS PESERTA

ISI PAKET
- index.html, app.js, style.css, questions.js, questions.json: unggah ke root repository GitHub Pages.
- apps-script/Code.gs: salin ke editor Google Apps Script, jangan unggah ke repository publik.

PEMASANGAN
1. Ganti isi file Code.gs Apps Script dengan apps-script/Code.gs.
2. Simpan. Pastikan fungsi setupSheet tetap tersedia. Bila tab ExamSets dan ExamQuestions sudah ada, setupSheet aman dijalankan lagi dan tidak menghapus data Submissions.
3. Terapkan > Kelola deployment > Edit > Versi baru > Terapkan. Pertahankan URL /exec.
4. Ganti file app.js di root repository GitHub dengan app.js dalam paket ini. File lainnya dapat tetap seperti versi Multi Ujian yang sudah terpasang.
5. Commit changes, lalu hard-refresh website dengan Ctrl+F5.

FITUR HAPUS
Pada daftar peserta, klik Hapus dan konfirmasi. Backend menghapus satu baris peserta berdasarkan ID unik dari tab Submissions, termasuk jawaban, catatan fokus, dan hasil koreksinya. Paket ujian serta data peserta lain tidak dihapus. Penghapusan bersifat permanen dari sheet; gunakan version history Google Sheets bila perlu memulihkan.
