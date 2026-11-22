/**
 * DAKARA 02 — Backend Google Apps Script.
 * Menyimpan paket ujian, bank soal, jawaban peserta, dan hasil koreksi.
 * PENTING: pertahankan nama tab dan header yang dibuat oleh setupSheet().
 */
const SUBMISSIONS_SHEET = 'Submissions';
const EXAMS_SHEET = 'ExamSets';
const QUESTIONS_SHEET = 'ExamQuestions';
const DEFAULT_EXAM_ID = 'UJIAN-1';
const DEFAULT_EXAM_TITLE = 'Ujian 1';
const DEFAULT_EXAM_SUBTITLE = 'Materi Kepramukaan';
const DEFAULT_BASE = 'SMPN 2 Cikarang Utara';
const MAX_QUESTIONS = 300;

const SUBMISSION_HEADERS = [
  'ID', 'Waktu Kirim', 'Nama', 'Pangkalan', 'Regu/Kelompok',
  'Terjawab', 'Total Soal', 'Catatan Fokus', 'Durasi (detik)',
  'Mulai Ujian', 'Jawaban JSON', 'Catatan Fokus JSON',
  'Paket Ujian ID', 'Judul Ujian', 'Penilaian JSON',
  'Benar', 'Salah', 'Belum Dikoreksi'
];
const EXAM_HEADERS = ['ID', 'Judul', 'Keterangan', 'Ditampilkan', 'Dibuat', 'Diperbarui'];
const QUESTION_HEADERS = ['ExamID', 'QuestionID', 'Nomor', 'Bagian', 'Pertanyaan', 'Kunci Jawaban', 'Alternatif JSON'];

/* =====================================================
   PERSIAPAN DAN MIGRASI RINGAN — DATA LAMA TIDAK DIHAPUS
===================================================== */
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Buka Apps Script dari Google Sheets melalui Ekstensi > Apps Script.');

  ensureHeaderSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
  ensureHeaderSheet_(EXAMS_SHEET, EXAM_HEADERS);
  ensureHeaderSheet_(QUESTIONS_SHEET, QUESTION_HEADERS);
  ensureDefaultExam_();

  return 'DAKARA 02 siap. Data lama tetap disimpan; tab ExamSets dan ExamQuestions sudah tersedia. Jalankan setReviewerCode() satu kali untuk mengatur kode pemeriksa.';
}

/** Jalankan satu kali untuk menyimpan kode pemeriksa secara privat di Script Properties. */
function setReviewerCode() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Atur Kode Pemeriksa DAKARA 02',
    'Masukkan kode rahasia yang akan digunakan pada halaman Pemeriksa website.',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return 'Pengaturan kode dibatalkan.';
  const code = cleanText_(response.getResponseText(), 100);
  if (code.length < 6) throw new Error('Kode pemeriksa minimal 6 karakter.');
  PropertiesService.getScriptProperties().setProperty('REVIEWER_CODE', code);
  return 'Kode pemeriksa berhasil disimpan secara privat.';
}

function ensureHeaderSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    formatHeader_(sheet, headers.length);
    return sheet;
  }

  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0]
    .map((value) => String(value || '').trim());
  const missing = headers.filter((header) => !current.includes(header));
  if (missing.length) {
    const start = current.length + 1;
    sheet.getRange(1, start, 1, missing.length).setValues([missing]);
    formatHeader_(sheet, start + missing.length - 1);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function formatHeader_(sheet, width) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, width)
    .setFontWeight('bold')
    .setBackground('#17483D')
    .setFontColor('#FFFFFF');
  sheet.autoResizeColumns(1, width);
}

function ensureDefaultExam_() {
  const sheet = ensureHeaderSheet_(EXAMS_SHEET, EXAM_HEADERS);
  const row = findExamRow_(DEFAULT_EXAM_ID);
  if (!row) {
    appendObjectRow_(sheet, EXAM_HEADERS, {
      ID: DEFAULT_EXAM_ID,
      Judul: DEFAULT_EXAM_TITLE,
      Keterangan: DEFAULT_EXAM_SUBTITLE,
      Ditampilkan: true,
      Dibuat: new Date(),
      Diperbarui: new Date()
    });
  }
}

function headersMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((header, index) => { map[String(header)] = index; });
  return map;
}

function appendObjectRow_(sheet, expectedHeaders, record) {
  const map = headersMap_(sheet);
  const width = sheet.getLastColumn();
  const values = new Array(width).fill('');
  expectedHeaders.forEach((header) => {
    if (map[header] !== undefined && record[header] !== undefined) values[map[header]] = record[header];
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, width).setValues([values]);
}

function readObjectRow_(sheet, rowNumber) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  const object = {};
  headers.forEach((header, index) => { object[String(header)] = values[index]; });
  return object;
}

/* =====================================================
   API WEB APP
===================================================== */
function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = String(params.action || '');
  const callback = String(params.callback || '');
  let result;

  try {
    ensureDefaultExam_();

    if (action === 'publicExams') {
      result = { ok: true, data: listExams_(false, false) };
    } else {
      requireReviewer_(params.code);
      if (action === 'manageExams') {
        result = { ok: true, data: listExams_(true, true) };
      } else if (action === 'list') {
        result = { ok: true, data: listSubmissions_() };
      } else if (action === 'detail') {
        result = { ok: true, data: getSubmissionDetail_(String(params.id || '').slice(0, 100)) };
      } else {
        result = { ok: true, data: { message: 'DAKARA 02 API aktif.' } };
      }
    }
  } catch (error) {
    result = { ok: false, message: error && error.message ? error.message : 'Permintaan gagal.' };
  }

  const json = JSON.stringify(result).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let data = {};
  try {
    const raw = e && e.parameter && e.parameter.payload ? e.parameter.payload : '';
    if (!raw) throw new Error('Data kiriman tidak ditemukan.');
    if (raw.length > 450000) throw new Error('Ukuran kiriman terlalu besar.');
    data = JSON.parse(raw);

    const action = String(data.action || 'submit');
    if (action === 'submit') {
      const result = saveSubmission_(data);
      return iframeResponse_({ type: 'dakara-submit', ok: true, nonce: String(data.nonce || ''), data: result });
    }

    requireReviewer_(data.code);
    let result;
    if (action === 'saveExam') {
      result = saveExam_(data.exam || {});
    } else if (action === 'toggleExam') {
      result = toggleExam_(String(data.id || ''), data.visible === true);
    } else if (action === 'saveGrades') {
      result = saveGrades_(String(data.submissionId || ''), data.grades || {});
    } else if (action === 'deleteSubmission') {
      result = deleteSubmission_(String(data.submissionId || ''));
    } else {
      throw new Error('Jenis permintaan tidak dikenal.');
    }
    return iframeResponse_({ type: 'dakara-api', ok: true, requestId: String(data.requestId || ''), data: result });
  } catch (error) {
    const message = error && error.message ? error.message : 'Terjadi kesalahan pada server.';
    if (String(data.action || 'submit') === 'submit') {
      return iframeResponse_({ type: 'dakara-submit', ok: false, nonce: String(data.nonce || ''), message });
    }
    return iframeResponse_({ type: 'dakara-api', ok: false, requestId: String(data.requestId || ''), message });
  }
}

function iframeResponse_(message) {
  const encoded = JSON.stringify(message).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<script>try{window.top.postMessage(' + encoded + ', "*");}catch(e){}</script>' +
    '<p>Permintaan DAKARA 02 selesai. Halaman ini boleh ditutup.</p></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle('DAKARA 02 — Pengiriman')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function requireReviewer_(code) {
  const savedCode = PropertiesService.getScriptProperties().getProperty('REVIEWER_CODE');
  if (!savedCode) throw new Error('Kode pemeriksa belum diatur. Jalankan setReviewerCode() dari Apps Script.');
  if (String(code || '') !== savedCode) throw new Error('Kode pemeriksa tidak sesuai.');
}

/* =====================================================
   PAKET UJIAN DAN BANK SOAL
===================================================== */
function listExams_(includeHidden, includeKeys) {
  // Ambil daftar paket dan seluruh bank soal masing-masing hanya sekali.
  // Cara lama membaca tab soal berulang untuk setiap paket sehingga melambat
  // ketika jumlah Ujian 1, Ujian 2, dan seterusnya semakin banyak.
  const examSheet = ensureHeaderSheet_(EXAMS_SHEET, EXAM_HEADERS);
  const examLastRow = examSheet.getLastRow();
  if (examLastRow < 2) return [];

  const examMap = headersMap_(examSheet);
  const examRows = examSheet.getRange(2, 1, examLastRow - 1, examSheet.getLastColumn()).getValues();

  const questionSheet = ensureHeaderSheet_(QUESTIONS_SHEET, QUESTION_HEADERS);
  const questionLastRow = questionSheet.getLastRow();
  const questionMap = headersMap_(questionSheet);
  const questionRows = questionLastRow >= 2
    ? questionSheet.getRange(2, 1, questionLastRow - 1, questionSheet.getLastColumn()).getValues()
    : [];

  const questionsByExam = new Map();
  questionRows.forEach((row) => {
    const examId = String(row[questionMap.ExamID] || '');
    if (!examId) return;
    if (!questionsByExam.has(examId)) questionsByExam.set(examId, []);
    const question = {
      id: String(row[questionMap.QuestionID] || ''),
      number: Number(row[questionMap.Nomor]) || 0,
      section: String(row[questionMap.Bagian] || ''),
      text: String(row[questionMap.Pertanyaan] || '')
    };
    if (includeKeys) {
      question.answerKey = String(row[questionMap['Kunci Jawaban']] || '');
      question.acceptedAnswers = parseJson_(row[questionMap['Alternatif JSON']], []);
    }
    questionsByExam.get(examId).push(question);
  });

  const result = [];
  examRows.forEach((row) => {
    const visibleValue = row[examMap.Ditampilkan];
    const visible = visibleValue === true || String(visibleValue).toLowerCase() === 'true';
    if (!includeHidden && !visible) return;

    const id = String(row[examMap.ID] || '');
    const questions = questionsByExam.get(id) || [];
    questions.sort((a, b) => a.number - b.number);
    result.push({
      id,
      title: String(row[examMap.Judul] || DEFAULT_EXAM_TITLE),
      subtitle: String(row[examMap.Keterangan] || ''),
      visible,
      questionCount: questions.length || (id === DEFAULT_EXAM_ID ? 140 : 0),
      questions
    });
  });
  return result;
}

function getExamQuestions_(examId, includeKeys) {
  const sheet = ensureHeaderSheet_(QUESTIONS_SHEET, QUESTION_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const map = headersMap_(sheet);
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const questions = [];
  values.forEach((row) => {
    if (String(row[map.ExamID]) !== String(examId)) return;
    const item = {
      id: String(row[map.QuestionID] || ''),
      number: Number(row[map.Nomor]) || questions.length + 1,
      section: String(row[map.Bagian] || ''),
      text: String(row[map.Pertanyaan] || '')
    };
    if (includeKeys) {
      item.answerKey = String(row[map['Kunci Jawaban']] || '');
      item.acceptedAnswers = parseJson_(row[map['Alternatif JSON']], []);
    }
    questions.push(item);
  });
  questions.sort((a, b) => a.number - b.number);
  return questions;
}

function findExamRow_(examId) {
  const sheet = ensureHeaderSheet_(EXAMS_SHEET, EXAM_HEADERS);
  if (sheet.getLastRow() < 2) return 0;
  const map = headersMap_(sheet);
  const found = sheet.getRange(2, map.ID + 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(String(examId)).matchEntireCell(true).findNext();
  return found ? found.getRow() : 0;
}

function saveExam_(exam) {
  const title = cleanText_(exam.title, 80);
  const subtitle = cleanText_(exam.subtitle, 120);
  const questions = Array.isArray(exam.questions) ? exam.questions.slice(0, MAX_QUESTIONS) : [];
  if (!title) throw new Error('Judul ujian wajib diisi.');
  if (!questions.length) throw new Error('Masukkan minimal satu soal.');

  // Siapkan seluruh data di memori sebelum menulis ke Spreadsheet.
  const preparedQuestions = questions.map((question, index) => {
    const alternatives = Array.isArray(question.acceptedAnswers)
      ? question.acceptedAnswers.map((value) => cleanText_(value, 500)).filter(Boolean).slice(0, 10)
      : [];
    return {
      ExamID: '', // diisi setelah ID paket dipastikan
      QuestionID: cleanText_(question.id, 80) || ('q-' + (index + 1)),
      Nomor: index + 1,
      Bagian: cleanText_(question.section, 120) || subtitle || title,
      Pertanyaan: cleanText_(question.text, 3000),
      'Kunci Jawaban': cleanText_(question.answerKey, 1000),
      'Alternatif JSON': JSON.stringify(alternatives)
    };
  }).filter((question) => question.Pertanyaan);
  if (!preparedQuestions.length) throw new Error('Tidak ada pertanyaan yang bisa disimpan.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const id = cleanText_(exam.id, 80) || ('UJIAN-' + Utilities.getUuid().slice(0, 8).toUpperCase());
    const now = new Date();

    // Simpan metadata paket dengan satu operasi tulis, bukan setValue berulang.
    const examSheet = ensureHeaderSheet_(EXAMS_SHEET, EXAM_HEADERS);
    const examMap = headersMap_(examSheet);
    const examRow = findExamRow_(id);
    const examWidth = examSheet.getLastColumn();
    let examValues;
    let targetExamRow;
    if (examRow) {
      examValues = examSheet.getRange(examRow, 1, 1, examWidth).getValues()[0];
      targetExamRow = examRow;
    } else {
      examValues = new Array(examWidth).fill('');
      targetExamRow = examSheet.getLastRow() + 1;
    }
    const previousCreated = examRow && examMap.Dibuat !== undefined ? examValues[examMap.Dibuat] : now;
    const examRecord = {
      ID: id,
      Judul: title,
      Keterangan: subtitle,
      Ditampilkan: exam.visible === true,
      Dibuat: previousCreated || now,
      Diperbarui: now
    };
    Object.keys(examRecord).forEach((key) => {
      if (examMap[key] !== undefined) examValues[examMap[key]] = examRecord[key];
    });
    examSheet.getRange(targetExamRow, 1, 1, examWidth).setValues([examValues]);

    // Baca bank soal satu kali, pertahankan paket lain, lalu tulis ulang sekaligus.
    // Ini menggantikan deleteRow() di dalam loop (sangat lambat untuk banyak soal).
    const questionSheet = ensureHeaderSheet_(QUESTIONS_SHEET, QUESTION_HEADERS);
    const questionMap = headersMap_(questionSheet);
    const questionWidth = questionSheet.getLastColumn();
    const oldLastRow = questionSheet.getLastRow();
    const oldRows = oldLastRow >= 2
      ? questionSheet.getRange(2, 1, oldLastRow - 1, questionWidth).getValues()
      : [];

    const retainedRows = oldRows.filter((row) => String(row[questionMap.ExamID] || '') !== id);
    const newRows = preparedQuestions.map((record) => {
      record.ExamID = id;
      const row = new Array(questionWidth).fill('');
      Object.keys(record).forEach((key) => {
        if (questionMap[key] !== undefined) row[questionMap[key]] = record[key];
      });
      return row;
    });
    const finalRows = retainedRows.concat(newRows);

    if (finalRows.length) {
      questionSheet.getRange(2, 1, finalRows.length, questionWidth).setValues(finalRows);
    }
    const oldDataCount = oldRows.length;
    if (oldDataCount > finalRows.length) {
      questionSheet.getRange(
        2 + finalRows.length,
        1,
        oldDataCount - finalRows.length,
        questionWidth
      ).clearContent();
    }

    return { id, title, subtitle, visible: exam.visible === true, questionCount: newRows.length,
      message: title + ' berhasil disimpan (' + newRows.length + ' soal).' };
  } finally {
    lock.releaseLock();
  }
}

function toggleExam_(examId, visible) {
  if (!examId) throw new Error('Paket ujian tidak ditemukan.');
  const sheet = ensureHeaderSheet_(EXAMS_SHEET, EXAM_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Paket ujian tidak ditemukan.');

  // Satu kali baca untuk menemukan baris; kemudian satu kali tulis untuk status.
  const map = headersMap_(sheet);
  const ids = sheet.getRange(2, map.ID + 1, lastRow - 1, 1).getValues();
  const index = ids.findIndex((row) => String(row[0]) === String(examId));
  if (index < 0) throw new Error('Paket ujian tidak ditemukan.');

  const rowNumber = index + 2;
  sheet.getRange(rowNumber, map.Ditampilkan + 1).setValue(visible === true);
  if (map.Diperbarui !== undefined) {
    sheet.getRange(rowNumber, map.Diperbarui + 1).setValue(new Date());
  }
  return {
    id: examId,
    visible: visible === true,
    message: visible ? 'Paket ujian ditampilkan.' : 'Paket ujian disembunyikan.'
  };
}

function isExamVisible_(examId) {
  const row = findExamRow_(examId);
  if (!row) return false;
  const item = readObjectRow_(ensureHeaderSheet_(EXAMS_SHEET, EXAM_HEADERS), row);
  return item.Ditampilkan === true || String(item.Ditampilkan).toLowerCase() === 'true';
}

/* =====================================================
   JAWABAN PESERTA
===================================================== */
function saveSubmission_(data) {
  ensureDefaultExam_();
  const participant = data.participant || {};
  const name = cleanText_(participant.name, 80);
  const team = cleanText_(participant.team, 50);
  const examId = cleanText_(data.examId, 80) || DEFAULT_EXAM_ID;
  if (!name) throw new Error('Nama peserta wajib diisi.');

  // Paket yang sedang dikerjakan tetap boleh dikirim walaupun pemeriksa
  // menyembunyikannya setelah peserta mulai mengerjakan.
  const examRow = findExamRow_(examId);
  if (!examRow) throw new Error('Paket ujian tidak ditemukan. Muat ulang halaman sebelum mengirim.');
  const exam = readObjectRow_(ensureHeaderSheet_(EXAMS_SHEET, EXAM_HEADERS), examRow);
  const examTitle = cleanText_(exam.Judul || data.examTitle || DEFAULT_EXAM_TITLE, 80);
  const base = DEFAULT_BASE;
  const answers = data.answers && typeof data.answers === 'object' ? data.answers : {};
  const safeAnswers = {};
  Object.keys(answers).slice(0, MAX_QUESTIONS).forEach((key) => {
    safeAnswers[String(key).slice(0, 80)] = cleanText_(answers[key], 3000);
  });
  const answered = Object.values(safeAnswers).filter((value) => String(value).trim()).length;
  const total = Math.max(1, Math.min(MAX_QUESTIONS, Number(data.questionTotal) || Object.keys(safeAnswers).length));
  const violations = Array.isArray(data.violations) ? data.violations.slice(0, 100) : [];
  const safeViolations = violations.map((item) => ({
    reason: cleanText_(item && item.reason, 120),
    at: cleanText_(item && item.at, 50)
  }));
  const violationCount = Math.max(0, Math.min(100, Number(data.violationCount) || safeViolations.length));
  const durationSeconds = Math.max(0, Math.min(86400, Number(data.durationSeconds) || 0));
  const startedAt = parseDate_(data.startedAt);
  const submittedAt = new Date();
  const id = Utilities.getUuid();

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = ensureHeaderSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
    appendObjectRow_(sheet, SUBMISSION_HEADERS, {
      ID: id,
      'Waktu Kirim': submittedAt,
      Nama: safeCell_(name),
      Pangkalan: safeCell_(base),
      'Regu/Kelompok': safeCell_(team),
      Terjawab: answered,
      'Total Soal': total,
      'Catatan Fokus': violationCount,
      'Durasi (detik)': durationSeconds,
      'Mulai Ujian': startedAt,
      'Jawaban JSON': JSON.stringify(safeAnswers),
      'Catatan Fokus JSON': JSON.stringify(safeViolations),
      'Paket Ujian ID': examId,
      'Judul Ujian': examTitle,
      'Penilaian JSON': JSON.stringify({}),
      Benar: 0,
      Salah: 0,
      'Belum Dikoreksi': total
    });
  } finally {
    lock.releaseLock();
  }

  return { id, answered, total, examId, examTitle };
}

function listSubmissions_() {
  const sheet = ensureHeaderSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const map = headersMap_(sheet);
  const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  return rows.reverse().map((row) => ({
    id: String(row[map.ID] || ''),
    submittedAt: toIso_(row[map['Waktu Kirim']]),
    name: String(row[map.Nama] || ''),
    base: String(row[map.Pangkalan] || DEFAULT_BASE),
    team: String(row[map['Regu/Kelompok']] || ''),
    answered: Number(row[map.Terjawab]) || 0,
    total: Number(row[map['Total Soal']]) || 0,
    violationCount: Number(row[map['Catatan Fokus']]) || 0,
    durationSeconds: Number(row[map['Durasi (detik)']]) || 0,
    examId: String(row[map['Paket Ujian ID']] || DEFAULT_EXAM_ID),
    examTitle: String(row[map['Judul Ujian']] || DEFAULT_EXAM_TITLE),
    correct: Number(row[map.Benar]) || 0,
    incorrect: Number(row[map.Salah]) || 0,
    pending: Number(row[map['Belum Dikoreksi']]) || 0
  }));
}

function getSubmissionDetail_(id) {
  if (!id) throw new Error('ID peserta tidak ditemukan.');
  const sheet = ensureHeaderSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Data peserta belum tersedia.');
  const map = headersMap_(sheet);
  const found = sheet.getRange(2, map.ID + 1, lastRow - 1, 1)
    .createTextFinder(id).matchEntireCell(true).findNext();
  if (!found) throw new Error('Lembar jawaban peserta tidak ditemukan.');
  const row = readObjectRow_(sheet, found.getRow());
  const examId = String(row['Paket Ujian ID'] || DEFAULT_EXAM_ID);
  return {
    id: String(row.ID),
    submittedAt: toIso_(row['Waktu Kirim']),
    participant: {
      name: String(row.Nama || ''),
      base: String(row.Pangkalan || DEFAULT_BASE),
      team: String(row['Regu/Kelompok'] || '')
    },
    answered: Number(row.Terjawab) || 0,
    total: Number(row['Total Soal']) || 0,
    violationCount: Number(row['Catatan Fokus']) || 0,
    durationSeconds: Number(row['Durasi (detik)']) || 0,
    startedAt: toIso_(row['Mulai Ujian']),
    examId,
    examTitle: String(row['Judul Ujian'] || DEFAULT_EXAM_TITLE),
    answers: parseJson_(row['Jawaban JSON'], {}),
    violations: parseJson_(row['Catatan Fokus JSON'], []),
    grades: parseJson_(row['Penilaian JSON'], {}),
    correct: Number(row.Benar) || 0,
    incorrect: Number(row.Salah) || 0,
    pending: Number(row['Belum Dikoreksi']) || 0,
    examQuestions: getExamQuestions_(examId, true)
  };
}

function saveGrades_(submissionId, grades) {
  if (!submissionId) throw new Error('ID lembar jawaban tidak ditemukan.');
  const allowed = ['correct', 'incorrect', 'pending'];
  const safeGrades = {};
  Object.keys(grades || {}).slice(0, MAX_QUESTIONS).forEach((key) => {
    const value = String(grades[key] || 'pending');
    safeGrades[String(key).slice(0, 80)] = allowed.includes(value) ? value : 'pending';
  });
  const summary = {
    correct: Object.values(safeGrades).filter((value) => value === 'correct').length,
    incorrect: Object.values(safeGrades).filter((value) => value === 'incorrect').length,
    pending: Object.values(safeGrades).filter((value) => value === 'pending').length
  };

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = ensureHeaderSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
    const map = headersMap_(sheet);
    if (sheet.getLastRow() < 2) throw new Error('Data peserta tidak ditemukan.');
    const found = sheet.getRange(2, map.ID + 1, sheet.getLastRow() - 1, 1)
      .createTextFinder(submissionId).matchEntireCell(true).findNext();
    if (!found) throw new Error('Lembar jawaban peserta tidak ditemukan.');
    const row = found.getRow();
    sheet.getRange(row, map['Penilaian JSON'] + 1).setValue(JSON.stringify(safeGrades));
    sheet.getRange(row, map.Benar + 1).setValue(summary.correct);
    sheet.getRange(row, map.Salah + 1).setValue(summary.incorrect);
    sheet.getRange(row, map['Belum Dikoreksi'] + 1).setValue(summary.pending);
  } finally {
    lock.releaseLock();
  }
  return { message: 'Koreksi berhasil disimpan.', summary };
}

/**
 * Menghapus satu kiriman peserta berdasarkan ID unik.
 * Hanya dapat dipanggil oleh pemeriksa yang sudah lolos validasi kode.
 * Data peserta lain dan paket ujian tidak disentuh.
 */
function deleteSubmission_(submissionId) {
  const id = cleanText_(submissionId, 100);
  if (!id) throw new Error('ID peserta tidak ditemukan.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = ensureHeaderSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
    if (sheet.getLastRow() < 2) throw new Error('Data peserta belum tersedia.');

    const map = headersMap_(sheet);
    const idColumn = map.ID;
    if (idColumn === undefined) throw new Error('Kolom ID tidak ditemukan pada Submissions.');

    const found = sheet.getRange(2, idColumn + 1, sheet.getLastRow() - 1, 1)
      .createTextFinder(id)
      .matchEntireCell(true)
      .findNext();

    if (!found) throw new Error('Peserta tidak ditemukan atau sudah dihapus.');

    const rowNumber = found.getRow();
    const participantName = map.Nama !== undefined
      ? String(sheet.getRange(rowNumber, map.Nama + 1).getValue() || 'Peserta')
      : 'Peserta';
    const examTitle = map['Judul Ujian'] !== undefined
      ? String(sheet.getRange(rowNumber, map['Judul Ujian'] + 1).getValue() || '')
      : '';

    // Satu baris berisi jawaban, catatan fokus, dan hasil koreksi peserta tersebut.
    sheet.deleteRow(rowNumber);

    return {
      id: id,
      name: participantName,
      examTitle: examTitle,
      message: 'Data ' + participantName + ' berhasil dihapus.'
    };
  } finally {
    lock.releaseLock();
  }
}

/* =====================================================
   UTILITAS
===================================================== */
function cleanText_(value, maxLength) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, maxLength);
}

function safeCell_(value) {
  const text = String(value == null ? '' : value);
  return /^[=+@-]/.test(text) ? "'" + text : text;
}

function parseDate_(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function parseJson_(value, fallback) {
  try { return JSON.parse(String(value || '')); }
  catch (error) { return fallback; }
}

function toIso_(value) {
  if (value instanceof Date) return value.toISOString();
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : String(value || '');
}
