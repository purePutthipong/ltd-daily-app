// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const STORAGE_KEY    = 'ltd-daily-v1';
const COST_KEY       = 'ltd-costbasis';
const VOCAB_KEY      = 'ltd-vocab-v1';
const NOTIF_KEY      = 'ltd-notif-v1';
const DCA_KEY        = 'ltd-dca-v1';
const MAX_WATER      = 8;
const SRS_INTERVALS  = [0, 1, 3, 7, 14, 30]; // days per level 0-5

let VOCAB_WORDS = [];
const WORDS_CACHE_KEY = 'ltd-words-v1';

async function loadWords() {
  // Use cache first for instant startup
  try {
    const cached = JSON.parse(localStorage.getItem(WORDS_CACHE_KEY) || 'null');
    if (Array.isArray(cached) && cached.length > 0) VOCAB_WORDS = cached;
  } catch {}

  // Always fetch latest in background
  try {
    const res = await fetch('./words.json');
    if (res.ok) {
      const words = await res.json();
      if (Array.isArray(words) && words.length > 0) {
        VOCAB_WORDS = words;
        localStorage.setItem(WORDS_CACHE_KEY, JSON.stringify(words));
      }
    }
  } catch {}
}

const GOOGLE_CLIENT_ID = '125209458743-96tf37mk9j35sjnb3e46pe41o0d34buc.apps.googleusercontent.com';

const MOODS = { 1:'😴 ง่วง', 2:'😕 แย่', 3:'😐 ปกติ', 4:'🙂 ดี', 5:'😄 ดีมาก' };

const MONTH_TH = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
];
const DAY_TH = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

// ─── STATE ───────────────────────────────────────────────────────────────────

let data          = {};
let currentMood   = 0;
let currentEnergy = 0;
let currentSubject = 'Control';

// ─── STORAGE ─────────────────────────────────────────────────────────────────

function loadData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  if (gAccessToken) driveSave(gAccessToken, data).catch(() => {});
}

function loadCostBasis() {
  try { return JSON.parse(localStorage.getItem(COST_KEY) || '{}'); }
  catch { return {}; }
}
function saveCostBasis(cb) {
  localStorage.setItem(COST_KEY, JSON.stringify(cb));
}

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function parseDate(str) {
  // parse YYYY-MM-DD in local time (avoid UTC offset issues)
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m-1, d);
}

function getWeekDates() {
  const d = new Date();
  const dow = d.getDay(); // 0=Sun
  const monday = new Date(d);
  monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    dates.push(`${dd.getFullYear()}-${pad(dd.getMonth()+1)}-${pad(dd.getDate())}`);
  }
  return dates;
}

function formatDate(str) {
  const d = parseDate(str);
  return {
    day:  DAY_TH[d.getDay()],
    full: `${d.getDate()} ${MONTH_TH[d.getMonth()]} ${d.getFullYear()}`
  };
}

// ─── LOG HELPERS ──────────────────────────────────────────────────────────────

function getLog(date) {
  if (!data[date]) {
    data[date] = {
      date,
      water:    0,
      exercise: false,
      morning:  { wakeTime: '', mood: 0, tasks: ['', '', ''], tasksDone: [false, false, false] },
      night:    { sleepTime: '', energy: 0, reflection: '' }
    };
  }
  if (!data[date].morning.tasksDone) data[date].morning.tasksDone = [false, false, false];
  return data[date];
}

// ─── STREAKS ─────────────────────────────────────────────────────────────────

function calcStreaks() {
  const d = new Date();
  const dates = [];
  for (let i = 0; i < 60; i++) {
    dates.push(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`);
    d.setDate(d.getDate() - 1);
  }

  function streak(fn) {
    let count = 0;
    for (const date of dates) {
      const log = data[date];
      if (!log || !fn(log)) break;
      count++;
    }
    return count;
  }

  return {
    log:      streak(log => (log.morning?.mood > 0 || !!log.morning?.wakeTime) &&
                            (log.night?.energy > 0 || !!log.night?.sleepTime)),
    water:    streak(log => (log.water || 0) >= 6),
    exercise: streak(log => log.exercise === true),
    vocab:    calcVocabStreak()
  };
}

// ─── RENDER HOME ─────────────────────────────────────────────────────────────

function renderHome() {
  const today = getToday();
  const log   = getLog(today);
  const { day, full } = formatDate(today);

  document.getElementById('date-day').textContent  = day;
  document.getElementById('date-full').textContent = full;

  // Streaks
  const st = calcStreaks();
  const pills = [
    { label: 'Log',   val: st.log,      icon: '📝' },
    { label: 'น้ำ',   val: st.water,    icon: '💧' },
    { label: 'ออกกำลัง', val: st.exercise, icon: '🏃' },
    { label: 'EN',    val: st.vocab,    icon: '📚' }
  ].filter(p => p.val > 0);
  document.getElementById('streak-row').innerHTML = pills.length
    ? pills.map(p => `<div class="streak-pill">🔥 ${p.val} <span class="streak-unit">วัน</span> ${p.icon} ${p.label}</div>`).join('')
    : '';

  // Water dots
  const dotsEl = document.getElementById('water-dots');
  dotsEl.innerHTML = '';
  for (let i = 1; i <= MAX_WATER; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot' + (i <= log.water ? ' filled' : '');
    dot.onclick = () => setWater(i);
    dotsEl.appendChild(dot);
  }
  document.getElementById('water-label').textContent = `${log.water} / ${MAX_WATER} แก้ว`;

  // Exercise toggle
  document.getElementById('exercise-toggle').className =
    'toggle' + (log.exercise ? ' on' : '');

  // Morning card
  const mDone = log.morning.mood > 0 || !!log.morning.wakeTime;
  const mBadge = document.getElementById('morning-badge');
  mBadge.textContent = mDone ? '✓ บันทึกแล้ว' : '+ Log';
  mBadge.className   = 'log-badge' + (mDone ? ' done' : '');

  const mPreview = document.getElementById('morning-preview');
  if (mDone) {
    const parts = [];
    if (log.morning.wakeTime) parts.push(`ตื่น ${log.morning.wakeTime}`);
    if (log.morning.mood)     parts.push(MOODS[log.morning.mood]);
    const tasks = log.morning.tasks.filter(t => t.trim());
    if (tasks.length) {
      const doneCount = (log.morning.tasksDone || []).filter((d, i) => d && log.morning.tasks[i].trim()).length;
      parts.push(`${doneCount}/${tasks.length} task ✅`);
    }
    mPreview.textContent = parts.join('  ·  ');
  } else {
    mPreview.textContent = 'ยังไม่ได้บันทึก';
  }

  // Night card
  const nDone = !!log.night.sleepTime || log.night.energy > 0;
  const nBadge = document.getElementById('night-badge');
  nBadge.textContent = nDone ? '✓ บันทึกแล้ว' : '+ Log';
  nBadge.className   = 'log-badge' + (nDone ? ' done' : '');

  const nPreview = document.getElementById('night-preview');
  if (nDone) {
    const parts = [];
    if (log.night.sleepTime) parts.push(`นอน ${log.night.sleepTime}`);
    if (log.night.energy)    parts.push(`Energy ${log.night.energy}/5`);
    nPreview.textContent = parts.join('  ·  ');
  } else {
    nPreview.textContent = 'ยังไม่ได้บันทึก';
  }

  // Study card
  const studyLog = log.study || [];
  const studyBadge   = document.getElementById('study-badge');
  const studyPreview = document.getElementById('study-preview');
  if (studyBadge && studyPreview) {
    if (studyLog.length) {
      const totalMins = studyLog.reduce((s, e) => s + e.mins, 0);
      const h = Math.floor(totalMins / 60), m = totalMins % 60;
      studyBadge.textContent = `✓ ${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm' : ''}`.trim();
      studyBadge.className   = 'log-badge done';
      const bySubj = {};
      studyLog.forEach(e => { bySubj[e.subject] = (bySubj[e.subject] || 0) + e.mins; });
      studyPreview.textContent = Object.entries(bySubj)
        .map(([s, m]) => `${s} ${m < 60 ? m + 'm' : (m/60).toFixed(1) + 'h'}`).join('  ·  ');
    } else {
      studyBadge.textContent = '+ Log';
      studyBadge.className   = 'log-badge';
      studyPreview.textContent = 'ยังไม่ได้บันทึก';
    }
  }

  // Weekly goals
  renderWeeklyGoals();

  // Task quick card
  const tqc = document.getElementById('task-quick-card');
  if (tqc) {
    const tasks    = log.morning.tasks    || [];
    const taskDone = log.morning.tasksDone || [false, false, false];
    const active   = tasks.map((t, i) => ({ text: t, done: taskDone[i], idx: i })).filter(t => t.text.trim());
    if (active.length) {
      tqc.innerHTML = `
        <div class="card">
          <div class="card-title">✅ Tasks วันนี้</div>
          <div class="task-quick-list">
            ${active.map(t => `
              <div class="task-quick-row" onclick="toggleTaskCb(${t.idx})">
                <span class="task-quick-cb">${t.done ? '✅' : '○'}</span>
                <span class="task-quick-text${t.done ? ' done' : ''}">${esc(t.text)}</span>
              </div>`).join('')}
          </div>
        </div>`;
    } else {
      tqc.innerHTML = '';
    }
  }
}

// ─── WATER ───────────────────────────────────────────────────────────────────

function addWater() {
  const log = getLog(getToday());
  if (log.water < MAX_WATER) {
    log.water++;
    save();
    renderHome();
    showToast(`💧 ${log.water} / ${MAX_WATER} แก้ว`);
  }
}

function removeWater() {
  const log = getLog(getToday());
  if (log.water > 0) {
    log.water--;
    save();
    renderHome();
  }
}

function setWater(n) {
  const log = getLog(getToday());
  log.water = (log.water === n) ? n - 1 : n;
  save();
  renderHome();
}

// ─── EXERCISE ─────────────────────────────────────────────────────────────────

function toggleExercise() {
  const log = getLog(getToday());
  log.exercise = !log.exercise;
  save();
  renderHome();
  showToast(log.exercise ? '🏃 ออกกำลังกายแล้ว!' : '🏃 ยกเลิก');
}

// ─── OVERLAY ──────────────────────────────────────────────────────────────────

function openOverlay(name) {
  const log = getLog(getToday());

  if (name === 'morning') {
    document.getElementById('wake-time').value = log.morning.wakeTime || '';
    document.getElementById('task-1').value    = log.morning.tasks[0] || '';
    document.getElementById('task-2').value    = log.morning.tasks[1] || '';
    document.getElementById('task-3').value    = log.morning.tasks[2] || '';
    currentMood = log.morning.mood;
    syncMoodUI();
    syncTaskCbUI(log);
    document.getElementById('overlay-morning').classList.add('open');
    if (!log.morning.wakeTime) tryAutoFill('wake');
  } else if (name === 'settings') {
    openSettingsOverlay();
  } else if (name === 'pomodoro') {
    openPomodoro();
  } else if (name === 'study') {
    openStudyOverlay();
  } else {
    document.getElementById('sleep-time').value  = log.night.sleepTime || '';
    document.getElementById('reflection').value  = log.night.reflection || '';
    currentEnergy = log.night.energy;
    syncEnergyUI();
    document.getElementById('overlay-night').classList.add('open');
    if (!log.night.sleepTime) tryAutoFill('sleep');
  }
}

function closeOverlay() {
  document.querySelectorAll('.overlay').forEach(o => o.classList.remove('open'));
}

// ─── MOOD ─────────────────────────────────────────────────────────────────────

function selectMood(n) {
  currentMood = n;
  syncMoodUI();
}

function syncMoodUI() {
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.classList.toggle('selected', +btn.dataset.mood === currentMood);
  });
}

// ─── ENERGY ───────────────────────────────────────────────────────────────────

function selectEnergy(n) {
  currentEnergy = n;
  syncEnergyUI();
}

function syncEnergyUI() {
  document.querySelectorAll('.energy-btn').forEach(btn => {
    btn.classList.toggle('selected', +btn.dataset.e === currentEnergy);
  });
}

// ─── SAVE ─────────────────────────────────────────────────────────────────────

function saveMorning() {
  const log = getLog(getToday());
  log.morning.wakeTime  = document.getElementById('wake-time').value;
  log.morning.mood      = currentMood;
  log.morning.tasks     = [
    document.getElementById('task-1').value.trim(),
    document.getElementById('task-2').value.trim(),
    document.getElementById('task-3').value.trim()
  ];
  // preserve tasksDone as-is (already updated by toggleTaskCb)
  save();
  closeOverlay();
  renderHome();
  showToast('🌅 Morning บันทึกแล้ว!');
}

function saveNight() {
  const log = getLog(getToday());
  log.night.sleepTime  = document.getElementById('sleep-time').value;
  log.night.energy     = currentEnergy;
  log.night.reflection = document.getElementById('reflection').value.trim();
  save();
  closeOverlay();
  renderHome();
  showToast('🌙 Night บันทึกแล้ว!');
}

// ─── TAB SWITCHING ────────────────────────────────────────────────────────────

function switchTab(tab) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${tab}`).classList.add('active');
  document.getElementById(`nav-${tab}`).classList.add('active');
  if (tab === 'history')   renderHistory();
  if (tab === 'insights')  renderInsights();
  if (tab === 'portfolio') renderPortfolio();
  if (tab === 'vocab')     renderVocab();
}

// ─── HISTORY ─────────────────────────────────────────────────────────────────

function renderHistory() {
  const container = document.getElementById('history-list');
  const dates = Object.keys(data).sort((a, b) => b.localeCompare(a));

  if (!dates.length) {
    container.innerHTML = `
      <div class="empty">
        <div class="empty-icon">📋</div>
        <div class="empty-text">ยังไม่มีข้อมูล<br>เริ่มบันทึกวันแรกได้เลย!</div>
      </div>`;
    return;
  }

  container.innerHTML = dates.map(date => {
    const log = data[date];
    const { day, full } = formatDate(date);

    const chips = [];
    if (log.water > 0)         chips.push(`💧 ${log.water}/${MAX_WATER}`);
    if (log.exercise)          chips.push('🏃 ออกกำลังกาย');
    if (log.morning?.mood)     chips.push(MOODS[log.morning.mood]);
    if (log.night?.energy)     chips.push(`⚡ ${log.night.energy}/5`);
    const studyMins = (log.study || []).reduce((s, e) => s + e.mins, 0);
    if (studyMins > 0)         chips.push(`📖 ${studyMins < 60 ? studyMins + 'm' : (studyMins/60).toFixed(1) + 'h'}`);

    const chipsHtml = chips.map(c => `<span class="chip">${c}</span>`).join('');

    return `
      <div class="history-card">
        <div class="history-card-header" onclick="toggleDetail('${date}')">
          <div>
            <div class="history-date">${day} ${full}</div>
            <div class="history-chips">${chipsHtml || '<span class="chip">ว่าง</span>'}</div>
          </div>
          <div class="expand-icon" id="ei-${date}">▾</div>
        </div>
        <div class="history-detail" id="detail-${date}">
          <pre class="md-preview">${esc(toMarkdown(log))}</pre>
          <button class="btn-copy" onclick="copyMd('${date}')">📋 Copy Markdown</button>
        </div>
      </div>`;
  }).join('');
}

function toggleDetail(date) {
  document.getElementById(`detail-${date}`).classList.toggle('open');
  document.getElementById(`ei-${date}`).classList.toggle('open');
}

function copyMd(date) {
  const log = data[date];
  if (!log) return;
  navigator.clipboard.writeText(toMarkdown(log))
    .then(() => showToast('📋 Copy แล้ว!'))
    .catch(() => showToast('❌ กด Copy ไม่ได้'));
}

// ─── MARKDOWN EXPORT ─────────────────────────────────────────────────────────

function toMarkdown(log) {
  const tasks = (log.morning?.tasks || []).filter(t => t.trim());
  const study = log.study || [];
  return `# Session Log — ${log.date}

## 🌅 Morning
- เวลาตื่น: ${log.morning?.wakeTime || '-'}
- Mood: ${log.morning?.mood ? MOODS[log.morning.mood] : '-'}

## ✅ Tasks
${tasks.length ? tasks.map((t, i) => `- [${(log.morning?.tasksDone?.[i] ? 'x' : ' ')}] ${t}`).join('\n') : '- (ว่าง)'}

## 📖 Study
${study.length ? study.map(s => `- ${s.subject}: ${s.mins < 60 ? s.mins + 'm' : (s.mins/60).toFixed(1) + 'h'}`).join('\n') : '- (ว่าง)'}

## 💧 Health
- น้ำ: ${log.water || 0}/${MAX_WATER} แก้ว
- ออกกำลังกาย: ${log.exercise ? 'Yes ✅' : 'No ❌'}

## 🌙 Night
- เวลานอน: ${log.night?.sleepTime || '-'}
- Energy: ${log.night?.energy ? `${log.night.energy}/5` : '-'}
- Reflection: ${log.night?.reflection || '-'}
`;
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── TOAST ───────────────────────────────────────────────────────────────────

let toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ─── TASK COMPLETION ─────────────────────────────────────────────────────────

function toggleTaskCb(idx) {
  const log = getLog(getToday());
  log.morning.tasksDone[idx] = !log.morning.tasksDone[idx];
  save();
  syncTaskCbUI(log);
  renderHome();
}

function syncTaskCbUI(log) {
  const done = log.morning.tasksDone || [false, false, false];
  [0, 1, 2].forEach(i => {
    const btn = document.getElementById(`tcb-${i}`);
    const inp = document.getElementById(`task-${i + 1}`);
    if (!btn) return;
    btn.textContent = done[i] ? '✅' : '○';
    btn.classList.toggle('checked', done[i]);
    if (inp) inp.style.textDecoration = done[i] ? 'line-through' : 'none';
    if (inp) inp.style.color = done[i] ? 'var(--muted)' : '';
  });
}

// ─── SLEEP ANALYSIS ───────────────────────────────────────────────────────────

function analyzeSleep() {
  const dates = Object.keys(data).sort((a, b) => b.localeCompare(a)).slice(0, 7);
  const entries = dates.map(date => {
    const log    = data[date];
    const sleepT = log.night?.sleepTime;
    const wakeT  = log.morning?.wakeTime;
    let duration = null, sleepHour = null;

    if (sleepT && wakeT) {
      const [sh, sm] = sleepT.split(':').map(Number);
      const [wh, wm] = wakeT.split(':').map(Number);
      const sleepMins = sh * 60 + sm;
      const wakeMins  = wh * 60 + wm;
      duration  = wakeMins >= sleepMins
        ? (wakeMins - sleepMins) / 60
        : (1440 - sleepMins + wakeMins) / 60;
      sleepHour = sh;
    }
    return { date, duration, sleepHour, wakeTime: wakeT, energy: log.night?.energy || 0 };
  });

  const withData = entries.filter(e => e.duration !== null && e.duration > 2 && e.duration < 16);
  if (!withData.length) return null;

  const avgDuration = withData.reduce((s, e) => s + e.duration, 0) / withData.length;

  const wakeMinsArr = entries.filter(e => e.wakeTime).map(e => {
    const [h, m] = e.wakeTime.split(':').map(Number);
    return h * 60 + m;
  });
  const avgWakeMins = wakeMinsArr.length
    ? wakeMinsArr.reduce((s, m) => s + m, 0) / wakeMinsArr.length : null;
  const wakeVariance = wakeMinsArr.length > 1
    ? wakeMinsArr.reduce((s, m) => s + Math.pow(m - avgWakeMins, 2), 0) / wakeMinsArr.length : 0;
  const wakeStdDev = Math.sqrt(wakeVariance);

  // past midnight = sleep hour 0-4
  const lateNights = withData.filter(e => e.sleepHour !== null && e.sleepHour < 5).length;

  return { avgDuration, avgWakeMins, wakeStdDev, lateNights, count: withData.length };
}

function calcSleepScore(analysis) {
  if (!analysis || analysis.count < 2) return null;
  let score = 0;

  // Duration 0-30 pts
  const dur = analysis.avgDuration;
  if (dur >= 7 && dur <= 9)        score += 30;
  else if (dur >= 6 && dur <= 10)  score += 18;
  else                              score += 6;

  // Consistency 0-30 pts
  const std = analysis.wakeStdDev;
  if (std < 15)      score += 30;
  else if (std < 30) score += 22;
  else if (std < 45) score += 14;
  else if (std < 60) score += 6;

  // Late nights 0-20 pts
  const lateRatio = analysis.lateNights / analysis.count;
  if (lateRatio === 0)      score += 20;
  else if (lateRatio < 0.2) score += 13;
  else if (lateRatio < 0.5) score += 6;

  // Avg mood 0-20 pts
  const dates7 = Object.keys(data).sort((a, b) => b.localeCompare(a)).slice(0, 7);
  const moods = dates7.map(d => data[d]?.morning?.mood || 0).filter(m => m > 0);
  if (moods.length) {
    const avg = moods.reduce((s, m) => s + m, 0) / moods.length;
    score += Math.round((avg / 5) * 20);
  } else {
    score += 10;
  }

  return Math.min(100, Math.round(score));
}

function formatMins(mins) {
  if (mins === null || mins === undefined) return '-';
  const h = Math.floor(mins / 60) % 24;
  const m = Math.round(mins % 60);
  return `${pad(h)}:${pad(m)}`;
}

function generatePersonalTips(a) {
  if (!a || a.count < 2) return [];
  const tips = [];

  if (a.avgDuration < 7) {
    tips.push({ level: 'warn', icon: '⏰', title: 'นอนน้อยเกินไป',
      detail: `เฉลี่ย ${a.avgDuration.toFixed(1)} ชม./คืน — เป้าหมายควรเป็น 7-9 ชม.`,
      action: 'ลองนอนเร็วขึ้น 30 นาที ทดลองต่อเนื่อง 1 สัปดาห์' });
  } else if (a.avgDuration > 9) {
    tips.push({ level: 'info', icon: '⏰', title: 'นอนนานเกินไป',
      detail: `เฉลี่ย ${a.avgDuration.toFixed(1)} ชม./คืน`,
      action: 'นอนมากเกินไปอาจทำให้ง่วงกลางวัน ลองลดเป็น 7-8 ชม.' });
  }

  if (a.lateNights >= 3) {
    tips.push({ level: 'warn', icon: '🌙', title: 'นอนดึกบ่อย',
      detail: `${a.lateNights} ใน ${a.count} คืน นอนหลังเที่ยงคืน`,
      action: 'ตั้งเป้าเข้านอนก่อน 23:30 — ร่างกายหลั่ง melatonin สูงสุดช่วง 22-23 น.' });
  }

  if (a.wakeStdDev > 60) {
    tips.push({ level: 'warn', icon: '📅', title: 'เวลาตื่นไม่สม่ำเสมอ',
      detail: `เวลาตื่นต่างกันเฉลี่ย ${Math.round(a.wakeStdDev)} นาที`,
      action: 'ตื่นเวลาเดิมทุกวัน (รวมวันหยุด) — Matthew Walker: "Regularity is king"' });
  } else if (a.wakeStdDev > 30) {
    tips.push({ level: 'info', icon: '📅', title: 'เวลาตื่นยังไม่นิ่งพอ',
      detail: `เวลาตื่นต่างกัน ${Math.round(a.wakeStdDev)} นาที`,
      action: 'พยายามให้เวลาตื่นต่างกันไม่เกิน 30 นาทีในแต่ละวัน' });
  }

  return tips;
}

const SLEEP_TIPS = [
  { icon: '🌅', title: 'รับแสงแดดเช้าภายใน 1 ชั่วโมงแรก',
    detail: 'แสงแดดช่วง 7-9 น. reset circadian clock ให้แม่นยำ ทำให้ง่วงตรงเวลาตอนกลางคืน',
    action: 'เปิดม่านหรือออกไปข้างนอกหลังตื่นทันที แม้แค่ 10 นาที' },
  { icon: '📱', title: 'ลดหน้าจอก่อนนอน 30-60 นาที',
    detail: 'แสงสีฟ้าจากมือถือกด melatonin ได้นานถึง 3 ชม. ทำให้นอนหลับยากขึ้น',
    action: 'ตั้ง Do Not Disturb และวางมือถือไว้นอกห้องนอน หรือเปิด Night Mode' },
  { icon: '🌡️', title: 'ห้องเย็น = นอนหลับดีกว่า',
    detail: 'ร่างกายต้องลดอุณหภูมิ 1-2°C เพื่อเข้าสู่การนอนหลับลึก (Deep Sleep)',
    action: 'ตั้งแอร์ 20-22°C หรือใช้พัดลมช่วยระบาย' },
  { icon: '☕', title: 'คาเฟอีนมีครึ่งชีวิต 6 ชั่วโมง',
    detail: 'กาแฟบ่าย 3 โมง ยังค้างในร่างกาย 50% จนถึงตี 3 ลด deep sleep ได้ 20-40%',
    action: 'หลีกเลี่ยงคาเฟอีนทุกชนิด (กาแฟ ชา น้ำอัดลม) หลัง 14:00 น.' },
  { icon: '🏃', title: 'ออกกำลังกายช่วงเช้า-บ่าย ดีกว่าเย็น',
    detail: 'การออกกำลังกายช่วยให้นอนหลับลึกขึ้น แต่ถ้าทำก่อนนอนจะทำให้ตื่นตัวมากเกิน',
    action: 'หยุดออกกำลังกายหนักอย่างน้อย 3 ชม. ก่อนเข้านอน' },
  { icon: '🛏️', title: 'ถ้านอนไม่หลับเกิน 25 นาที ให้ลุกขึ้น',
    detail: 'นอนดิ้นรนทำให้สมองจำว่า "เตียง = ที่นอนไม่หลับ" — ยิ่งแย่ลงเรื่อยๆ',
    action: 'ลุกไปทำอะไรที่ผ่อนคลายในแสงหรี่ แล้วค่อยกลับมานอนเมื่อง่วง' },
];

// ─── SLEEP DEBT ──────────────────────────────────────────────────────────────

function calcSleepDebt() {
  const TARGET = 8;
  let debt = 0, logged = 0;
  for (const date of getWeekDates()) {
    const log = data[date];
    if (!log?.morning?.wakeTime || !log?.night?.sleepTime) continue;
    const [sh, sm] = log.night.sleepTime.split(':').map(Number);
    const [wh, wm] = log.morning.wakeTime.split(':').map(Number);
    const sleepMins = sh * 60 + sm, wakeMins = wh * 60 + wm;
    const dur = wakeMins >= sleepMins ? (wakeMins - sleepMins) / 60 : (1440 - sleepMins + wakeMins) / 60;
    if (dur > 2 && dur < 16) { debt += TARGET - dur; logged++; }
  }
  return logged > 0 ? { debt, logged } : null;
}

// ─── MOOD/ENERGY CHART ───────────────────────────────────────────────────────

function renderMoodEnergyChart() {
  const d = new Date();
  const dates = [];
  for (let i = 13; i >= 0; i--) {
    const dd = new Date(d);
    dd.setDate(d.getDate() - i);
    dates.push(`${dd.getFullYear()}-${pad(dd.getMonth()+1)}-${pad(dd.getDate())}`);
  }

  const hasAny = dates.some(date => data[date]?.morning?.mood || data[date]?.night?.energy);
  if (!hasAny) return '';

  const BAR = 9, GAP = 2, SLOT = BAR * 2 + GAP + 5, H = 55, today = getToday();
  const svgW = dates.length * SLOT;

  const bars = dates.map((date, i) => {
    const mood   = data[date]?.morning?.mood   || 0;
    const energy = data[date]?.night?.energy   || 0;
    const x  = i * SLOT + 2;
    const mH = mood   ? Math.max(4, (mood   / 5) * (H - 6)) : 0;
    const eH = energy ? Math.max(4, (energy / 5) * (H - 6)) : 0;
    const hi = date === today;
    const dayNum = parseDate(date).getDate();
    return `
      ${mood
        ? `<rect x="${x}" y="${(H-mH).toFixed(1)}" width="${BAR}" height="${mH.toFixed(1)}" rx="2" fill="${hi?'#79c0ff':'#58a6ff'}" opacity="0.85"/>`
        : `<rect x="${x}" y="${H-3}" width="${BAR}" height="3" rx="1" fill="#21262d"/>`}
      ${energy
        ? `<rect x="${x+BAR+GAP}" y="${(H-eH).toFixed(1)}" width="${BAR}" height="${eH.toFixed(1)}" rx="2" fill="${hi?'#56d364':'#3fb950'}" opacity="0.85"/>`
        : `<rect x="${x+BAR+GAP}" y="${H-3}" width="${BAR}" height="3" rx="1" fill="#21262d"/>`}
      ${i % 2 === 0 ? `<text x="${x+BAR}" y="${H+11}" text-anchor="middle" font-size="8" fill="#8b949e" font-family="system-ui">${dayNum}</text>` : ''}`;
  }).join('');

  return `
    <div class="card">
      <div class="card-title" style="margin-bottom:8px">📈 Mood & Energy · 14 วัน</div>
      <div class="chart-legend">
        <span class="legend-dot" style="background:#58a6ff"></span><span>Mood</span>
        &nbsp;&nbsp;
        <span class="legend-dot" style="background:#3fb950"></span><span>Energy</span>
      </div>
      <div style="overflow-x:auto;margin-top:8px">
        <svg viewBox="0 0 ${svgW} ${H+14}" style="width:100%;min-width:${svgW}px;display:block;overflow:visible">
          ${bars}
        </svg>
      </div>
    </div>`;
}

// ─── RENDER INSIGHTS ─────────────────────────────────────────────────────────

function renderInsights() {
  const container   = document.getElementById('insights-content');
  const analysis    = analyzeSleep();
  const personalTips = generatePersonalTips(analysis);
  const score       = calcSleepScore(analysis);
  let html = '';

  // Sleep Score
  if (score !== null) {
    const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D';
    const scoreColor = score >= 85 ? '#3fb950' : score >= 70 ? '#7ee787' : score >= 55 ? '#e3a008' : '#f85149';
    const scoreDesc = score >= 85 ? 'ยอดเยี่ยม' : score >= 70 ? 'ดี' : score >= 55 ? 'พอใช้' : 'ต้องปรับ';
    html += `
      <div class="card sleep-score-card">
        <div class="score-wrap">
          <div class="score-num" style="color:${scoreColor}">${score}</div>
          <div class="score-grade" style="color:${scoreColor}">${grade}</div>
        </div>
        <div class="score-label">Sleep Score · ${scoreDesc}</div>
        <div class="score-bar-wrap"><div class="score-bar" style="width:${score}%;background:${scoreColor}"></div></div>
      </div>`;
  }

  // Sleep debt
  const debt = calcSleepDebt();
  if (debt) {
    const debtColor = debt.debt > 2 ? '#f85149' : debt.debt > 0.5 ? '#e3a008' : '#3fb950';
    const sign = debt.debt > 0 ? '+' : '';
    html += `
      <div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px">
        <div>
          <div class="card-title">💤 Sleep Debt สัปดาห์นี้</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">${debt.logged} คืนที่บันทึก · เป้า 8h/คืน</div>
        </div>
        <div style="font-size:30px;font-weight:700;color:${debtColor}">${sign}${debt.debt.toFixed(1)}h</div>
      </div>`;
  }

  // Stats card
  if (analysis) {
    const durClass = analysis.avgDuration < 7 ? 'stat-warn' : analysis.avgDuration > 9 ? 'stat-info' : 'stat-ok';
    const conClass = analysis.wakeStdDev > 60 ? 'stat-warn' : analysis.wakeStdDev > 30 ? 'stat-info' : 'stat-ok';
    html += `
      <div class="card">
        <div class="card-title">${analysis.count} คืนที่บันทึกไว้ · 7 วันล่าสุด</div>
        <div class="stat-row">
          <div class="stat-box ${durClass}">
            <div class="stat-val">${analysis.avgDuration.toFixed(1)}<span class="stat-unit"> ชม.</span></div>
            <div class="stat-label">นอนเฉลี่ย</div>
          </div>
          <div class="stat-box">
            <div class="stat-val">${formatMins(analysis.avgWakeMins)}</div>
            <div class="stat-label">ตื่นเฉลี่ย</div>
          </div>
          <div class="stat-box ${conClass}">
            <div class="stat-val">${Math.round(analysis.wakeStdDev)}<span class="stat-unit"> นาที</span></div>
            <div class="stat-label">ความแปรปรวน</div>
          </div>
        </div>
      </div>`;
  } else {
    html += `
      <div class="card" style="text-align:center;padding:24px 16px;">
        <div style="font-size:40px;margin-bottom:10px;">💤</div>
        <div style="color:var(--muted);font-size:14px;line-height:1.6;">
          บันทึก Morning + Night Log อย่างน้อย 2 วัน<br>เพื่อดูการวิเคราะห์การนอนของคุณ
        </div>
      </div>`;
  }

  // Mood/Energy chart
  html += renderMoodEnergyChart();

  // Personalized tips
  if (personalTips.length) {
    html += `<div class="insights-section-title">⚠️ สิ่งที่ควรปรับ</div>`;
    personalTips.forEach(t => {
      html += `
        <div class="tip-card tip-${t.level}">
          <div class="tip-header">${t.icon} ${t.title}</div>
          <div class="tip-detail">${t.detail}</div>
          <div class="tip-action">💡 ${t.action}</div>
        </div>`;
    });
  }

  // General tips
  html += `<div class="insights-section-title">📚 หลักการนอนที่ดี</div>`;
  SLEEP_TIPS.forEach(t => {
    html += `
      <div class="tip-card">
        <div class="tip-header">${t.icon} ${t.title}</div>
        <div class="tip-detail">${t.detail}</div>
        <div class="tip-action">💡 ${t.action}</div>
      </div>`;
  });

  container.innerHTML = html;
}

// ─── GOOGLE AUTH + DRIVE SYNC ────────────────────────────────────────────────

let gTokenClient = null;
let gAccessToken = null;
let driveFileId  = null;

const G_AUTH_KEY      = 'ltd-auth-v2';   // v2 = calendar + drive scope
const DRIVE_FILE_NAME = 'ltd-daily-data.json';
const isAuthorized    = () => localStorage.getItem(G_AUTH_KEY) === '1' || localStorage.getItem('ltd-gcal-auth') === '1';

function getTokenClient() {
  if (!gTokenClient) {
    gTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.appdata',
      callback: () => {}
    });
  }
  return gTokenClient;
}

function requestToken(silent = false) {
  return new Promise((resolve, reject) => {
    if (GOOGLE_CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
      reject(new Error('no-client-id')); return;
    }
    if (gAccessToken) { resolve(gAccessToken); return; }
    const client = getTokenClient();
    client.callback = (res) => {
      if (res.error) { reject(new Error(res.error)); return; }
      gAccessToken = res.access_token;
      localStorage.setItem(G_AUTH_KEY, '1');
      resolve(gAccessToken);
    };
    client.requestAccessToken({ prompt: silent ? 'none' : '' });
  });
}

// ── Drive helpers ──

async function driveGetFileId(token) {
  if (driveFileId) return driveFileId;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D'${DRIVE_FILE_NAME}'&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const json = await res.json();
  driveFileId = json.files?.[0]?.id || null;
  return driveFileId;
}

async function driveLoad(token) {
  const fileId = await driveGetFileId(token);
  if (!fileId) return null;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  return await res.json();
}

async function driveSave(token, dataObj) {
  const content  = JSON.stringify(dataObj);
  const fileId   = await driveGetFileId(token);
  if (fileId) {
    await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: content }
    );
  } else {
    const meta = JSON.stringify({ name: DRIVE_FILE_NAME, parents: ['appDataFolder'] });
    const form = new FormData();
    form.append('metadata', new Blob([meta], { type: 'application/json' }));
    form.append('file',     new Blob([content], { type: 'application/json' }));
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
    );
    const json = await res.json();
    driveFileId = json.id || null;
  }
}

async function tryAutoFill(type) {
  if (!isAuthorized() && !gAccessToken) return;
  try {
    await requestToken(true);
    const ev = await fetchLatestSleepEvent();
    if (!ev) return;
    if (type === 'wake') {
      const end = new Date(ev.end.dateTime || ev.end.date);
      const t = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
      document.getElementById('wake-time').value = t;
      showToast(`🌅 ดึงเวลาตื่น ${t} อัตโนมัติ`);
    } else {
      const start = new Date(ev.start.dateTime || ev.start.date);
      const t = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
      document.getElementById('sleep-time').value = t;
      showToast(`🌙 ดึงเวลานอน ${t} อัตโนมัติ`);
    }
  } catch { /* silent fail — button still available */ }
}

async function fetchLatestSleepEvent() {
  const token = await requestToken();
  const now  = new Date();
  const from = new Date(now);
  from.setHours(from.getHours() - 20);

  const params = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: now.toISOString(),
    orderBy: 'startTime',
    singleEvents: 'true',
    maxResults: '30'
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (res.status === 401) { gAccessToken = null; throw new Error('token-expired'); }
  if (!res.ok) throw new Error('api-error');

  const data   = await res.json();
  const events = data.items || [];

  return events.find(e => {
    const title = (e.summary || '').toLowerCase();
    return title.includes('sleep') || title.includes('นอน') || title.includes('หลับ');
  }) || null;
}

async function autoFillWake() {
  showToast('⏳ กำลังดึงข้อมูล...');
  try {
    await requestToken(false); // interactive — แสดง popup ถ้าจำเป็น
    const ev = await fetchLatestSleepEvent();
    if (!ev) { showToast('❌ ไม่พบ Sleep event ใน Calendar'); return; }
    const end = new Date(ev.end.dateTime || ev.end.date);
    const t   = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
    document.getElementById('wake-time').value = t;
    showToast(`🌅 ดึงเวลาตื่น ${t} แล้ว!`);
  } catch (e) {
    if (e.message === 'no-client-id') showToast('⚠️ ยังไม่ได้ตั้ง Google Client ID');
    else showToast('❌ ดึงข้อมูลไม่ได้ ลองใหม่');
  }
}

async function autoFillSleep() {
  showToast('⏳ กำลังดึงข้อมูล...');
  try {
    await requestToken(false); // interactive — แสดง popup ถ้าจำเป็น
    const ev = await fetchLatestSleepEvent();
    if (!ev) { showToast('❌ ไม่พบ Sleep event ใน Calendar'); return; }
    const start = new Date(ev.start.dateTime || ev.start.date);
    const t     = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
    document.getElementById('sleep-time').value = t;
    showToast(`🌙 ดึงเวลานอน ${t} แล้ว!`);
  } catch (e) {
    if (e.message === 'no-client-id') showToast('⚠️ ยังไม่ได้ตั้ง Google Client ID');
    else showToast('❌ ดึงข้อมูลไม่ได้ ลองใหม่');
  }
}

// ─── PORTFOLIO ───────────────────────────────────────────────────────────────

const PORTFOLIO = {
  dca:    [{ symbol: 'QQQM', name: 'Nasdaq 100 ETF', alloc: '70%' },
           { symbol: 'SMH',  name: 'Semiconductor ETF', alloc: '30%' }],
  growth: [{ symbol: 'PLTR', name: 'Palantir', alloc: '50%' },
           { symbol: 'ARM',  name: 'ARM Holdings', alloc: '50%' }]
};

const PORT_CACHE_KEY = 'ltd-port-v1';
const PORT_CACHE_TTL = 30 * 60 * 1000; // 30 min

function loadPortCache() {
  try {
    const c = JSON.parse(localStorage.getItem(PORT_CACHE_KEY) || 'null');
    if (c && Date.now() - c.ts < PORT_CACHE_TTL) return c.data;
  } catch {}
  return null;
}

function savePortCache(data) {
  localStorage.setItem(PORT_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
}

// ── Data fetching ──

async function fetchYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=8mo`;
  let res;
  try {
    res = await fetch(url);
    if (!res.ok) throw new Error();
  } catch {
    res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`);
  }
  const json  = await res.json();
  const chart = json.chart?.result?.[0];
  if (!chart) throw new Error(`no data: ${symbol}`);
  const raw   = chart.indicators.quote[0].close;
  const times = chart.timestamp;
  const valid = raw.map((c, i) => [times[i], c]).filter(([, c]) => c != null);
  return { symbol, closes: valid.map(([, c]) => c), timestamps: valid.map(([t]) => t) };
}

async function fetchFearGreed() {
  try {
    const res  = await fetch('https://api.alternative.me/fng/?limit=1');
    const json = await res.json();
    const d    = json.data[0];
    return { value: parseInt(d.value), label: d.value_classification };
  } catch {
    return { value: 50, label: 'Neutral' };
  }
}

// ── Calculations ──

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
}

function calcMA(closes, period = 120) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((s, p) => s + p, 0) / period;
}

function genSignal(rsi, vsMA, fng) {
  let score = 0;
  const why = [];

  // RSI
  if (rsi !== null) {
    if (rsi < 30)      { score += 3; why.push(`RSI ${rsi.toFixed(0)} (oversold)`); }
    else if (rsi < 45) { score += 2; why.push(`RSI ${rsi.toFixed(0)}`); }
    else if (rsi < 60) { score += 1; }
    else if (rsi > 70) { score -= 1; why.push(`RSI ${rsi.toFixed(0)} (overbought)`); }
  }

  // vs MA120
  if (vsMA !== null) {
    if (vsMA < -10)     { score += 3; why.push(`${vsMA.toFixed(1)}% ต่ำกว่า MA120`); }
    else if (vsMA < -3) { score += 2; why.push(`${vsMA.toFixed(1)}% ต่ำกว่า MA120`); }
    else if (vsMA < 5)  { score += 1; }
    else if (vsMA > 20) { score -= 1; why.push(`+${vsMA.toFixed(1)}% เหนือ MA120`); }
  }

  // Fear & Greed
  if (fng < 25)      { score += 2; why.push('Extreme Fear'); }
  else if (fng < 40) { score += 1; why.push('Fear zone'); }
  else if (fng > 75) { score -= 1; why.push('Extreme Greed'); }

  if (score >= 5) return { signal: 'BUY', strength: 'strong', why };
  if (score >= 3) return { signal: 'BUY', strength: 'mild',   why };
  if (score >= 1) return { signal: 'HOLD', strength: 'hold',  why };
  return           { signal: 'SKIP', strength: 'skip',         why };
}

// ── Sparkline SVG ──

function sparkline(prices, w = 110, h = 40) {
  if (!prices || prices.length < 2) return '';
  const min = Math.min(...prices), max = Math.max(...prices);
  const range = max - min || 1;
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * w;
    const y = h - 2 - ((p - min) / range) * (h - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const isUp  = prices[prices.length - 1] >= prices[0];
  const color = isUp ? '#3fb950' : '#f85149';
  const uid   = Math.random().toString(36).slice(2, 7);
  const lastPt = pts.split(' ').pop();
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;overflow:visible">
    <defs>
      <linearGradient id="sg${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${pts} ${w},${h} 0,${h}" fill="url(#sg${uid})"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lastPt.split(',')[0]}" cy="${lastPt.split(',')[1]}" r="2.5" fill="${color}"/>
  </svg>`;
}

// ── F&G Gauge SVG ──

function fngGauge(value) {
  const cx = 110, cy = 95, r = 75;
  const angleRad = Math.PI - (value / 100) * Math.PI;
  const nx = cx + r * Math.cos(angleRad);
  const ny = cy - r * Math.sin(angleRad);
  const color = value < 25 ? '#f85149' : value < 45 ? '#e3a008' : value < 55 ? '#caa505' : value < 75 ? '#7ee787' : '#3fb950';

  return `<svg viewBox="0 0 220 105" style="width:100%;max-width:240px;display:block">
    <defs>
      <linearGradient id="fg-grad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"   stop-color="#f85149"/>
        <stop offset="25%"  stop-color="#e3a008"/>
        <stop offset="50%"  stop-color="#caa505"/>
        <stop offset="75%"  stop-color="#7ee787"/>
        <stop offset="100%" stop-color="#3fb950"/>
      </linearGradient>
    </defs>
    <path d="M${cx-r},${cy} A${r},${r} 0 0,1 ${cx+r},${cy}" fill="none" stroke="#21262d" stroke-width="14"/>
    <path d="M${cx-r},${cy} A${r},${r} 0 0,1 ${cx+r},${cy}" fill="none" stroke="url(#fg-grad)" stroke-width="10" opacity="0.3"/>
    ${value > 1 ? `<path d="M${cx-r},${cy} A${r},${r} 0 0,1 ${nx.toFixed(1)},${ny.toFixed(1)}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"/>` : ''}
    <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="5" fill="${color}"/>
    <text x="${cx}" y="${cy - 14}" text-anchor="middle" font-size="30" font-weight="700" fill="${color}" font-family="system-ui,sans-serif">${value}</text>
  </svg>`;
}

// ── Render functions ──

function editCostBasis(symbol) {
  const cb = loadCostBasis();
  const current = cb[symbol] ? cb[symbol].toFixed(2) : '';
  const val = prompt(`ราคาทุน ${symbol} (USD):`, current);
  if (val === null) return;
  const num = parseFloat(val);
  if (!isNaN(num) && num > 0) {
    cb[symbol] = num;
    saveCostBasis(cb);
    renderPortfolio(true);
  }
}

function renderStockCard({ symbol, name, alloc }, stock) {
  const { price, change, rsi, vsMA, spark, signal } = stock;
  const changeColor = change >= 0 ? '#3fb950' : '#f85149';
  const changeSign  = change >= 0 ? '+' : '';
  const rsiColor    = rsi < 30 ? '#f85149' : rsi < 45 ? '#e3a008' : rsi > 70 ? '#f85149' : 'var(--text)';
  const vsMaColor   = vsMA < -3 ? '#3fb950' : vsMA > 15 ? '#f85149' : 'var(--muted)';

  const BADGE = {
    BUY:  { color: '#3fb950', bg: 'rgba(63,185,80,0.13)',  text: '🟢 BUY'  },
    HOLD: { color: '#d29922', bg: 'rgba(210,153,34,0.13)', text: '🟡 HOLD' },
    SKIP: { color: '#f85149', bg: 'rgba(248,81,73,0.13)',  text: '🔴 SKIP' },
  }[signal.signal];

  const isGrowth = PORTFOLIO.growth.some(s => s.symbol === symbol);
  let pnlRow = '';
  if (isGrowth) {
    const cb = loadCostBasis();
    if (cb[symbol]) {
      const pnl = ((price - cb[symbol]) / cb[symbol]) * 100;
      const pnlColor = pnl >= 0 ? '#3fb950' : '#f85149';
      pnlRow = `
        <div class="pnl-row">
          <span class="pnl-label">จากทุน $${cb[symbol].toFixed(2)}</span>
          <span class="pnl-val" style="color:${pnlColor}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%</span>
          <button class="btn-edit-cost" onclick="editCostBasis('${symbol}')">✏️</button>
        </div>`;
    } else {
      pnlRow = `<button class="btn-set-cost" onclick="editCostBasis('${symbol}')">+ ใส่ราคาทุน</button>`;
    }
  }

  return `
    <div class="stock-card">
      <div class="stock-header">
        <div>
          <div class="stock-symbol">${symbol}</div>
          <div class="stock-name">${alloc}</div>
        </div>
        <div class="signal-badge" style="color:${BADGE.color};background:${BADGE.bg}">${BADGE.text}</div>
      </div>
      <div class="stock-price">$${price.toFixed(2)}</div>
      <div class="stock-change" style="color:${changeColor}">${changeSign}${change.toFixed(2)}%</div>
      ${pnlRow}
      <div class="sparkline-wrap">${sparkline(spark)}</div>
      <div class="stock-indicators">
        <div class="ind-row">
          <span class="ind-label">RSI 14</span>
          <span class="ind-val" style="color:${rsiColor}">${rsi !== null ? rsi.toFixed(0) : '-'}</span>
        </div>
        <div class="ind-row">
          <span class="ind-label">vs MA120</span>
          <span class="ind-val" style="color:${vsMaColor}">${vsMA !== null ? `${vsMA >= 0 ? '+' : ''}${vsMA.toFixed(1)}%` : '-'}</span>
        </div>
      </div>
    </div>`;
}

function loadDcaDate() {
  try { return JSON.parse(localStorage.getItem(DCA_KEY) || 'null'); }
  catch { return null; }
}
function saveDcaDate(date) { localStorage.setItem(DCA_KEY, JSON.stringify(date)); }

function recordDca() {
  saveDcaDate(getToday());
  showToast('📌 บันทึก DCA วันนี้แล้ว!');
  renderPortfolio(false);
}

function renderDCASummary(stocks, fng) {
  const dcaStocks  = PORTFOLIO.dca.map(s => stocks[s.symbol]);
  const buyCount   = dcaStocks.filter(s => s.signal.signal === 'BUY').length;
  const allBuy     = buyCount === 2;
  const oneBuy     = buyCount === 1;

  const recText  = allBuy ? 'แนะนำ DCA สัปดาห์นี้' : oneBuy ? 'DCA ได้ (สัญญาณอ่อน)' : 'รอก่อน — ไม่มีสัญญาณ';
  const recColor = allBuy ? '#3fb950' : oneBuy ? '#d29922' : '#f85149';
  const recIcon  = allBuy ? '✅' : oneBuy ? '⚠️' : '⏸️';

  const allWhys = [...new Set(dcaStocks.flatMap(s => s.signal.why))].slice(0, 3);

  // DCA countdown
  const lastDca = loadDcaDate();
  let countdownHtml = '';
  if (lastDca) {
    const next = new Date(parseDate(lastDca));
    next.setDate(next.getDate() + 14);
    const daysLeft = Math.ceil((next - new Date()) / 86400000);
    if (daysLeft <= 0) {
      countdownHtml = `<div class="dca-countdown due">💰 ถึงเวลา DCA แล้ว! <button class="btn-record-dca" onclick="recordDca()">บันทึก DCA วันนี้</button></div>`;
    } else {
      countdownHtml = `<div class="dca-countdown">⏳ อีก ${daysLeft} วัน <button class="btn-record-dca" onclick="recordDca()">DCA วันนี้</button></div>`;
    }
  } else {
    countdownHtml = `<div class="dca-countdown"><button class="btn-record-dca" onclick="recordDca()">📌 ตั้งวัน DCA ครั้งแรก</button></div>`;
  }

  return `
    <div class="card dca-card">
      <div class="card-title">💰 DCA Signal สัปดาห์นี้</div>
      <div class="dca-rec" style="color:${recColor}">${recIcon} ${recText}</div>
      ${allWhys.length ? `<div class="dca-reasons">${allWhys.join(' · ')}</div>` : ''}
      ${countdownHtml}
    </div>`;
}

function renderGrowthSummary(stocks) {
  const growthStocks = PORTFOLIO.growth.map(s => ({ ...stocks[s.symbol], symbol: s.symbol, name: s.name }));
  const alerts = [];

  growthStocks.forEach(s => {
    const reasons = [];
    if (s.rsi !== null && s.rsi > 75)   reasons.push(`RSI ${s.rsi.toFixed(0)}`);
    if (s.vsMA !== null && s.vsMA > 30)  reasons.push(`+${s.vsMA.toFixed(1)}% เหนือ MA120`);
    if (reasons.length) alerts.push({ symbol: s.symbol, reasons });
  });

  const hasAlert  = alerts.length > 0;
  const recText   = hasAlert ? 'พิจารณาขาย' : 'ถือต่อ';
  const recColor  = hasAlert ? '#e3a008' : '#3fb950';
  const recIcon   = hasAlert ? '⚠️' : '✅';
  const subText   = hasAlert
    ? alerts.map(a => `${a.symbol}: ${a.reasons.join(', ')}`).join(' · ')
    : 'ยังไม่มีสัญญาณขาย — รอกำไรวิ่งต่อ';

  return `
    <div class="card dca-card">
      <div class="card-title">🚀 Growth Signal</div>
      <div class="dca-rec" style="color:${recColor}">${recIcon} ${recText}</div>
      <div class="dca-reasons">${subText}</div>
    </div>`;
}

function renderPortfolioUI(portData) {
  const { stocks, fng, updatedAt } = portData;
  const fngColor = fng.value < 25 ? '#f85149' : fng.value < 45 ? '#e3a008' : fng.value < 55 ? '#caa505' : fng.value < 75 ? '#7ee787' : '#3fb950';

  let html = '';

  // Fear & Greed
  html += `
    <div class="card fng-card">
      <div class="card-title">😱 Fear & Greed Index <span style="color:var(--muted);font-weight:400;font-size:10px">(crypto sentiment)</span></div>
      <div class="fng-gauge">${fngGauge(fng.value)}</div>
      <div class="fng-label" style="color:${fngColor}">${fng.label}</div>
    </div>`;

  // DCA Summary
  html += renderDCASummary(stocks, fng);

  // Growth Summary
  html += renderGrowthSummary(stocks);

  // DCA Portfolio
  html += `<div class="port-section-title">💼 DCA Portfolio</div>`;
  html += `<div class="stock-grid">`;
  PORTFOLIO.dca.forEach(s => { html += renderStockCard(s, stocks[s.symbol]); });
  html += `</div>`;

  // Growth Portfolio
  html += `<div class="port-section-title">🚀 Growth Portfolio</div>`;
  html += `<div class="stock-grid">`;
  PORTFOLIO.growth.forEach(s => { html += renderStockCard(s, stocks[s.symbol]); });
  html += `</div>`;

  // Footer
  html += `
    <div class="port-footer">
      <span class="port-updated">อัปเดต ${updatedAt}</span>
      <button class="btn-refresh" onclick="renderPortfolio(true)">🔄 Refresh</button>
    </div>`;

  document.getElementById('portfolio-content').innerHTML = html;
}

async function renderPortfolio(forceRefresh = false) {
  const container = document.getElementById('portfolio-content');
  if (!forceRefresh) {
    const cached = loadPortCache();
    if (cached) { renderPortfolioUI(cached); return; }
  }

  container.innerHTML = `<div class="empty"><div class="empty-icon">⏳</div><div class="empty-text">กำลังโหลดข้อมูล...</div></div>`;

  try {
    const allSymbols = [...PORTFOLIO.dca, ...PORTFOLIO.growth].map(s => s.symbol);
    const [stocksArr, fng] = await Promise.all([
      Promise.all(allSymbols.map(fetchYahoo)),
      fetchFearGreed()
    ]);

    const stocks = {};
    for (const raw of stocksArr) {
      const { closes } = raw;
      const price  = closes[closes.length - 1];
      const prev   = closes[closes.length - 2];
      const change = ((price - prev) / prev) * 100;
      const rsi    = calcRSI(closes);
      const ma120  = calcMA(closes, 120);
      const vsMA   = ma120 ? ((price - ma120) / ma120) * 100 : null;
      const spark  = closes.slice(-21);
      const signal = genSignal(rsi, vsMA, fng.value);
      stocks[raw.symbol] = { price, change, rsi, ma120, vsMA, spark, signal };
    }

    const portData = {
      stocks, fng,
      updatedAt: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    };
    savePortCache(portData);
    renderPortfolioUI(portData);
  } catch (err) {
    container.innerHTML = `
      <div class="port-error">
        <div style="font-size:36px;margin-bottom:10px">📡</div>
        <div>โหลดข้อมูลไม่ได้<br><span style="font-size:12px">เช็กอินเทอร์เน็ต แล้วลองใหม่</span></div>
        <button class="btn-refresh" style="margin-top:16px" onclick="renderPortfolio(true)">🔄 ลองใหม่</button>
      </div>`;
  }
}

// ─── VOCAB ───────────────────────────────────────────────────────────────────

let vocabSession = [];
let vocabIdx     = 0;

function loadVocabState() {
  try { return JSON.parse(localStorage.getItem(VOCAB_KEY) || '{}'); }
  catch { return {}; }
}
function saveVocabState(s) { localStorage.setItem(VOCAB_KEY, JSON.stringify(s)); }

function calcVocabStreak() {
  const vs = loadVocabState();
  const sessions = new Set(vs._sessions || []);
  const d = new Date();
  let count = 0;
  for (let i = 0; i < 60; i++) {
    const date = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    if (!sessions.has(date)) break;
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

function _vocabDue(state) {
  const now = Date.now();
  return VOCAB_WORDS.filter(w => {
    const ws = state[w.id];
    return ws && ws.level < 6 && ws.nextReview <= now;
  });
}
function _vocabNew(state, n) {
  const seen = new Set(Object.keys(state).map(Number));
  return VOCAB_WORDS.filter(w => !seen.has(w.id)).slice(0, n);
}
function _buildSession(state) {
  const due = _vocabDue(state).slice(0, 5);
  const newW = _vocabNew(state, Math.max(0, 8 - due.length));
  return [...due, ...newW].sort(() => Math.random() - 0.5);
}
function _wrongChoices(word) {
  return VOCAB_WORDS.filter(w => w.id !== word.id)
    .sort(() => Math.random() - 0.5).slice(0, 3);
}

function renderVocab() {
  if (VOCAB_WORDS.length === 0) {
    document.getElementById('vocab-overview').style.display = 'block';
    document.getElementById('vocab-quiz').style.display    = 'none';
    document.getElementById('vocab-content').innerHTML = `
      <div class="card" style="text-align:center;padding:32px 16px">
        <div style="font-size:40px;margin-bottom:10px">⏳</div>
        <div style="color:var(--muted);font-size:14px">กำลังโหลดคำศัพท์...<br>รอสักครู่แล้วลองอีกครั้ง</div>
      </div>`;
    setTimeout(renderVocab, 1200);
    return;
  }
  const state = loadVocabState();
  const mastered = Object.values(state).filter(s => s.level >= 5).length;
  const learned  = Object.keys(state).filter(k => !k.startsWith('_')).length;
  const due      = _vocabDue(state).length;
  const session  = _buildSession(state);
  const progress = Math.round((learned / VOCAB_WORDS.length) * 100);

  document.getElementById('vocab-overview').style.display = 'block';
  document.getElementById('vocab-quiz').style.display    = 'none';

  document.getElementById('vocab-content').innerHTML = `
    <div class="card vocab-progress-card">
      <div class="vocab-prog-row">
        <span>คำที่เรียนแล้ว</span>
        <span class="vocab-prog-val">${learned} / ${VOCAB_WORDS.length}</span>
      </div>
      <div class="vocab-prog-bar-wrap"><div class="vocab-prog-bar" style="width:${progress}%"></div></div>
      <div class="vocab-prog-sub">✅ จำได้ ${mastered} คำ · ⏰ ต้องทบทวน ${due} คำ</div>
    </div>
    ${session.length ? `
    <div class="card vocab-session-card">
      <div>
        <div class="vocab-session-title">Session วันนี้</div>
        <div class="vocab-session-sub">${session.length} คำ</div>
      </div>
      <button class="btn-start-vocab" onclick="startVocabSession()">เริ่มเรียน ▶</button>
    </div>` : `
    <div class="card" style="text-align:center;padding:24px">
      <div style="font-size:36px;margin-bottom:8px">🎉</div>
      <div style="color:var(--muted);font-size:14px">ไม่มีคำที่ต้องทบทวนวันนี้<br>กลับมาพรุ่งนี้!</div>
    </div>`}
    <div class="insights-section-title">💡 Tips</div>
    <div class="tip-card">
      <div class="tip-header">🎯 เรียน 5-10 คำ/วัน ดีกว่า 100 คำ/ครั้ง</div>
      <div class="tip-detail">สมองจำได้ดีกว่าถ้าเรียนน้อยแต่สม่ำเสมอ ทำทุกวันสำคัญกว่าทำเยอะครั้งเดียว</div>
    </div>
    <div class="tip-card">
      <div class="tip-header">🔁 การทบทวนคือหัวใจ</div>
      <div class="tip-detail">เห็นคำซ้ำหลายครั้งในช่วงเวลาที่ห่างกันขึ้น สมองจะจำได้นานขึ้นเรื่อยๆ</div>
    </div>`;
}

function startVocabSession() {
  const state = loadVocabState();
  vocabSession = _buildSession(state);
  vocabIdx = 0;
  // track session date for streak
  state._sessions = state._sessions || [];
  const today = getToday();
  if (!state._sessions.includes(today)) state._sessions.push(today);
  saveVocabState(state);
  document.getElementById('vocab-overview').style.display = 'none';
  document.getElementById('vocab-quiz').style.display    = 'block';
  showVocabQ();
}

function showVocabQ() {
  if (vocabIdx >= vocabSession.length) { endVocabSession(); return; }
  const word    = vocabSession[vocabIdx];
  const choices = [word, ..._wrongChoices(word)].sort(() => Math.random() - 0.5);

  document.getElementById('quiz-content').innerHTML = `
    <div class="quiz-header">
      <button class="btn-quiz-back" onclick="renderVocab()">✕</button>
      <div class="quiz-prog">${vocabIdx + 1} / ${vocabSession.length}</div>
    </div>
    <div class="quiz-card">
      <div class="quiz-word">${word.en} <button class="btn-speak" onclick="speakWord('${word.en}')">🔊</button></div>
      <div class="quiz-example">"${word.ex}"</div>
    </div>
    <div class="quiz-hint">แปลว่าอะไร?</div>
    <div class="quiz-choices">
      ${choices.map(c => `
        <button class="quiz-choice"
          data-correct="${c.id === word.id}"
          onclick="answerVocab(this,${word.id},${c.id === word.id})">
          ${c.th}
        </button>`).join('')}
    </div>`;
  speakWord(word.en);
}

function answerVocab(btn, wordId, isCorrect) {
  document.querySelectorAll('.quiz-choice').forEach(b => b.disabled = true);
  btn.classList.add(isCorrect ? 'correct' : 'wrong');
  if (!isCorrect) {
    document.querySelectorAll('.quiz-choice[data-correct="true"]').forEach(b => b.classList.add('correct'));
  }

  // Update SRS
  const state = loadVocabState();
  const ws = state[wordId] || { level: 0, nextReview: Date.now() };
  ws.level = isCorrect ? Math.min(5, ws.level + 1) : Math.max(0, ws.level - 1);
  ws.nextReview = Date.now() + (SRS_INTERVALS[ws.level] || 1) * 86400000;
  state[wordId] = ws;
  saveVocabState(state);

  if (isCorrect) {
    setTimeout(() => { vocabIdx++; showVocabQ(); }, 700);
  } else {
    // Show tip + action buttons
    const word = VOCAB_WORDS.find(w => w.id === wordId);
    const tipHtml = word?.tip
      ? `<div class="quiz-tip">💡 <strong>เทคนิคจำ:</strong> ${word.tip}</div>`
      : '';
    setTimeout(() => {
      const footer = document.createElement('div');
      footer.className = 'quiz-wrong-footer';
      footer.innerHTML = `
        ${tipHtml}
        <div class="quiz-action-row">
          <button class="btn-hard" onclick="markHard(${wordId})">🔴 ยากมาก ทบทวนใหม่</button>
          <button class="btn-next-q" onclick="nextVocabQ()">ต่อไป →</button>
        </div>`;
      document.getElementById('quiz-content').appendChild(footer);
    }, 500);
  }
}

function markHard(wordId) {
  const state = loadVocabState();
  const ws = state[wordId] || { level: 0, nextReview: Date.now() };
  ws.level = 0;
  ws.nextReview = Date.now(); // due immediately next session
  state[wordId] = ws;
  saveVocabState(state);
  nextVocabQ();
}

function nextVocabQ() {
  vocabIdx++;
  showVocabQ();
}

function endVocabSession() {
  document.getElementById('quiz-content').innerHTML = `
    <div class="quiz-result">
      <div style="font-size:64px">🎉</div>
      <div class="result-title">จบแล้ว!</div>
      <div class="result-sub">${vocabSession.length} คำ · เก่งมาก!</div>
      <button class="btn-save" onclick="renderVocab()" style="margin-top:24px;width:100%">กลับหน้าหลัก</button>
    </div>`;
}

// ─── EXPORT ──────────────────────────────────────────────────────────────────

function exportTodayLog() {
  const today = getToday();
  const log = data[today];
  if (!log) { showToast('ยังไม่มีข้อมูลวันนี้'); return; }

  const { day } = formatDate(today);
  const m = log.morning || {};
  const n = log.night   || {};

  const taskLines = (m.tasks || []).map((t, i) => {
    if (!t.trim()) return null;
    const done = (m.tasksDone || [])[i];
    return `- [${done ? 'x' : ' '}] ${t}`;
  }).filter(Boolean);

  const studyLines = (log.study || []).map(s =>
    `- ${s.subject}: ${s.mins < 60 ? s.mins + 'm' : (s.mins/60).toFixed(1) + 'h'}`
  );

  const md = [
    `# ${today} (${day})`,
    ``,
    `## Morning`,
    `- ตื่น: ${m.wakeTime || '-'}`,
    `- Mood: ${m.mood ? MOODS[m.mood] : '-'}`,
    ``,
    `### Tasks`,
    taskLines.length ? taskLines.join('\n') : `- (ไม่มี task)`,
    ``,
    `## 📖 Study`,
    studyLines.length ? studyLines.join('\n') : `- (ว่าง)`,
    ``,
    `## Health`,
    `- 💧 น้ำ: ${log.water || 0}/${MAX_WATER} แก้ว`,
    `- 🏃 ออกกำลังกาย: ${log.exercise ? '✅' : '❌'}`,
    ``,
    `## Night`,
    `- นอน: ${n.sleepTime || '-'}`,
    `- Energy: ${n.energy ? `${n.energy}/5` : '-'}`,
    `- Reflection: ${n.reflection || '-'}`,
  ].join('\n');

  if (navigator.share) {
    navigator.share({ title: `LTD Log ${today}`, text: md }).catch(() => _downloadLog(today, md));
  } else {
    _downloadLog(today, md);
  }
}

function _downloadLog(date, content) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${date}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── WEEKLY GOALS ────────────────────────────────────────────────────────────

function renderWeeklyGoals() {
  const el = document.getElementById('weekly-goals');
  if (!el) return;
  const weekDates = getWeekDates();
  const vs = loadVocabState();
  const vocabSessions = new Set(vs._sessions || []);

  const logCount   = weekDates.filter(d => data[d] && (data[d].morning?.mood > 0 || data[d].night?.energy > 0)).length;
  const waterCount = weekDates.filter(d => (data[d]?.water || 0) >= 6).length;
  const exerCount  = weekDates.filter(d => !!data[d]?.exercise).length;
  const vocabCount = weekDates.filter(d => vocabSessions.has(d)).length;

  const goals = [
    { icon: '📝', label: 'Log',      val: logCount,   target: 7 },
    { icon: '💧', label: 'น้ำ',      val: waterCount, target: 5 },
    { icon: '🏃', label: 'ออกกำลัง', val: exerCount,  target: 4 },
    { icon: '📚', label: 'EN',       val: vocabCount, target: 5 },
  ];

  const rows = goals.map(g => {
    const pct   = Math.min(100, Math.round((g.val / g.target) * 100));
    const color = pct >= 100 ? '#3fb950' : pct >= 60 ? '#d29922' : '#8b949e';
    return `
      <div class="goal-row">
        <span class="goal-icon">${g.icon}</span>
        <div class="goal-bar-wrap"><div class="goal-bar" style="width:${pct}%;background:${color}"></div></div>
        <span class="goal-val" style="color:${color}">${g.val}<span class="goal-target">/${g.target}</span></span>
      </div>`;
  }).join('');

  el.innerHTML = `<div class="card weekly-goals-card"><div class="card-title" style="margin-bottom:10px">🗓 สัปดาห์นี้</div>${rows}</div>`;
}

// ─── STUDY ───────────────────────────────────────────────────────────────────

function selectSubject(s) {
  currentSubject = s;
  document.querySelectorAll('.subject-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.s === s));
}

function setStudyDuration(mins) {
  document.getElementById('study-mins').value = mins;
  document.querySelectorAll('.dur-preset').forEach(btn =>
    btn.classList.toggle('active', btn.textContent.trim() === String(mins)));
}

function openStudyOverlay() {
  currentSubject = 'Control';
  document.querySelectorAll('.subject-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.s === 'Control'));
  document.querySelectorAll('.dur-preset').forEach(btn => btn.classList.remove('active'));
  document.getElementById('study-mins').value = '';
  renderStudySessions();
  renderStudyWeekly();
  document.getElementById('overlay-study').classList.add('open');
}

function addStudySession() {
  const mins = parseInt(document.getElementById('study-mins').value);
  if (!mins || mins < 1) { showToast('ใส่เวลาก่อนนะ'); return; }
  const log = getLog(getToday());
  if (!log.study) log.study = [];
  log.study.push({ subject: currentSubject, mins });
  save();
  renderHome();
  document.getElementById('study-mins').value = '';
  document.querySelectorAll('.dur-preset').forEach(btn => btn.classList.remove('active'));
  renderStudySessions();
  renderStudyWeekly();
  const h = Math.floor(mins / 60), m = mins % 60;
  showToast(`📖 ${currentSubject} ${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm' : ''} บันทึกแล้ว`);
}

function removeStudySession(idx) {
  const log = getLog(getToday());
  if (!log.study) return;
  log.study.splice(idx, 1);
  save();
  renderHome();
  renderStudySessions();
  renderStudyWeekly();
}

function renderStudySessions() {
  const el = document.getElementById('study-sessions-list');
  if (!el) return;
  const sessions = data[getToday()]?.study || [];
  if (!sessions.length) { el.innerHTML = ''; return; }

  const rows = sessions.map((s, i) => {
    const h = Math.floor(s.mins / 60), m = s.mins % 60;
    const timeStr = `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm' : ''}`.trim();
    return `
      <div class="study-session-row">
        <div class="study-session-info">
          <div class="study-session-name">${s.subject}</div>
          <div class="study-session-sub">${timeStr}</div>
        </div>
        <button class="btn-del-session" onclick="removeStudySession(${i})">🗑</button>
      </div>`;
  }).join('');

  el.innerHTML = `<div class="study-session-list"><div class="study-section-label">วันนี้</div>${rows}</div>`;
}

function renderStudyWeekly() {
  const el = document.getElementById('study-weekly');
  if (!el) return;
  const weekDates = getWeekDates();
  const totals = {};
  weekDates.forEach(date => {
    (data[date]?.study || []).forEach(s => {
      totals[s.subject] = (totals[s.subject] || 0) + s.mins;
    });
  });
  if (!Object.keys(totals).length) { el.innerHTML = ''; return; }

  const rows = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([subj, mins]) => {
      const h = Math.floor(mins / 60), m = mins % 60;
      const timeStr = `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm' : ''}`.trim();
      return `<div class="study-week-row"><span class="study-week-subj">${subj}</span><span class="study-week-hrs">${timeStr}</span></div>`;
    }).join('');

  el.innerHTML = `<div class="card study-week-card"><div class="study-section-label">สัปดาห์นี้</div>${rows}</div>`;
}

// ─── POMODORO ────────────────────────────────────────────────────────────────

let pomoState = { running: false, remaining: 25*60, duration: 25*60, mode: 'work', interval: null };

function openPomodoro() {
  const count = data[getToday()]?.pomodoros || 0;
  const countEl = document.getElementById('pomo-count');
  if (countEl) countEl.textContent = `วันนี้: ${count} session`;
  updatePomoDisplay();
  // sync preset button state
  const dur = String(pomoState.duration / 60);
  ['25','50','5'].forEach(m => {
    const el = document.getElementById(`preset-${m}`);
    if (el) el.classList.toggle('active', dur === m);
  });
  const startBtn = document.getElementById('pomo-btn-start');
  if (startBtn) startBtn.textContent = pomoState.running ? '⏸ หยุด' : (pomoState.remaining < pomoState.duration ? '▶ ต่อ' : '▶ เริ่ม');
  document.getElementById('overlay-pomodoro').classList.add('open');
}

function pomodoroStartPause() {
  if (pomoState.running) {
    clearInterval(pomoState.interval);
    pomoState.running = false;
    document.getElementById('pomo-btn-start').textContent = '▶ ต่อ';
  } else {
    pomoState.running = true;
    document.getElementById('pomo-btn-start').textContent = '⏸ หยุด';
    pomoState.interval = setInterval(tickPomodoro, 1000);
  }
}

function tickPomodoro() {
  pomoState.remaining--;
  updatePomoDisplay();
  if (pomoState.remaining <= 0) {
    clearInterval(pomoState.interval);
    pomoState.running = false;
    pomodoroComplete();
  }
}

function pomodoroComplete() {
  if ('Notification' in window && Notification.permission === 'granted') {
    const isBreak = pomoState.mode === 'break';
    new Notification(isBreak ? '☕ Break หมดแล้ว!' : '🎯 Pomodoro จบแล้ว!', {
      body: isBreak ? 'พักครบแล้ว กลับมาทำต่อ!' : 'เยี่ยม! พักสักครู่ก่อนนะ',
      icon: './icon.svg'
    });
  }

  if (pomoState.mode !== 'break') {
    const log = getLog(getToday());
    log.pomodoros = (log.pomodoros || 0) + 1;
    save();
    const countEl = document.getElementById('pomo-count');
    if (countEl) countEl.textContent = `วันนี้: ${log.pomodoros} session`;
    showToast(`🎯 Pomodoro ที่ ${log.pomodoros} จบแล้ว! พักสักครู่`);
  } else {
    showToast('☕ Break หมดแล้ว กลับมาทำต่อ!');
  }

  pomoState.remaining = pomoState.duration;
  updatePomoDisplay();
  const btn = document.getElementById('pomo-btn-start');
  if (btn) btn.textContent = '▶ เริ่ม';
}

function resetPomodoro() {
  clearInterval(pomoState.interval);
  pomoState.running   = false;
  pomoState.remaining = pomoState.duration;
  updatePomoDisplay();
  const btn = document.getElementById('pomo-btn-start');
  if (btn) btn.textContent = '▶ เริ่ม';
}

function setPomoMode(mins, mode) {
  resetPomodoro();
  pomoState.duration  = mins * 60;
  pomoState.remaining = mins * 60;
  pomoState.mode      = mode;
  updatePomoDisplay();
  ['25','50','5'].forEach(m => {
    const el = document.getElementById(`preset-${m}`);
    if (el) el.classList.toggle('active', String(mins) === m);
  });
}

function updatePomoDisplay() {
  const m = Math.floor(pomoState.remaining / 60);
  const s = pomoState.remaining % 60;
  const timeEl = document.getElementById('pomo-time');
  const modeEl = document.getElementById('pomo-mode');
  if (timeEl) timeEl.textContent = `${pad(m)}:${pad(s)}`;
  if (modeEl) {
    const labels = { work: '🎯 Work · 25 min', deep: '🔥 Deep Work · 50 min', break: '☕ Break · 5 min' };
    modeEl.textContent = labels[pomoState.mode] || '';
  }
}

// ─── SPEECH ──────────────────────────────────────────────────────────────────

function speakWord(text) {
  if (!('speechSynthesis' in window)) return;
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'en-US';
  utt.rate = 0.85;
  speechSynthesis.cancel();
  speechSynthesis.speak(utt);
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

function loadNotifSettings() {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}'); }
  catch { return {}; }
}
function saveNotifSettings(s) { localStorage.setItem(NOTIF_KEY, JSON.stringify(s)); }

function openSettingsOverlay() {
  const ns = loadNotifSettings();
  const defaults = { morning: '08:00', vocab: '12:00', night: '22:00' };
  ['morning', 'vocab', 'night'].forEach(key => {
    const s = ns[key] || { on: false, time: defaults[key] };
    const toggle    = document.getElementById(`notif-${key}-toggle`);
    const timeInput = document.getElementById(`notif-${key}-time`);
    if (toggle)    toggle.className = 'toggle' + (s.on ? ' on' : '');
    if (timeInput) timeInput.value  = s.time || defaults[key];
  });
  document.getElementById('overlay-settings').classList.add('open');
}

function toggleNotif(key) {
  document.getElementById(`notif-${key}-toggle`).classList.toggle('on');
}

async function saveSettings() {
  const ns = {};
  for (const key of ['morning', 'vocab', 'night']) {
    const on   = document.getElementById(`notif-${key}-toggle`).classList.contains('on');
    const time = document.getElementById(`notif-${key}-time`).value;
    ns[key] = { on, time };
  }

  if (Object.values(ns).some(s => s.on)) {
    if (!('Notification' in window)) {
      showToast('❌ เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน');
      saveNotifSettings(ns);
      closeOverlay();
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      showToast('❌ ต้องอนุญาต Notification ก่อน');
      saveNotifSettings(ns);
      closeOverlay();
      return;
    }
  }

  saveNotifSettings(ns);
  scheduleNotifications(ns);
  closeOverlay();
  showToast('⚙️ บันทึก Settings แล้ว');
}

function scheduleNotifications(ns) {
  if (window._notifTimers) window._notifTimers.forEach(clearTimeout);
  window._notifTimers = [];

  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const LABELS = { morning: '🌅 Morning Log', vocab: '📚 Vocab วันนี้', night: '🌙 Night Log' };
  const BODIES  = {
    morning: 'บันทึก mood และ tasks ของวันนี้',
    vocab:   'ฝึกคำศัพท์วันนี้แล้วยัง?',
    night:   'บันทึก reflection และ energy ก่อนนอน'
  };

  const now = new Date();
  for (const [key, s] of Object.entries(ns)) {
    if (!s.on || !s.time) continue;
    const [h, m] = s.time.split(':').map(Number);
    const fire = new Date(now);
    fire.setHours(h, m, 0, 0);
    if (fire <= now) fire.setDate(fire.getDate() + 1);
    const delay = fire - now;
    const timer = setTimeout(() => {
      new Notification(LABELS[key], { body: BODIES[key], icon: './icon.svg' });
      scheduleNotifications(loadNotifSettings()); // reschedule for next day
    }, delay);
    window._notifTimers.push(timer);
  }
}

// ─── WEEKLY SUMMARY ───────────────────────────────────────────────────────────

function generateWeeklySummary() {
  const d = new Date();
  const dates = [];
  for (let i = 0; i < 7; i++) {
    dates.push(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`);
    d.setDate(d.getDate() - 1);
  }

  const withLogs = dates.filter(date => data[date]);
  if (!withLogs.length) { showToast('ไม่มีข้อมูล 7 วันที่ผ่านมา'); return; }

  const logs = withLogs.map(date => ({ date, ...data[date] }));

  const waterDays    = logs.filter(l => (l.water || 0) >= 6).length;
  const exerciseDays = logs.filter(l => l.exercise).length;
  const loggedDays   = logs.filter(l => l.morning?.mood > 0 || l.night?.energy > 0).length;

  const moods    = logs.map(l => l.morning?.mood).filter(Boolean);
  const energies = logs.map(l => l.night?.energy).filter(Boolean);
  const avgMood   = moods.length    ? (moods.reduce((a, b)    => a + b, 0) / moods.length).toFixed(1)    : '-';
  const avgEnergy = energies.length ? (energies.reduce((a, b) => a + b, 0) / energies.length).toFixed(1) : '-';

  const dateFrom = dates[dates.length - 1];
  const dateTo   = dates[0];

  const wakeLines = logs
    .filter(l => l.morning?.wakeTime)
    .map(l => `- ${l.date}: ตื่น ${l.morning.wakeTime}`)
    .join('\n');

  const sleepLines = logs
    .filter(l => l.night?.sleepTime)
    .map(l => `- ${l.date}: นอน ${l.night.sleepTime}`)
    .join('\n');

  const reflections = logs
    .filter(l => l.night?.reflection?.trim())
    .map(l => `- **${l.date}**: ${l.night.reflection.trim()}`)
    .join('\n');

  const md = [
    `# Weekly Summary`,
    `${dateFrom} — ${dateTo}`,
    ``,
    `## 📊 Overview`,
    `| | |`,
    `|---|---|`,
    `| 📝 บันทึกครบ | ${loggedDays}/${logs.length} วัน |`,
    `| 💧 น้ำ ≥6 แก้ว | ${waterDays}/${logs.length} วัน |`,
    `| 🏃 ออกกำลังกาย | ${exerciseDays}/${logs.length} วัน |`,
    `| 😊 Mood เฉลี่ย | ${avgMood}/5 |`,
    `| ⚡ Energy เฉลี่ย | ${avgEnergy}/5 |`,
    ``,
    `## ⏰ Wake & Sleep`,
    wakeLines  || '- ไม่มีข้อมูล',
    sleepLines || '',
    ``,
    `## 💭 Reflections`,
    reflections || '- ไม่มีข้อมูล',
  ].join('\n');

  if (navigator.share) {
    navigator.share({ title: `Weekly Summary ${dateFrom}`, text: md })
      .catch(() => _downloadLog(`weekly-${dateFrom}`, md));
  } else {
    _downloadLog(`weekly-${dateFrom}`, md);
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

async function init() {
  loadWords();
  data = loadData();
  renderHome();
  scheduleNotifications(loadNotifSettings());

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Drive sync on startup
  if (!isAuthorized()) { setSyncStatus('connect'); return; }
  if (isAuthorized()) {
    try {
      const token = await requestToken(true);
      const driveData = await driveLoad(token);
      if (driveData && typeof driveData === 'object') {
        const today = getToday();
        const todayLocal = data[today] ? JSON.parse(JSON.stringify(data[today])) : null;
        data = { ...driveData };
        if (todayLocal) {
          const driveToday = driveData[today];
          const localWater = todayLocal.water || 0;
          const driveWater = driveToday?.water || 0;
          data[today] = localWater >= driveWater ? todayLocal : (driveToday || todayLocal);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        renderHome();
      } else if (!driveData) {
        // First time — push local data to Drive
        await driveSave(token, data);
      }
      setSyncStatus('synced');
    } catch {
      setSyncStatus('connect'); // auth failed — show connect button so user can retry
    }
  }
}

function setSyncStatus(status) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.onclick = null;
  el.style.cursor = 'default';
  if (status === 'synced')  { el.textContent = '☁️';  el.title = 'ซิงค์แล้ว'; }
  else if (status === 'offline') { el.textContent = '📴'; el.title = 'ออฟไลน์'; }
  else if (status === 'connect') {
    el.textContent = '🔗';
    el.title = 'แตะเพื่อเชื่อมต่อ Google Drive';
    el.style.cursor = 'pointer';
    el.onclick = connectDrive;
  }
}

async function connectDrive() {
  setSyncStatus('offline');
  try {
    const token = await requestToken(false);
    const driveData = await driveLoad(token);
    if (driveData && typeof driveData === 'object') {
      const today = getToday();
      const todayLocal = data[today] ? JSON.parse(JSON.stringify(data[today])) : null;
      data = { ...driveData };
      if (todayLocal) {
        const driveToday = driveData[today];
        data[today] = (todayLocal.water || 0) >= (driveToday?.water || 0) ? todayLocal : (driveToday || todayLocal);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      renderHome();
    } else {
      await driveSave(token, data);
    }
    setSyncStatus('synced');
    showToast('☁️ เชื่อมต่อ Drive สำเร็จ');
  } catch {
    setSyncStatus('connect');
    showToast('เชื่อมต่อไม่สำเร็จ ลองอีกครั้ง');
  }
}

document.addEventListener('DOMContentLoaded', init);
