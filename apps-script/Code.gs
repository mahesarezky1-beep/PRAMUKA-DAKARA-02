/**
 * DAKARA 02 — backend Google Apps Script.
 * Buat Google Sheet kosong, buka Extensions > Apps Script, lalu tempel file ini.
 * GANTI REVIEWER_CODE sebelum deployment.
 */
const REVIEWER_CODE = 'GANTI-KODE-PEMERIKSA-ANDA';
const SHEET_NAME = 'Submissions';
const HEADERS = [
  'ID', 'Waktu Kirim', 'Nama', 'Pangkalan', 'Regu/Kelompok',
  'Terjawab', 'Total Soal', 'Catatan Fokus', 'Durasi (detik)',
  'Mulai Ujian', 'Jawaban JSON', 'Catatan Fokus JSON'
];
const QUESTION_TOTAL = 140;

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Script harus dibuat dari menu Extensions > Apps Script pada Google Sheet.');
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.autoResizeColumns(1, HEADERS.length);
  }
  return 'Siap. Tab Submissions sudah tersedia.';
}

function doPost(e) {
  let nonce = '';
  try {
    const raw = e && e.parameter && e.parameter.payload ? e.parameter.payload : '';
    if (!raw) throw new Error('Data jawaban tidak ditemukan.');
    if (raw.length > 450000) throw new Error('Ukuran kiriman terlalu besar.');
    const data = JSON.parse(raw);
    nonce = String(data.nonce || '').slice(0, 100);
    const participant = data.participant || {};
    const name = cleanText_(participant.name, 80);
    const base = cleanText_(participant.base, 100);
    const team = cleanText_(participant.team, 50);
    if (!name || !base) throw new Error('Nama dan pangkalan wajib diisi.');

    const answers = data.answers && typeof data.answers === 'object' ? data.answers : {};
    const safeAnswers = {};
    Object.keys(answers).slice(0, QUESTION_TOTAL).forEach((key) => {
      safeAnswers[String(key).slice(0, 20)] = cleanText_(answers[key], 3000);
    });
    const answered = Object.values(safeAnswers).filter((answer) => String(answer).trim()).length;
    const violations = Array.isArray(data.violations) ? data.violations.slice(0, 100) : [];
    const safeViolations = violations.map((item) => ({
      reason: cleanText_(item && item.reason, 100),
      at: cleanText_(item && item.at, 50)
    }));
    const violationCount = Math.max(0, Math.min(100, Number(data.violationCount) || safeViolations.length));
    const durationSeconds = Math.max(0, Math.min(86400, Number(data.durationSeconds) || 0));
    const startedAt = parseDate_(data.startedAt);
    const submittedAt = new Date();
    const id = Utilities.getUuid();

    const sheet = getSheet_();
    sheet.appendRow([
      id,
      submittedAt,
      safeCell_(name),
      safeCell_(base),
      safeCell_(team),
      answered,
      QUESTION_TOTAL,
      violationCount,
      durationSeconds,
      startedAt,
      JSON.stringify(safeAnswers),
      JSON.stringify(safeViolations)
    ]);
    return iframeResponse_({ type: 'dakara-submit', ok: true, nonce: nonce });
  } catch (error) {
    return iframeResponse_({
      type: 'dakara-submit', ok: false, nonce: nonce,
      message: error && error.message ? error.message : 'Terjadi kesalahan saat menyimpan jawaban.'
    });
  }
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const callback = String(params.callback || '');
  const action = String(params.action || '');
  let result;
  try {
    if (params.code !== REVIEWER_CODE || REVIEWER_CODE === 'GANTI-KODE-PEMERIKSA-ANDA') {
      throw new Error('Kode pemeriksa tidak sesuai atau belum diatur.');
    }
    if (action === 'list') {
      result = { ok: true, data: listSubmissions_() };
    } else if (action === 'detail') {
      const id = String(params.id || '').slice(0, 100);
      result = { ok: true, data: getSubmissionDetail_(id) };
    } else {
      result = { ok: true, data: { message: 'DAKARA 02 API aktif.' } };
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

function listSubmissions_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return rows.reverse().map((row) => ({
    id: String(row[0]),
    submittedAt: row[1] instanceof Date ? row[1].toISOString() : String(row[1]),
    name: String(row[2]),
    base: String(row[3]),
    team: String(row[4]),
    answered: Number(row[5]) || 0,
    total: Number(row[6]) || QUESTION_TOTAL,
    violationCount: Number(row[7]) || 0,
    durationSeconds: Number(row[8]) || 0
  }));
}

function getSubmissionDetail_(id) {
  if (!id) throw new Error('ID peserta tidak ditemukan.');
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Data peserta belum tersedia.');
  const found = sheet.getRange(2, 1, lastRow - 1, HEADERS.length)
    .createTextFinder(id).matchEntireCell(true).findNext();
  if (!found) throw new Error('Lembar jawaban peserta tidak ditemukan.');
  const row = sheet.getRange(found.getRow(), 1, 1, HEADERS.length).getValues()[0];
  return {
    id: String(row[0]),
    submittedAt: row[1] instanceof Date ? row[1].toISOString() : String(row[1]),
    participant: { name: String(row[2]), base: String(row[3]), team: String(row[4]) },
    answered: Number(row[5]) || 0,
    total: Number(row[6]) || QUESTION_TOTAL,
    violationCount: Number(row[7]) || 0,
    durationSeconds: Number(row[8]) || 0,
    startedAt: row[9] instanceof Date ? row[9].toISOString() : String(row[9]),
    answers: parseJson_(row[10], {}),
    violations: parseJson_(row[11], [])
  };
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Spreadsheet tidak terhubung. Buat Apps Script dari Google Sheet.');
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function iframeResponse_(message) {
  const encoded = JSON.stringify(message).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<script>try{window.top.postMessage(' + encoded + ', "*");}catch(e){}</script>' +
    '<p>Pengiriman DAKARA 02 selesai. Halaman ini boleh ditutup.</p></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle('DAKARA 02 — Pengiriman')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function cleanText_(value, maxLength) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maxLength);
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
  catch (_) { return fallback; }
}
