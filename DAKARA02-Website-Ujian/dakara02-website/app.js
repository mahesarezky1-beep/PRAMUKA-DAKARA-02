/* DAKARA 02 — frontend ujian. Isi API_URL setelah menerbitkan Apps Script. */
const API_URL = 'https://script.google.com/macros/s/AKfycbzAFZoLzZPQMuT36gF_A1chLkLWY4LefR71i0sJvmgC7sO7rjy34-YRyQ3u_J1sfEYK/exec';
const PAGE_SIZE = 10;

const $ = (selector) => document.querySelector(selector);
const questionSets = window.DAKARA_QUESTION_SETS || [];
const questions = questionSets.flatMap((set, setIndex) => set.questions.map((question, index) => ({
  id: `${setIndex + 1}-${index + 1}`,
  number: index + 1,
  globalNumber: questionSets.slice(0, setIndex).reduce((sum, item) => sum + item.questions.length, 0) + index + 1,
  section: set.title,
  subtitle: set.subtitle,
  text: question
})));

const state = {
  participant: null,
  answers: {},
  page: 0,
  startedAt: null,
  timerInterval: null,
  violationCount: 0,
  violations: [],
  submitted: false,
  reviewerCode: '',
  activeStudentId: null,
  toastTimeout: null,
  focusPromptOpen: false,
  leftPageAt: null,
  lastViolationAt: 0
};

const pages = Array.from({ length: Math.ceil(questions.length / PAGE_SIZE) }, (_, index) => ({
  start: index * PAGE_SIZE,
  end: Math.min((index + 1) * PAGE_SIZE, questions.length)
}));

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(state.toastTimeout);
  state.toastTimeout = setTimeout(() => toast.classList.remove('show'), 3200);
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
  return questions.reduce((count, q) => count + (String(state.answers[q.id] || '').trim() ? 1 : 0), 0);
}

function updateProgress() {
  const answered = currentAnsweredCount();
  $('#answeredMeta').textContent = `${answered} / ${questions.length} terjawab`;
  $('#progressFill').style.width = `${(answered / questions.length) * 100}%`;
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

function renderPage() {
  const page = pages[state.page];
  const pageQuestions = questions.slice(page.start, page.end);
  const firstQuestion = pageQuestions[0];
  const isChapterThree = firstQuestion.globalNumber > questionSets[0].questions.length;

  $('#sectionLabel').textContent = firstQuestion.section;
  $('#pageHeading').textContent = firstQuestion.subtitle;
  $('#pageCount').textContent = `${String(state.page + 1).padStart(2, '0')} / ${String(pages.length).padStart(2, '0')}`;
  $('#pageHint').textContent = `Halaman ${state.page + 1} dari ${pages.length}`;
  $('#chapterOneChip').classList.toggle('active', !isChapterThree);
  $('#chapterThreeChip').classList.toggle('active', isChapterThree);
  $('#prevPage').disabled = state.page === 0;
  $('#nextPage').classList.toggle('hidden', state.page === pages.length - 1);

  $('#questionList').innerHTML = pageQuestions.map((q) => `
    <article class="question-card">
      <div class="question-number"><span>${String(q.number).padStart(2, '0')}</span><small>PERTANYAAN ${String(q.globalNumber).padStart(3, '0')}</small></div>
      <p class="question-text">${escapeHTML(q.text)}</p>
      <textarea aria-label="Jawaban untuk pertanyaan ${q.globalNumber}" data-question-id="${q.id}" placeholder="Tulis jawabanmu di sini...">${escapeHTML(state.answers[q.id] || '')}</textarea>
    </article>
  `).join('');

  $('#questionList').querySelectorAll('textarea').forEach((textarea) => {
    textarea.addEventListener('input', (event) => {
      state.answers[event.currentTarget.dataset.questionId] = event.currentTarget.value;
      updateProgress();
    });
  });
  updateProgress();
  $('#questionArea')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function goToPage(nextPage) {
  if (nextPage < 0 || nextPage >= pages.length) return;
  state.page = nextPage;
  renderPage();
  $('.question-area').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function addViolation(reason) {
  if (!state.startedAt || state.submitted) return;
  const now = new Date();
  // Satu perpindahan aplikasi bisa memicu beberapa event browser sekaligus.
  // Batasi agar satu kejadian tidak dihitung berulang kali.
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
  const base = $('#baseName').value.trim();
  const team = $('#teamName').value.trim();
  if (!name || !base) {
    showToast('Nama dan pangkalan wajib diisi.');
    return;
  }
  state.participant = { name, base, team };
  $('#openExaminer').classList.add('hidden');
  state.answers = {};
  state.page = 0;
  state.startedAt = Date.now();
  state.violationCount = 0;
  state.violations = [];
  state.lastViolationAt = 0;
  state.leftPageAt = null;
  state.focusPromptOpen = false;
  $('#focusExitModal').classList.add('hidden');
  state.submitted = false;
  $('#welcomeName').textContent = `Semangat mengerjakan, ${name.split(' ')[0]}.`;
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
    <div><strong>${questions.length - answered}</strong><span>KOSONG</span></div>
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
  const nonce = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const payload = {
    nonce,
    participant: state.participant,
    answers: state.answers,
    violations: state.violations,
    violationCount: state.violationCount,
    durationSeconds: elapsedSeconds(),
    startedAt: new Date(state.startedAt).toISOString(),
    submittedAt: new Date().toISOString()
  };
  $('#payloadField').value = JSON.stringify(payload);
  $('#submitForm').action = API_URL;
  $('#confirmModal').classList.add('hidden');
  $('#confirmSubmit').disabled = true;
  $('#confirmSubmit').textContent = 'Mengirim...';
  $('#confirmModal').classList.remove('hidden');
  $('#confirmTitle').textContent = 'Mengirim jawaban...';
  $('#confirmCopy').textContent = 'Jangan tutup halaman sampai pengiriman selesai.';
  $('#cancelSubmit').classList.add('hidden');
  state.pendingNonce = nonce;
  state.submitted = true;
  $('#submitForm').submit();
  state.submitTimeout = setTimeout(() => {
    if (!state.submitConfirmed) {
      $('#confirmTitle').textContent = 'Belum ada konfirmasi.';
      $('#confirmCopy').textContent = 'Pengiriman mungkin sedang diproses. Periksa koneksi internet dan jangan kirim ulang sebelum memastikan kepada pemeriksa.';
      $('#confirmSubmit').classList.add('hidden');
      $('#cancelSubmit').classList.remove('hidden');
      $('#cancelSubmit').textContent = 'Tutup';
    }
  }, 18000);
}

function completeSubmission() {
  state.submitConfirmed = true;
  clearTimeout(state.submitTimeout);
  clearInterval(state.timerInterval);
  $('#confirmModal').classList.add('hidden');
  $('#submittedName').textContent = state.participant.name.split(' ')[0] + '.';
  $('#submittedSummary').innerHTML = `
    <div><strong>${currentAnsweredCount()}</strong><span>JAWABAN TERISI</span></div>
    <div><strong>${formatTime(elapsedSeconds())}</strong><span>DURASI</span></div>
    <div><strong>${state.violationCount}</strong><span>CATATAN FOKUS</span></div>`;
  showScreen('submittedScreen');
  $('#openExaminer').classList.remove('hidden');
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
}

function jsonpRequest(params) {
  return new Promise((resolve, reject) => {
    if (!API_URL || API_URL.includes('PASTE_URL_')) {
      reject(new Error('URL Apps Script belum dipasang di app.js.'));
      return;
    }
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
    }, 15000);
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

async function loadParticipants() {
  const code = $('#reviewCode').value.trim();
  const message = $('#reviewMessage');
  if (!code) {
    message.textContent = 'Masukkan kode pemeriksa terlebih dahulu.';
    return;
  }
  message.textContent = 'Menghubungkan ke data peserta...';
  $('#loadParticipants').disabled = true;
  try {
    state.reviewerCode = code;
    await renderParticipants();
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
      <td>${escapeHTML(item.base)}${item.team ? `<br><small>${escapeHTML(item.team)}</small>` : ''}</td>
      <td>${Number(item.answered || 0)} / ${questions.length}</td>
      <td>${Number(item.violationCount || 0)}</td>
      <td><button type="button" class="secondary-button" data-view-id="${escapeHTML(item.id)}">Periksa →</button></td>
    </tr>`).join('');
  $('#emptyParticipants').classList.toggle('hidden', rows.length > 0);
  $('#participantsBody').querySelectorAll('[data-view-id]').forEach((button) => {
    button.addEventListener('click', () => showStudentDetail(button.dataset.viewId));
  });
}

async function showStudentDetail(id) {
  try {
    const record = await jsonpRequest({ action: 'detail', code: state.reviewerCode, id });
    state.activeStudentId = id;
    const participant = record.participant || {};
    const answers = record.answers || {};
    const violations = Array.isArray(record.violations) ? record.violations : [];
    $('#detailName').textContent = participant.name || 'Peserta';
    $('#detailMeta').textContent = `${participant.base || '—'}${participant.team ? ' • ' + participant.team : ''} • ${formatTime(Number(record.durationSeconds || 0))} • ${Number(record.violationCount || 0)} catatan fokus`;
    $('#detailAnswers').innerHTML = questions.map((q) => `
      <div class="detail-answer">
        <div class="detail-q">${String(q.globalNumber).padStart(3, '0')}. ${escapeHTML(q.text)}</div>
        <div class="detail-a">${escapeHTML(String(answers[q.id] || '').trim() || '— Belum dijawab —')}</div>
      </div>`).join('') + (violations.length ? `
      <div class="detail-answer"><div class="detail-q">CATATAN PERPINDAHAN FOKUS</div><div class="detail-a">${violations.map((v) => `${escapeHTML(v.reason)} • ${escapeHTML(new Date(v.at).toLocaleString('id-ID'))}`).join('\n')}</div></div>` : '');
    $('#answerDetail').classList.remove('hidden');
    $('#answerDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showToast(error.message);
  }
}

function jumpToChapter(chapter) {
  const targetIndex = chapter === 1 ? 0 : questionSets[0].questions.length;
  const page = pages.findIndex((item) => targetIndex >= item.start && targetIndex < item.end);
  goToPage(Math.max(0, page));
}

$('#startForm').addEventListener('submit', beginExam);
$('#prevPage').addEventListener('click', () => goToPage(state.page - 1));
$('#nextPage').addEventListener('click', () => goToPage(state.page + 1));
$('#chapterOneChip').addEventListener('click', () => jumpToChapter(1));
$('#chapterThreeChip').addEventListener('click', () => jumpToChapter(3));
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
$('#closeExaminer').addEventListener('click', () => { showScreen('introScreen'); $('#openExaminer').classList.remove('hidden'); });
$('#loadParticipants').addEventListener('click', loadParticipants);
$('#reviewCode').addEventListener('keydown', (event) => { if (event.key === 'Enter') loadParticipants(); });
$('#refreshParticipants').addEventListener('click', async () => {
  try { await renderParticipants(); showToast('Daftar peserta diperbarui.'); }
  catch (error) { showToast(error.message); }
});
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
    // Jika peserta berpindah aplikasi, catat saat halaman ditinggalkan.
    // Peringatannya baru ditampilkan lagi ketika peserta kembali.
    closeFocusModal();
    addViolation('Meninggalkan halaman ujian / membuka aplikasi lain');
  } else if (state.leftPageAt) {
    state.leftPageAt = null;
    showFocusResumeNotice();
  }
});
window.addEventListener('blur', () => {
  if (!state.startedAt || state.submitted || state.focusPromptOpen) return;
  // Tunggu sebentar: saat pindah aplikasi, event visibilitychange biasanya menyusul.
  // Dengan begitu satu perpindahan tidak dihitung dua kali.
  setTimeout(() => {
    if (state.startedAt && !state.submitted && !document.hidden && !state.focusPromptOpen) {
      addViolation('Jendela ujian kehilangan fokus');
    }
  }, 450);
});
document.addEventListener('fullscreenchange', () => {
  if (state.startedAt && !state.submitted && !document.fullscreenElement && !document.hidden) {
    showFocusExitPrompt();
  }
});
window.addEventListener('message', (event) => {
  if (event.source !== $('#submitFrame').contentWindow) return;
  const data = event.data;
  if (!data || data.type !== 'dakara-submit' || data.nonce !== state.pendingNonce) return;
  if (data.ok) completeSubmission();
  else {
    state.submitted = false;
    $('#confirmTitle').textContent = 'Pengiriman gagal.';
    $('#confirmCopy').textContent = data.message || 'Jawaban belum berhasil disimpan. Silakan hubungi pemeriksa.';
    $('#confirmSubmit').disabled = false;
    $('#confirmSubmit').textContent = 'Coba lagi';
    $('#cancelSubmit').classList.remove('hidden');
  }
});

// Beri informasi bila file questions.js tidak termuat atau format soal berubah.
if (!questions.length) {
  $('#startForm').querySelector('button[type="submit"]').disabled = true;
  showToast('Bank soal tidak ditemukan. Pastikan questions.js ikut diunggah ke GitHub.');
}
