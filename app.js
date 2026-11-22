/* DAKARA 02 — frontend ujian dan pemeriksa. */
const API_URL = 'https://script.google.com/macros/s/AKfycbwxTvUe8pnX7rJsLgd2bik05ClwXiAXP9wbKUuTqN-C0g9S2WIXcFWmvan8OmKq9AZj/exec';
const PAGE_SIZE = 10;
const DEFAULT_EXAM_ID = 'UJIAN-1';
const REVIEWER_FALLBACK_LABEL = 'DAKARA 02';

const $ = (selector) => document.querySelector(selector);

const state = {
  participant: null,
  selectedExamId: DEFAULT_EXAM_ID,
  publicExams: [],
  currentExam: null,
  questions: [],
  pages: [],
  answers: {},
  page: 0,
  startedAt: null,
  timerInterval: null,
  violationCount: 0,
  violations: [],
  submitted: false,
  submitConfirmed: false,
  submittedDurationSeconds: 0,
  submitTimeout: null,
  pendingNonce: null,
  pendingAdminPost: null,
  reviewerCode: '',
  activeStudentId: null,
  activeStudentRecord: null,
  activeStudentQuestions: [],
  activeStudentGrades: {},
  adminExams: [],
  editingExamId: null,
  toastTimeout: null,
  focusPromptOpen: false,
  leftPageAt: null,
  lastViolationAt: 0
};

function defaultQuestionList() {
  const sets = window.DAKARA_QUESTION_SETS || [];
  let number = 0;
  return sets.flatMap((set, setIndex) => set.questions.map((text, index) => {
    number += 1;
    return {
      id: `${setIndex + 1}-${index + 1}`,
      number,
      section: set.title,
      text,
      answerKey: '',
      acceptedAnswers: []
    };
  }));
}

function defaultExam() {
  const sets = window.DAKARA_QUESTION_SETS || [];
  return {
    id: DEFAULT_EXAM_ID,
    title: 'Ujian 1',
    subtitle: 'Materi Kepramukaan',
    visible: true,
    questionCount: sets.reduce((sum, set) => sum + set.questions.length, 0),
    questions: defaultQuestionList()
  };
}

function normalizeQuestion(question, index, exam) {
  return {
    id: String(question.id || `q-${index + 1}`),
    number: Number(question.number) || index + 1,
    section: String(question.section || exam.subtitle || exam.title || 'Soal'),
    text: String(question.text || ''),
    answerKey: String(question.answerKey || ''),
    acceptedAnswers: Array.isArray(question.acceptedAnswers)
      ? question.acceptedAnswers.map((item) => String(item)).filter(Boolean)
      : []
  };
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(state.toastTimeout);
  state.toastTimeout = setTimeout(() => toast.classList.remove('show'), 3600);
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function showScreen(screenId) {
  ['introScreen', 'examScreen', 'submittedScreen', 'reviewScreen'].forEach((id) => {
    $('#' + id).classList.toggle('hidden', id !== screenId);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function currentAnsweredCount() {
  return state.questions.reduce((count, question) => count + (String(state.answers[question.id] || '').trim() ? 1 : 0), 0);
}

function updateProgress() {
  const answered = currentAnsweredCount();
  const total = state.questions.length;
  $('#answeredMeta').textContent = `${answered} / ${total} terjawab`;
  $('#progressFill').style.width = `${total ? (answered / total) * 100 : 0}%`;
  $('#violationCount').textContent = `${state.violationCount} catatan`;
}

function formatTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function elapsedSeconds() {
  return state.startedAt ? Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000)) : 0;
}

function startTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    $('#timer').textContent = formatTime(elapsedSeconds());
  }, 1000);
}

function buildPages() {
  state.pages = Array.from({ length: Math.ceil(state.questions.length / PAGE_SIZE) }, (_, index) => ({
    start: index * PAGE_SIZE,
    end: Math.min((index + 1) * PAGE_SIZE, state.questions.length)
  }));
}

function getQuestionSections() {
  const groups = [];
  const map = new Map();
  state.questions.forEach((question, index) => {
    const label = question.section || state.currentExam?.subtitle || state.currentExam?.title || 'Soal';
    if (!map.has(label)) {
      const group = { label, firstIndex: index, count: 0 };
      groups.push(group);
      map.set(label, group);
    }
    map.get(label).count += 1;
  });
  return groups;
}

function renderSectionNav(activeQuestionIndex = 0) {
  const groups = getQuestionSections();
  const activeLabel = state.questions[activeQuestionIndex]?.section || groups[0]?.label;
  $('#examSectionNav').innerHTML = groups.map((group, index) => `
    <button type="button" class="chapter-chip ${group.label === activeLabel ? 'active' : ''}" data-section-index="${group.firstIndex}">
      <span>${String(index + 1).padStart(2, '0')}</span>
      <span>${escapeHTML(group.label)}<small>${group.count} soal</small></span>
      <b>›</b>
    </button>`).join('');
  $('#examSectionNav').querySelectorAll('[data-section-index]').forEach((button) => {
    button.addEventListener('click', () => goToQuestion(Number(button.dataset.sectionIndex)));
  });
}

function renderPage() {
  const page = state.pages[state.page];
  if (!page) return;
  const pageQuestions = state.questions.slice(page.start, page.end);
  const firstQuestion = pageQuestions[0];
  $('#sectionLabel').textContent = firstQuestion.section || state.currentExam.title;
  $('#pageHeading').textContent = state.currentExam.subtitle || state.currentExam.title;
  $('#pageCount').textContent = `${String(state.page + 1).padStart(2, '0')} / ${String(state.pages.length).padStart(2, '0')}`;
  $('#pageHint').textContent = `Halaman ${state.page + 1} dari ${state.pages.length}`;
  $('#prevPage').disabled = state.page === 0;
  $('#nextPage').classList.toggle('hidden', state.page === state.pages.length - 1);

  $('#questionList').innerHTML = pageQuestions.map((question, index) => {
    const globalIndex = page.start + index;
    return `
      <article class="question-card">
        <div class="question-number"><span>${String(question.number || globalIndex + 1).padStart(2, '0')}</span><small>PERTANYAAN ${String(globalIndex + 1).padStart(3, '0')}</small></div>
        <p class="question-text">${escapeHTML(question.text)}</p>
        <textarea aria-label="Jawaban untuk pertanyaan ${globalIndex + 1}" data-question-id="${escapeHTML(question.id)}" placeholder="Tulis jawabanmu di sini...">${escapeHTML(state.answers[question.id] || '')}</textarea>
      </article>`;
  }).join('');

  $('#questionList').querySelectorAll('textarea').forEach((textarea) => {
    textarea.addEventListener('input', (event) => {
      state.answers[event.currentTarget.dataset.questionId] = event.currentTarget.value;
      updateProgress();
    });
  });
  renderSectionNav(page.start);
  updateProgress();
}

function goToPage(nextPage) {
  if (nextPage < 0 || nextPage >= state.pages.length) return;
  state.page = nextPage;
  renderPage();
  $('.question-area').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function goToQuestion(questionIndex) {
  const pageIndex = state.pages.findIndex((page) => questionIndex >= page.start && questionIndex < page.end);
  if (pageIndex >= 0) goToPage(pageIndex);
}

async function jsonpRequest(params) {
  if (!API_URL || API_URL.includes('PASTE_URL_')) throw new Error('URL Apps Script belum dipasang di app.js.');
  return new Promise((resolve, reject) => {
    const callbackName = `dakaraCallback_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement('script');
    const query = new URLSearchParams({ ...params, callback: callbackName, _: Date.now() });
    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Server tidak merespons. Periksa URL Apps Script dan koneksi internet.'));
    }, 20000);
    window[callbackName] = (result) => {
      clearTimeout(timeout);
      cleanup();
      if (!result || result.ok !== true) reject(new Error(result?.message || 'Permintaan tidak berhasil.'));
      else resolve(result.data);
    };
    script.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error('Tidak dapat menghubungi server pemeriksa.'));
    };
    script.src = `${API_URL}?${query.toString()}`;
    document.body.appendChild(script);
  });
}

function sendPost(payload, expectedType = 'dakara-api', timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    if (state.pendingAdminPost) {
      reject(new Error('Masih ada proses yang berjalan. Tunggu sampai selesai.'));
      return;
    }
    const requestId = `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = API_URL;
    form.target = 'submitFrame';
    form.className = 'hidden-frame';
    const field = document.createElement('input');
    field.type = 'hidden';
    field.name = 'payload';
    field.value = JSON.stringify({ ...payload, requestId });
    form.appendChild(field);
    document.body.appendChild(form);

    const timeout = setTimeout(() => {
      state.pendingAdminPost = null;
      form.remove();
      reject(new Error('Server belum memberi konfirmasi. Periksa kembali daftar data sebelum mencoba ulang.'));
    }, timeoutMs);

    state.pendingAdminPost = {
      requestId,
      expectedType,
      resolve: (data) => { clearTimeout(timeout); form.remove(); resolve(data); },
      reject: (error) => { clearTimeout(timeout); form.remove(); reject(error); }
    };
    form.submit();
  });
}

async function loadPublicExams() {
  const container = $('#availableExams');
  // Angka paket tidak boleh menampilkan angka contoh dari HTML saat data
  // server belum selesai dimuat. Tampilkan indikator muat sampai ada jawaban API.
  $('#examTotalStat').textContent = '…';
  $('#questionTotalStat').textContent = '…';
  try {
    const records = await jsonpRequest({ action: 'publicExams' });
    if (!Array.isArray(records)) throw new Error('Format daftar paket ujian belum tersedia.');
    state.publicExams = records.map((exam) => ({
      ...exam,
      questions: Array.isArray(exam.questions) ? exam.questions.map((question, index) => normalizeQuestion(question, index, exam)) : []
    }));
  } catch (error) {
    // Jangan membuka paket lama secara otomatis ketika server tidak dapat dihubungi.
    // Status tampil/sembunyi harus mengikuti pengaturan pemeriksa di backend.
    state.publicExams = [];
    container.innerHTML = `<div class="no-exams">Daftar paket ujian belum berhasil dimuat. Periksa koneksi internet atau deployment Apps Script, lalu muat ulang halaman. ${escapeHTML(error.message)}</div>`;
    state.selectedExamId = '';
    $('#startExamButton').disabled = true;
    // Jangan tampilkan 0 untuk kegagalan koneksi: jumlah paket belum diketahui.
    $('#examTotalStat').textContent = '—';
    $('#questionTotalStat').textContent = '—';
    return;
  }

  if (!state.publicExams.length) {
    container.innerHTML = '<div class="no-exams">Belum ada paket ujian yang ditampilkan. Minta pemeriksa membuka salah satu paket melalui tombol Tampilkan.</div>';
    state.selectedExamId = '';
    $('#startExamButton').disabled = true;
  } else {
    if (!state.publicExams.some((exam) => exam.id === state.selectedExamId)) {
      state.selectedExamId = state.publicExams[0].id;
    }
    $('#startExamButton').disabled = false;
    renderAvailableExams();
  }
  $('#examTotalStat').textContent = String(state.publicExams.length);
  const initial = state.publicExams.find((exam) => exam.id === DEFAULT_EXAM_ID);
  if (initial) $('#questionTotalStat').textContent = String(initial.questionCount || initial.questions?.length || 140);
}

function renderAvailableExams() {
  $('#availableExams').innerHTML = state.publicExams.map((exam) => `
    <button type="button" class="exam-select-card ${state.selectedExamId === exam.id ? 'selected' : ''}" data-exam-id="${escapeHTML(exam.id)}">
      <span class="exam-select-number">${escapeHTML((exam.title || 'UJIAN').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase())}</span>
      <strong>${escapeHTML(exam.title)}</strong>
      <small>${escapeHTML(exam.subtitle || 'Paket ujian DAKARA 02')}</small>
      <span class="exam-select-count">${Number(exam.questionCount || exam.questions?.length || 0)} soal <b>→</b></span>
    </button>`).join('');
  $('#availableExams').querySelectorAll('[data-exam-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedExamId = button.dataset.examId;
      renderAvailableExams();
    });
  });
}

function addViolation(reason) {
  if (!state.startedAt || state.submitted) return;
  const now = new Date();
  if (now.getTime() - state.lastViolationAt < 2200) return;
  state.lastViolationAt = now.getTime();
  state.violationCount += 1;
  state.violations.push({ reason, at: now.toISOString() });
  updateProgress();
  $('#focusAlert').classList.add('warning-active');
  showToast(`Catatan fokus #${state.violationCount} tersimpan.`);
}

function showFocusExitPrompt() {
  if (!state.startedAt || state.submitted || state.focusPromptOpen) return;
  state.focusPromptOpen = true;
  $('#focusModalTitle').textContent = 'Keluar dari tampilan fokus?';
  $('#focusModalCopy').textContent = 'Kalau kamu memilih keluar, pemeriksa akan mendapat catatan bahwa kamu meninggalkan tampilan ujian. Catatan juga dibuat saat kamu berpindah ke aplikasi lain. Kamu yakin ingin keluar?';
  $('#focusStayButton').classList.remove('hidden');
  $('#focusLeaveButton').classList.remove('hidden');
  $('#focusResumeButton').classList.add('hidden');
  $('#focusExitModal').classList.remove('hidden');
}

function showFocusResumeNotice() {
  if (!state.startedAt || state.submitted) return;
  state.focusPromptOpen = true;
  $('#focusModalTitle').textContent = 'Halaman ujian sempat ditinggalkan.';
  $('#focusModalCopy').textContent = 'Aktivitas berpindah aplikasi atau halaman sudah dicatat dan akan terlihat oleh pemeriksa. Silakan lanjutkan setelah membaca pemberitahuan ini.';
  $('#focusStayButton').classList.add('hidden');
  $('#focusLeaveButton').classList.add('hidden');
  $('#focusResumeButton').classList.remove('hidden');
  $('#focusExitModal').classList.remove('hidden');
}

function closeFocusModal() {
  state.focusPromptOpen = false;
  $('#focusExitModal').classList.add('hidden');
}

async function requestExamFullscreen() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
  } catch (_) {
    showToast('Mode layar penuh tidak tersedia di browser ini. Ujian tetap dapat dilanjutkan.');
  }
}

function beginExam(event) {
  event.preventDefault();
  const name = $('#studentName').value.trim();
  const base = 'SMPN 2 Cikarang Utara';
  const team = $('#teamName').value.trim();
  const selected = state.publicExams.find((exam) => exam.id === state.selectedExamId);
  if (!name) {
    showToast('Nama peserta wajib diisi.');
    return;
  }
  if (!selected) {
    showToast('Pilih paket ujian yang tersedia terlebih dahulu.');
    return;
  }

  const selectedQuestions = selected.questions?.length
    ? selected.questions
    : selected.id === DEFAULT_EXAM_ID ? defaultQuestionList() : [];
  if (!selectedQuestions.length) {
    showToast('Soal untuk paket ini belum tersedia. Hubungi pemeriksa.');
    return;
  }

  state.currentExam = selected;
  state.questions = selectedQuestions.map((question, index) => normalizeQuestion(question, index, selected));
  state.participant = { name, base, team };
  $('#openExaminer').classList.add('hidden');
  state.answers = {};
  state.page = 0;
  buildPages();
  state.startedAt = Date.now();
  state.violationCount = 0;
  state.violations = [];
  state.lastViolationAt = 0;
  state.leftPageAt = null;
  state.focusPromptOpen = false;
  $('#focusExitModal').classList.add('hidden');
  $('#focusAlert').classList.remove('warning-active');
  state.submitted = false;
  state.submitConfirmed = false;
  state.submittedDurationSeconds = 0;
  $('#confirmSubmit').disabled = false;
  $('#confirmSubmit').textContent = 'Ya, kirim jawaban →';
  $('#sendingStatus').classList.add('hidden');
  $('#cancelSubmit').classList.remove('hidden');
  $('#welcomeName').textContent = `Semangat mengerjakan, ${name.split(' ')[0]}.`;
  $('#examPackageName').textContent = selected.title;
  $('#examStudentName').textContent = name;
  $('#examBaseName').textContent = base + (team ? ` • ${team}` : '');
  showScreen('examScreen');
  renderPage();
  startTimer();
  requestExamFullscreen();
}

function openSubmitModal() {
  const answered = currentAnsweredCount();
  $('#confirmStats').innerHTML = `
    <div><strong>${answered}</strong><span>TERJAWAB</span></div>
    <div><strong>${state.questions.length - answered}</strong><span>KOSONG</span></div>
    <div><strong>${state.violationCount}</strong><span>CATATAN FOKUS</span></div>`;
  $('#confirmModal').classList.remove('hidden');
}

function submitAnswers() {
  if (state.submitted) return;
  if (!API_URL || API_URL.includes('PASTE_URL_')) {
    $('#confirmModal').classList.add('hidden');
    showToast('Pengiriman belum aktif. Pengelola perlu memasang URL Apps Script di app.js.');
    return;
  }

  const nonce = (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  state.submittedDurationSeconds = elapsedSeconds();
  const payload = {
    action: 'submit',
    nonce,
    participant: state.participant,
    examId: state.currentExam.id,
    examTitle: state.currentExam.title,
    questionTotal: state.questions.length,
    answers: state.answers,
    violations: state.violations,
    violationCount: state.violationCount,
    durationSeconds: state.submittedDurationSeconds,
    startedAt: new Date(state.startedAt).toISOString(),
    submittedAt: new Date().toISOString()
  };

  $('#payloadField').value = JSON.stringify(payload);
  $('#submitForm').action = API_URL;
  state.pendingNonce = nonce;
  state.submitted = true;
  state.submitConfirmed = false;
  clearInterval(state.timerInterval);

  $('#confirmTitle').textContent = 'Mengirim jawaban...';
  $('#confirmCopy').textContent = 'Jawaban sedang dikirim ke pemeriksa. Biarkan halaman ini tetap terbuka sampai ada konfirmasi.';
  $('#confirmSubmit').disabled = true;
  $('#confirmSubmit').textContent = 'Sedang mengirim...';
  $('#cancelSubmit').classList.add('hidden');
  $('#sendingStatus').classList.remove('hidden');
  $('#sendingStatusText').textContent = 'Menghubungkan ke ruang pemeriksa…';

  requestAnimationFrame(() => {
    $('#sendingStatusText').textContent = 'Menyimpan jawaban. Mohon tunggu…';
    $('#submitForm').submit();
  });

  clearTimeout(state.submitTimeout);
  state.submitTimeout = setTimeout(() => {
    if (!state.submitConfirmed) {
      $('#confirmTitle').textContent = 'Masih menunggu konfirmasi';
      $('#confirmCopy').textContent = 'Server belum memberi balasan. Jawaban mungkin masih diproses. Jangan kirim ulang dulu; minta pemeriksa mengecek apakah namamu sudah muncul di daftar peserta.';
      $('#sendingStatusText').textContent = 'Pengiriman masih menunggu balasan dari server.';
    }
  }, 45000);
}

function completeSubmission() {
  state.submitConfirmed = true;
  clearTimeout(state.submitTimeout);
  clearInterval(state.timerInterval);
  $('#confirmModal').classList.add('hidden');
  $('#sendingStatus').classList.add('hidden');
  $('#submittedName').textContent = state.participant.name.split(' ')[0] + '.';
  $('#submittedSummary').innerHTML = `
    <div><strong>${currentAnsweredCount()}</strong><span>JAWABAN TERISI</span></div>
    <div><strong>${formatTime(state.submittedDurationSeconds || elapsedSeconds())}</strong><span>DURASI</span></div>
    <div><strong>${state.violationCount}</strong><span>CATATAN FOKUS</span></div>`;
  showScreen('submittedScreen');
  $('#openExaminer').classList.remove('hidden');
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
}

async function loadParticipants() {
  const code = $('#reviewCode').value.trim();
  const message = $('#reviewMessage');
  if (!code) {
    message.textContent = 'Masukkan kode pemeriksa terlebih dahulu.';
    return;
  }
  message.textContent = 'Menghubungkan ke data pemeriksa...';
  $('#loadParticipants').disabled = true;
  try {
    state.reviewerCode = code;
    const [examData] = await Promise.all([
      jsonpRequest({ action: 'manageExams', code: state.reviewerCode }),
      renderParticipants()
    ]);
    state.adminExams = Array.isArray(examData) ? examData.map((exam) => ({
      ...exam,
      questions: Array.isArray(exam.questions) ? exam.questions.map((question, index) => normalizeQuestion(question, index, exam)) : []
    })) : [];
    if (!state.adminExams.some((exam) => exam.id === DEFAULT_EXAM_ID)) state.adminExams.unshift(defaultExam());
    renderExamManager();
    $('#reviewLogin').classList.add('hidden');
    $('#reviewDashboard').classList.remove('hidden');
    message.textContent = '';
  } catch (error) {
    message.textContent = error.message;
  } finally {
    $('#loadParticipants').disabled = false;
  }
}

async function renderParticipants() {
  const records = await jsonpRequest({ action: 'list', code: state.reviewerCode });
  const rows = Array.isArray(records) ? records : [];
  $('#reviewStats').innerHTML = `
    <div class="review-stat"><strong>${rows.length}</strong><span>JUMLAH PESERTA</span></div>
    <div class="review-stat"><strong>${rows.reduce((sum, item) => sum + Number(item.answered || 0), 0)}</strong><span>JAWABAN TERISI</span></div>
    <div class="review-stat"><strong>${rows.reduce((sum, item) => sum + Number(item.violationCount || 0), 0)}</strong><span>CATATAN FOKUS</span></div>`;
  $('#participantsBody').innerHTML = rows.map((item) => `
    <tr>
      <td>${escapeHTML(item.name)}</td>
      <td>${escapeHTML(item.examTitle || 'Ujian 1')}</td>
      <td>${Number(item.answered || 0)} / ${Number(item.total || 0)}</td>
      <td>${Number(item.violationCount || 0)}</td>
      <td><div class="participant-actions">
        <button type="button" class="secondary-button" data-view-id="${escapeHTML(item.id)}">Periksa →</button>
        <button type="button" class="danger-button" data-delete-id="${escapeHTML(item.id)}" data-delete-name="${escapeHTML(item.name)}">Hapus</button>
      </div></td>
    </tr>`).join('');
  $('#emptyParticipants').classList.toggle('hidden', rows.length > 0);
  $('#participantsBody').querySelectorAll('[data-view-id]').forEach((button) => {
    button.addEventListener('click', () => showStudentDetail(button.dataset.viewId));
  });
  $('#participantsBody').querySelectorAll('[data-delete-id]').forEach((button) => {
    button.addEventListener('click', () => deleteParticipant(button));
  });
}

async function deleteParticipant(button) {
  const id = button.dataset.deleteId;
  const name = button.dataset.deleteName || 'peserta ini';
  if (!id) return;

  const confirmed = window.confirm(
    `Hapus data peserta ${name}?\n\nSeluruh jawaban, catatan fokus, dan hasil koreksi peserta ini akan dihapus permanen dari daftar Submissions. Data peserta lain dan paket ujian tidak akan terpengaruh.`
  );
  if (!confirmed) return;

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Menghapus...';
  try {
    const result = await sendPost({
      action: 'deleteSubmission',
      code: state.reviewerCode,
      submissionId: id
    }, 'dakara-api', 30000);

    if (state.activeStudentId === id) {
      state.activeStudentId = null;
      state.activeStudentRecord = null;
      $('#answerDetail').classList.add('hidden');
    }

    await renderParticipants();
    showToast(result?.message || `Data ${name} berhasil dihapus.`);
  } catch (error) {
    button.disabled = false;
    button.textContent = originalLabel;
    showToast(error.message || 'Data peserta belum berhasil dihapus.');
  }
}

function examQuestionsForManagement(exam) {
  if (exam.questions?.length) return exam.questions;
  if (exam.id === DEFAULT_EXAM_ID) return defaultQuestionList();
  return [];
}

function renderExamManager() {
  const list = $('#examManagerList');
  list.innerHTML = state.adminExams.map((exam) => {
    const count = exam.questions?.length || exam.questionCount || (exam.id === DEFAULT_EXAM_ID ? defaultQuestionList().length : 0);
    return `
      <article class="managed-exam-card">
        <div class="managed-exam-info">
          <span class="managed-exam-id">${escapeHTML(exam.id)}</span>
          <strong>${escapeHTML(exam.title)}</strong>
          <small>${escapeHTML(exam.subtitle || 'Tanpa keterangan')} · ${count} soal</small>
        </div>
        <span class="visibility-badge ${exam.visible ? 'is-visible' : 'is-hidden'}">${exam.visible ? 'Ditampilkan' : 'Disembunyikan'}</span>
        <div class="managed-exam-actions">
          <button type="button" class="secondary-button" data-edit-exam="${escapeHTML(exam.id)}">Edit soal</button>
          <button type="button" class="${exam.visible ? 'secondary-button' : 'primary-button'}" data-toggle-exam="${escapeHTML(exam.id)}" data-next-visible="${exam.visible ? 'false' : 'true'}">${exam.visible ? 'Sembunyikan' : 'Tampilkan'}</button>
        </div>
      </article>`;
  }).join('');

  list.querySelectorAll('[data-edit-exam]').forEach((button) => {
    button.addEventListener('click', () => showExamEditor(button.dataset.editExam));
  });
  list.querySelectorAll('[data-toggle-exam]').forEach((button) => {
    button.addEventListener('click', () => toggleExamVisibility(button.dataset.toggleExam, button.dataset.nextVisible === 'true'));
  });
}

function bulkLineForQuestion(question) {
  const alternatives = Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [];
  const keys = [question.answerKey || '', ...alternatives].map((item) => String(item).replace(/[\r\n|]/g, ' ').trim());
  return `${String(question.text || '').replace(/[\r\n|]/g, ' ').trim()} | ${keys.join(' | ')}`;
}

function showExamEditor(examId = '') {
  const isNew = !examId;
  const exam = isNew ? null : state.adminExams.find((item) => item.id === examId);
  state.editingExamId = exam?.id || null;
  $('#editorModeLabel').textContent = isNew ? 'PAKET UJIAN BARU' : `EDIT / ${exam?.id || ''}`;
  $('#editorHeading').textContent = isNew ? 'Buat paket ujian' : `Ubah ${exam?.title || 'paket ujian'}`;
  $('#examTitleInput').value = exam?.title || `Ujian ${state.adminExams.length + 1}`;
  $('#examSubtitleInput').value = exam?.subtitle || '';
  const questions = exam ? examQuestionsForManagement(exam) : [];
  $('#questionBulkInput').value = questions.map(bulkLineForQuestion).join('\n');
  $('#examVisibleInput').checked = isNew ? false : Boolean(exam?.visible);
  $('#questionFile').value = '';
  $('#examEditorMessage').textContent = '';
  updateEditorQuestionCount();
  $('#examEditor').classList.remove('hidden');
  $('#examEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeExamEditor() {
  state.editingExamId = null;
  $('#examEditor').classList.add('hidden');
  $('#questionFile').value = '';
  $('#examEditorMessage').textContent = '';
}

function parseSimpleCsvLine(line, delimiter) {
  const fields = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      fields.push(value.trim());
      value = '';
    } else value += char;
  }
  fields.push(value.trim());
  return fields;
}

function parseBulkQuestions(text) {
  return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
    .map((line, index) => {
      const delimiter = line.includes('|') ? '|' : line.includes('\t') ? '\t' : ',';
      const fields = parseSimpleCsvLine(line, delimiter).map((field) => field.trim());
      const questionText = fields[0] || '';
      const answerKey = fields[1] || '';
      const acceptedAnswers = fields.slice(2).filter(Boolean);
      const oldQuestion = state.editingExamId
        ? examQuestionsForManagement(state.adminExams.find((exam) => exam.id === state.editingExamId) || {})[index]
        : null;
      return {
        id: oldQuestion?.id || `q-${index + 1}`,
        number: index + 1,
        section: oldQuestion?.section || $('#examSubtitleInput').value.trim() || $('#examTitleInput').value.trim() || 'Soal',
        text: questionText,
        answerKey,
        acceptedAnswers
      };
    }).filter((question) => question.text);
}

function updateEditorQuestionCount() {
  const questions = parseBulkQuestions($('#questionBulkInput').value);
  $('#editorQuestionCount').textContent = `${questions.length} soal terbaca`;
}

async function loadQuestionFile() {
  const file = $('#questionFile').files?.[0];
  if (!file) {
    $('#examEditorMessage').textContent = 'Pilih file TXT atau CSV terlebih dahulu.';
    return;
  }
  try {
    const content = await file.text();
    let lines = content.split(/\r?\n/).filter((line) => line.trim());
    if (file.name.toLowerCase().endsWith('.csv')) {
      lines = lines.filter((line, index) => !(index === 0 && /soal|pertanyaan/i.test(line) && /kunci|jawaban/i.test(line)));
      $('#questionBulkInput').value = lines.map((line) => parseSimpleCsvLine(line, ',').join(' | ')).join('\n');
    } else {
      $('#questionBulkInput').value = lines.join('\n');
    }
    $('#examEditorMessage').textContent = 'File sudah dimasukkan. Periksa kembali urutan soal dan kunci jawabannya.';
    updateEditorQuestionCount();
  } catch (error) {
    $('#examEditorMessage').textContent = 'File tidak dapat dibaca. Coba simpan sebagai TXT atau CSV.';
  }
}

async function saveExam() {
  const title = $('#examTitleInput').value.trim();
  const subtitle = $('#examSubtitleInput').value.trim();
  const questions = parseBulkQuestions($('#questionBulkInput').value);
  const message = $('#examEditorMessage');
  if (!title) { message.textContent = 'Judul ujian wajib diisi.'; return; }
  if (!questions.length) { message.textContent = 'Masukkan minimal satu soal.'; return; }
  if (questions.length > 300) { message.textContent = 'Maksimal 300 soal dalam satu paket.'; return; }

  const visible = $('#examVisibleInput').checked;
  const previousLabel = $('#saveExamButton').textContent;
  $('#saveExamButton').disabled = true;
  $('#saveExamButton').textContent = 'Menyimpan…';
  message.textContent = `Menyimpan ${questions.length} soal sekaligus. Jangan tutup halaman dulu…`;
  try {
    const result = await sendPost({
      action: 'saveExam',
      code: state.reviewerCode,
      exam: {
        id: state.editingExamId || '',
        title,
        subtitle,
        visible,
        questions
      }
    });

    // Perbarui daftar di layar langsung dari data yang baru saja disimpan.
    // Tidak perlu meminta ulang semua paket, seluruh soal, dan daftar peserta.
    const savedExam = {
      id: result.id,
      title,
      subtitle,
      visible,
      questionCount: questions.length,
      questions: questions.map((question, index) => normalizeQuestion(question, index, { title, subtitle }))
    };
    const existingIndex = state.adminExams.findIndex((exam) => exam.id === savedExam.id);
    if (existingIndex >= 0) state.adminExams.splice(existingIndex, 1, savedExam);
    else state.adminExams.push(savedExam);
    renderExamManager();
    closeExamEditor();
    showToast(result?.message || 'Paket ujian berhasil disimpan.');
  } catch (error) {
    message.textContent = error.message || 'Paket belum berhasil disimpan. Periksa koneksi lalu coba lagi.';
  } finally {
    $('#saveExamButton').disabled = false;
    $('#saveExamButton').textContent = previousLabel || 'Simpan paket ujian';
  }
}

async function toggleExamVisibility(id, visible) {
  const exam = state.adminExams.find((item) => item.id === id);
  if (!exam) return;
  const previousVisible = Boolean(exam.visible);

  // Perbarui tampilan terlebih dahulu agar tombol terasa langsung merespons.
  exam.visible = visible;
  renderExamManager();
  document.querySelectorAll('[data-toggle-exam]').forEach((item) => { item.disabled = true; });
  showToast(visible ? 'Menampilkan paket ujian…' : 'Menyembunyikan paket ujian…');
  try {
    await sendPost({ action: 'toggleExam', code: state.reviewerCode, id, visible }, 'dakara-api', 20000);
    showToast(visible ? 'Paket ujian sudah ditampilkan.' : 'Paket ujian sudah disembunyikan.');
  } catch (error) {
    exam.visible = previousVisible;
    renderExamManager();
    showToast(error.message || 'Perubahan belum tersimpan.');
  } finally {
    document.querySelectorAll('[data-toggle-exam]').forEach((item) => { item.disabled = false; });
  }
}

async function reloadExamData() {
  const [adminData] = await Promise.all([
    jsonpRequest({ action: 'manageExams', code: state.reviewerCode }),
    loadPublicExams(),
    renderParticipants()
  ]);
  state.adminExams = Array.isArray(adminData) ? adminData.map((exam) => ({
    ...exam,
    questions: Array.isArray(exam.questions) ? exam.questions.map((question, index) => normalizeQuestion(question, index, exam)) : []
  })) : [];
  if (!state.adminExams.some((exam) => exam.id === DEFAULT_EXAM_ID)) state.adminExams.unshift(defaultExam());
  renderExamManager();
}

function normalizeAnswer(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,!?;:()[\]{}"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function autoGrade(question, answer) {
  const keyList = [question.answerKey, ...(question.acceptedAnswers || [])].filter((item) => String(item || '').trim());
  if (!keyList.length || !String(answer || '').trim()) return 'pending';
  const normalizedAnswer = normalizeAnswer(answer);
  return keyList.some((key) => normalizeAnswer(key) === normalizedAnswer) ? 'correct' : 'incorrect';
}

function gradeLabel(status) {
  if (status === 'correct') return 'Benar';
  if (status === 'incorrect') return 'Salah';
  return 'Belum dikoreksi';
}

function calculateGradeSummary(grades) {
  const values = Object.values(grades || {});
  return {
    correct: values.filter((value) => value === 'correct').length,
    incorrect: values.filter((value) => value === 'incorrect').length,
    pending: values.filter((value) => value !== 'correct' && value !== 'incorrect').length
  };
}

function renderGradeSummary() {
  const summary = calculateGradeSummary(state.activeStudentGrades);
  $('#gradeSummary').innerHTML = `
    <div><strong>${summary.correct}</strong><span>BENAR</span></div>
    <div><strong>${summary.incorrect}</strong><span>SALAH</span></div>
    <div><strong>${summary.pending}</strong><span>BELUM DIKOREKSI</span></div>`;
}

function renderStudentAnswerCards(record) {
  const answers = record.answers || {};
  const questions = state.activeStudentQuestions;
  $('#detailAnswers').innerHTML = questions.map((question, index) => {
    const answer = String(answers[question.id] || '').trim();
    const status = state.activeStudentGrades[question.id] || autoGrade(question, answer);
    const keys = [question.answerKey, ...(question.acceptedAnswers || [])].filter(Boolean);
    const keyHTML = keys.length
      ? `<div class="detail-key"><b>Kunci jawaban:</b> ${escapeHTML(keys.join(' / '))}</div>`
      : '<div class="detail-key no-key">Kunci belum diisi. Tentukan hasil koreksi secara manual.</div>';
    return `
      <article class="grade-answer-card">
        <div class="grade-answer-top"><span class="grade-question-no">${String(index + 1).padStart(3, '0')}</span><span class="grade-section">${escapeHTML(question.section || '')}</span><span class="grade-status ${status}">${gradeLabel(status)}</span></div>
        <div class="detail-q">${escapeHTML(question.text)}</div>
        <div class="detail-a"><b>Jawaban peserta:</b><br>${escapeHTML(answer || '— Tidak dijawab —')}</div>
        ${keyHTML}
        <div class="grade-choice"><label for="grade-${escapeHTML(question.id)}">Hasil koreksi</label><select id="grade-${escapeHTML(question.id)}" data-grade-id="${escapeHTML(question.id)}"><option value="pending" ${status === 'pending' ? 'selected' : ''}>Belum dikoreksi</option><option value="correct" ${status === 'correct' ? 'selected' : ''}>Benar</option><option value="incorrect" ${status === 'incorrect' ? 'selected' : ''}>Salah</option></select></div>
      </article>`;
  }).join('');
  $('#detailAnswers').querySelectorAll('[data-grade-id]').forEach((select) => {
    select.addEventListener('change', () => {
      state.activeStudentGrades[select.dataset.gradeId] = select.value;
      const card = select.closest('.grade-answer-card');
      const status = card.querySelector('.grade-status');
      status.className = `grade-status ${select.value}`;
      status.textContent = gradeLabel(select.value);
      renderGradeSummary();
    });
  });
  if (Array.isArray(record.violations) && record.violations.length) {
    $('#detailAnswers').insertAdjacentHTML('beforeend', `
      <div class="detail-answer"><div class="detail-q">CATATAN PERPINDAHAN FOKUS</div><div class="detail-a">${record.violations.map((item) => `${escapeHTML(item.reason)} • ${escapeHTML(new Date(item.at).toLocaleString('id-ID'))}`).join('<br>')}</div></div>`);
  }
  renderGradeSummary();
}

async function showStudentDetail(id) {
  try {
    const record = await jsonpRequest({ action: 'detail', code: state.reviewerCode, id });
    state.activeStudentId = id;
    state.activeStudentRecord = record;
    const participant = record.participant || {};
    let questions = Array.isArray(record.examQuestions) ? record.examQuestions : [];
    if (!questions.length && (!record.examId || record.examId === DEFAULT_EXAM_ID)) questions = defaultQuestionList();
    state.activeStudentQuestions = questions.map((question, index) => normalizeQuestion(question, index, { subtitle: record.examTitle }));
    state.activeStudentGrades = { ...(record.grades || {}) };
    state.activeStudentQuestions.forEach((question) => {
      if (!state.activeStudentGrades[question.id]) {
        state.activeStudentGrades[question.id] = autoGrade(question, record.answers?.[question.id] || '');
      }
    });
    $('#detailName').textContent = participant.name || 'Peserta';
    $('#detailMeta').textContent = `${participant.base || '—'}${participant.team ? ' • ' + participant.team : ''} • ${record.examTitle || 'Ujian 1'} • ${formatTime(Number(record.durationSeconds || 0))} • ${Number(record.violationCount || 0)} catatan fokus`;
    $('#gradeSaveMessage').textContent = 'Kunci yang tersedia dikoreksi otomatis. Periksa kembali dan ubah status jika diperlukan.';
    renderStudentAnswerCards(record);
    $('#answerDetail').classList.remove('hidden');
    $('#answerDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showToast(error.message);
  }
}

async function saveGrades() {
  if (!state.activeStudentId) return;
  const button = $('#saveGradesButton');
  button.disabled = true;
  $('#gradeSaveMessage').textContent = 'Menyimpan hasil koreksi...';
  try {
    const result = await sendPost({
      action: 'saveGrades',
      code: state.reviewerCode,
      submissionId: state.activeStudentId,
      grades: state.activeStudentGrades
    });
    $('#gradeSaveMessage').textContent = result?.message || 'Koreksi berhasil disimpan.';
    showToast('Hasil koreksi berhasil disimpan.');
  } catch (error) {
    $('#gradeSaveMessage').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

$('#startForm').addEventListener('submit', beginExam);
$('#prevPage').addEventListener('click', () => goToPage(state.page - 1));
$('#nextPage').addEventListener('click', () => goToPage(state.page + 1));
$('#finishButton').addEventListener('click', openSubmitModal);
$('#cancelSubmit').addEventListener('click', () => $('#confirmModal').classList.add('hidden'));
$('#confirmSubmit').addEventListener('click', submitAnswers);
$('#openExaminer').addEventListener('click', () => {
  showScreen('reviewScreen');
  $('#reviewLogin').classList.remove('hidden');
  $('#reviewDashboard').classList.add('hidden');
  $('#answerDetail').classList.add('hidden');
  $('#reviewMessage').textContent = '';
});
$('#closeExaminer').addEventListener('click', async () => {
  showScreen('introScreen');
  $('#openExaminer').classList.remove('hidden');
  await loadPublicExams();
});
$('#loadParticipants').addEventListener('click', loadParticipants);
$('#reviewCode').addEventListener('keydown', (event) => { if (event.key === 'Enter') loadParticipants(); });
$('#refreshParticipants').addEventListener('click', async () => {
  try { await renderParticipants(); showToast('Daftar peserta diperbarui.'); }
  catch (error) { showToast(error.message); }
});
$('#newExamButton').addEventListener('click', () => showExamEditor());
$('#cancelExamEdit').addEventListener('click', closeExamEditor);
$('#cancelExamEditBottom').addEventListener('click', closeExamEditor);
$('#questionBulkInput').addEventListener('input', updateEditorQuestionCount);
$('#loadQuestionFile').addEventListener('click', loadQuestionFile);
$('#saveExamButton').addEventListener('click', saveExam);
$('#saveGradesButton').addEventListener('click', saveGrades);
$('#closeDetail').addEventListener('click', () => $('#answerDetail').classList.add('hidden'));

$('#focusStayButton').addEventListener('click', () => {
  closeFocusModal();
  requestExamFullscreen();
});
$('#focusLeaveButton').addEventListener('click', () => {
  closeFocusModal();
  addViolation('Keluar dari tampilan fokus');
});
$('#focusResumeButton').addEventListener('click', closeFocusModal);

document.addEventListener('visibilitychange', () => {
  if (!state.startedAt || state.submitted) return;
  if (document.hidden) {
    state.leftPageAt = Date.now();
    closeFocusModal();
    addViolation('Meninggalkan halaman ujian / membuka aplikasi lain');
  } else if (state.leftPageAt) {
    state.leftPageAt = null;
    showFocusResumeNotice();
  }
});
window.addEventListener('blur', () => {
  if (!state.startedAt || state.submitted || state.focusPromptOpen) return;
  setTimeout(() => {
    if (state.startedAt && !state.submitted && !document.hidden && !state.focusPromptOpen) {
      addViolation('Jendela ujian kehilangan fokus');
    }
  }, 450);
});
document.addEventListener('fullscreenchange', () => {
  if (state.startedAt && !state.submitted && !document.fullscreenElement && !document.hidden) showFocusExitPrompt();
});

window.addEventListener('message', (event) => {
  if (event.source !== $('#submitFrame').contentWindow) return;
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'dakara-submit' && data.nonce === state.pendingNonce) {
    if (data.ok) completeSubmission();
    else {
      state.submitted = false;
      clearTimeout(state.submitTimeout);
      clearInterval(state.timerInterval);
      startTimer();
      $('#sendingStatus').classList.add('hidden');
      $('#confirmTitle').textContent = 'Jawaban belum tersimpan';
      $('#confirmCopy').textContent = data.message || 'Pengiriman belum berhasil. Periksa koneksi internet, lalu coba kirim kembali.';
      $('#confirmSubmit').disabled = false;
      $('#confirmSubmit').textContent = 'Coba kirim lagi';
      $('#cancelSubmit').classList.remove('hidden');
    }
    return;
  }

  if (data.type === 'dakara-api' && state.pendingAdminPost && data.requestId === state.pendingAdminPost.requestId) {
    const pending = state.pendingAdminPost;
    state.pendingAdminPost = null;
    if (data.ok) pending.resolve(data.data || {});
    else pending.reject(new Error(data.message || 'Permintaan gagal diproses.'));
  }
});

// Muat paket yang sedang dibuka oleh pemeriksa.
loadPublicExams();
